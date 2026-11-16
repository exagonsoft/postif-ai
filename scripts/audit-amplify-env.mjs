import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import "./register-ts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const environmentPolicy = JSON.parse(await readFile(resolve(root, "config", "amplify-env.json"), "utf8"));

function property(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
}
function receiver(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node.expression : undefined;
}
function processObject(node) {
  return ts.isIdentifier(node) && node.text === "process" ||
    property(node) === "process" && ts.isIdentifier(receiver(node)) && receiver(node).text === "globalThis";
}
function processEnvironment(node) {
  return !!node && property(node) === "env" && processObject(receiver(node));
}

export function collectEnvironmentReferences(text, filename = "source.ts") {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const aliases = new Set();
  const constants = new Map();
  const names = new Set();
  const dynamic = [];
  const environment = node => !!node && (processEnvironment(node) || ts.isIdentifier(node) && aliases.has(node.text));
  function prepare(node) {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) &&
      (environment(node.initializer) || node.type?.getText(source) === "NodeJS.ProcessEnv")) aliases.add(node.name.text);
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        constants.set(node.name.text, node.initializer);
        if (environment(node.initializer)) aliases.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name) && processObject(node.initializer)) {
        for (const element of node.name.elements) if ((element.propertyName ?? element.name).getText(source) === "env" && ts.isIdentifier(element.name)) aliases.add(element.name.text);
      }
    }
    ts.forEachChild(node, prepare);
  }
  let previous;
  do {
    previous = aliases.size;
    prepare(source);
  } while (previous !== aliases.size);
  function constant(node) {
    if (!node) return;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && constants.has(node.text)) {
      const value = constants.get(node.text);
      if (ts.isStringLiteralLike(value)) return value.text;
    }
  }
  function visit(node) {
    if (environment(receiver(node))) {
      const name = property(node) ?? (ts.isElementAccessExpression(node) ? constant(node.argumentExpression) : undefined);
      if (name) names.add(name);
      else if (ts.isElementAccessExpression(node)) {
        let loop = node.parent;
        while (loop && !ts.isForOfStatement(loop)) loop = loop.parent;
        const key = node.argumentExpression.getText(source);
        if (loop && ts.isVariableDeclarationList(loop.initializer) &&
          loop.initializer.declarations.some(declaration => declaration.name.getText(source) === key) && ts.isArrayLiteralExpression(loop.expression) &&
          loop.expression.elements.every(element => ts.isStringLiteralLike(element))) {
          for (const element of loop.expression.elements) names.add(element.text);
        } else {
          let owner = node.parent;
          while (owner && !(ts.isFunctionDeclaration(owner) && owner.name)) owner = owner.parent;
          const signature = owner ? createHash("sha256").update(ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printNode(ts.EmitHint.Unspecified, owner, source)).digest("hex") : undefined;
          dynamic.push({ expression: key, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, owner: owner?.name.text, signature });
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && environment(node.initializer)) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken) dynamic.push({ expression: "environment rest binding", line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
        else names.add((element.propertyName ?? element.name).getText(source).replace(/^["']|["']$/g, ""));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { names: [...names].sort(), dynamic };
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(resolve(directory, entry.name)) :
    /\.(?:[cm]?js|tsx?)$/.test(entry.name) ? [resolve(directory, entry.name)] : []));
  return nested.flat();
}

export async function auditAmplifyEnvironment() {
  const files = [...await sourceFiles(resolve(root, "src")), resolve(root, "next.config.ts")];
  const references = new Map();
  const unresolved = [];
  for (const filename of files) {
    const text = await readFile(filename, "utf8");
    const path = relative(root, filename).split(sep).join("/");
    const result = collectEnvironmentReferences(text, filename);
    const names = new Set(result.names);
    for (const access of result.dynamic) {
      unresolved.push(`${path}:${access.line}`);
    }
    for (const name of names) references.set(name, [...references.get(name) ?? [], path]);
  }
  assertEnvironmentPolicy(references, unresolved);
  return Object.fromEntries([...references].sort(([left], [right]) => left.localeCompare(right)));
}

export function assertEnvironmentPolicy(references, unresolved = []) {
  const declared = [...environmentPolicy.runtime, ...environmentPolicy.platform];
  const invalid = declared.filter(name => !/^[A-Z][A-Z0-9_]*$/.test(name));
  const duplicate = declared.filter((name, index) => declared.indexOf(name) !== index);
  const unknown = [...references.keys()].filter(name => !declared.includes(name));
  const stale = declared.filter(name => !references.has(name));
  const unsafe = environmentPolicy.runtime.filter(name => /^(?:AWS_|NEXT_PUBLIC_)/.test(name));
  if (invalid.length || duplicate.length || unknown.length || stale.length || unsafe.length || unresolved.length) {
    throw new Error(`Environment policy audit failed. Invalid: ${invalid.join(", ")}. Duplicate: ${duplicate.join(", ")}. Unclassified: ${unknown.join(", ")}. Unused: ${stale.join(", ")}. Unsafe: ${unsafe.join(", ")}. Unresolved dynamic access: ${unresolved.join(", ")}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const references = await auditAmplifyEnvironment();
    for (const [name, files] of Object.entries(references)) console.log(`${name}: ${files.join(", ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Environment policy audit failed.");
    process.exitCode = 1;
  }
}
