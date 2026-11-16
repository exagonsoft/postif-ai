import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/node_modules/flat-i18n/dist/")) {
      const file = `${fileURLToPath(new URL(specifier, context.parentURL))}.js`;
      if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    if (specifier.startsWith("@/") || (specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL || ""))) {
      const target = specifier.startsWith("@/") ? path.resolve("src", specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      const file = [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")].find(file => /\.tsx?$/.test(file) && existsSync(file));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/i18n/translations.json")) return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
    if (/\.tsx?$/.test(url) && !url.includes("node_modules")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
