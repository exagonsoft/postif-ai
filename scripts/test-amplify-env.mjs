import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, unlink, rmdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { parse } from "dotenv";
import { serializeAmplifyEnvironment, writeAmplifyEnvironment } from "./prepare-amplify-env.mjs";
import { auditAmplifyEnvironment, assertEnvironmentPolicy, collectEnvironmentReferences, environmentPolicy } from "./audit-amplify-env.mjs";

const require = createRequire(import.meta.url);
const template = await readFile(resolve("env_sample"), "utf8");
const optionalOverrides = [...template.matchAll(/^\s*#\s*([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]);
assert.deepEqual([...Object.keys(parse(template)), ...optionalOverrides].sort(), [...environmentPolicy.runtime].sort(), "Active settings and documented optional overrides must match the reviewed environment policy");
const env = {
  APP_URL: "https://app.example.test", MONGODB_URI: "mongodb://example.test/isolated", MONGODB_DB: "isolated",
  ENCRYPTION_SECRET: "test-encryption-$MONGODB_DB-${UNSET}-configuration",
  WORKER_SECRET: "test-worker-configuration-that-is-not-production",
  MEDIA_STORAGE_PROVIDER: "s3", S3_MEDIA_REGION: "sa-east-1", S3_MEDIA_BUCKET: "example-media-test", S3_MEDIA_PREFIX: "media/",
  POSTIF_S3_ACCESS_KEY_ID: "isolated-s3-key", POSTIF_S3_SECRET_ACCESS_KEY: "isolated-s3-secret",
  MAIL_FROM: '"Example Support" <support@example.test>',
  SMTP_URL: "smtps://mailer:quoted'password@example.test:465",
  BILLING_ENABLED: "false",
  AWS_ACCESS_KEY_ID: "must-not-copy", AWS_SECRET_ACCESS_KEY: "must-not-copy", AWS_SESSION_TOKEN: "must-not-copy",
  UNRELATED_SECRET: "must-not-copy", NEXT_PUBLIC_SECRET: "must-not-copy",
};
const references = await auditAmplifyEnvironment();
assert.equal(Object.keys(references).length, environmentPolicy.runtime.length + environmentPolicy.platform.length);
const future = new Map(Object.entries(references));
future.set("FUTURE_PRIVATE_SETTING", ["src/future.ts"]);
assert.throws(() => assertEnvironmentPolicy(future), /Unclassified: FUTURE_PRIVATE_SETTING/);
assert.throws(() => assertEnvironmentPolicy(new Map(Object.entries(references)), ["src/future.ts:1"]), /Unresolved dynamic access: src\/future.ts:1/);
const patternsSource = `
  const { env: environment } = process;
  const alias = environment;
  const key = "STATIC_KEY";
  alias[key]; process["env"]["BRACKET_KEY"]; globalThis.process?.env.OPTIONAL_KEY;
  const { DESTRUCTURED_KEY: value } = process.env;
  function check(env: NodeJS.ProcessEnv = process.env) {
    for (const name of ["REQUIRED_KEY"]) env[name];
    env[externalInput];
  }
`;
const patterns = collectEnvironmentReferences(patternsSource);
assert.deepEqual(patterns.names, ["BRACKET_KEY", "DESTRUCTURED_KEY", "OPTIONAL_KEY", "REQUIRED_KEY", "STATIC_KEY"]);
assert.equal(patterns.dynamic[0].expression, "externalInput");
assert.deepEqual(collectEnvironmentReferences(patternsSource.replaceAll("\n", "\r\n")).dynamic.map(access => access.signature), patterns.dynamic.map(access => access.signature), "Reviewed signatures must survive Windows/Linux line endings");

const serialized = serializeAmplifyEnvironment({ ...env, FFMPEG_PATH: "", RUNWAY_API_KEY: "   " });
const parsed = parse(serialized);
assert.equal(parsed.MAIL_FROM, env.MAIL_FROM);
assert.equal(parsed.SMTP_URL, env.SMTP_URL);
assert.equal(parsed.POSTIF_S3_ACCESS_KEY_ID, env.POSTIF_S3_ACCESS_KEY_ID);
assert.equal(parsed.POSTIF_S3_SECRET_ACCESS_KEY, env.POSTIF_S3_SECRET_ACCESS_KEY);
assert.equal(parsed.FFMPEG_PATH, undefined);
assert.equal(parsed.RUNWAY_API_KEY, undefined);
assert.equal(new Set(Object.keys(parsed)).size, serialized.trim().split("\n").length);
assert.doesNotMatch(serialized, /must-not-copy/);
assert.equal(parsed.NODE_ENV, undefined);
assert.throws(() => serializeAmplifyEnvironment({ ...env, MONGODB_URI: "" }), /MONGODB_URI/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, S3_MEDIA_BUCKET: "" }), /S3_MEDIA_BUCKET/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, POSTIF_S3_SECRET_ACCESS_KEY: "" }), /POSTIF_S3_SECRET_ACCESS_KEY/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, MEDIA_STORAGE_PROVIDER: "local" }), /must use S3/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, APP_URL: "http://localhost:3000" }), /HTTPS on Amplify/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, WORKER_SECRET: "too-short" }), /32 characters/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, VAPID_PUBLIC_KEY: "incomplete" }), /VAPID/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, BILLING_ENABLED: "true" }), /billing configuration/);
assert.throws(() => serializeAmplifyEnvironment({ ...env, MAIL_FROM: "injected\nMONGODB_URI=other" }), /single-line/);
assert.equal(parse(serializeAmplifyEnvironment({ ...env, SMTP_URL: "   ", MAIL_FROM: "   " })).SMTP_URL, undefined);
assert.throws(() => serializeAmplifyEnvironment({ ...env, MAIL_FROM: "injected\0value" }), /single-line/);

const directory = await mkdtemp(join(tmpdir(), "postif-amplify-env-"));
const destination = join(directory, ".env.production");
try {
  await writeFile(destination, "OBSOLETE_ENTRY=remove-me\n");
  await writeAmplifyEnvironment(env, destination);
  await writeAmplifyEnvironment(env, destination);
  const contents = await readFile(destination, "utf8");
  assert.equal(contents, serialized);
  assert.doesNotMatch(contents, /OBSOLETE_ENTRY/);
  await assert.rejects(writeAmplifyEnvironment({ ...env, MONGODB_URI: "" }, destination), /MONGODB_URI/);
  assert.equal(await readFile(destination, "utf8"), contents, "Failed validation must not corrupt the previous file");
  assert.deepEqual(await readdir(directory), [".env.production"]);
  const startup = `
    require(${JSON.stringify(require.resolve("@next/env"))}).loadEnvConfig(process.cwd(), false);
    process.env.NEXT_RUNTIME = "nodejs";
    (async () => {
      const {pathToFileURL} = require("node:url");
      await import(pathToFileURL(${JSON.stringify(resolve("scripts", "register-ts.mjs"))}).href);
      const {register} = await import(pathToFileURL(${JSON.stringify(resolve("src", "instrumentation.ts"))}).href);
      await register();
      console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(parsed))}.map(key => [key, process.env[key]]))));
    })().catch(() => {console.error("Isolated instrumentation startup failed.");process.exitCode=1;});
  `;
  const childOptions = { cwd: directory, encoding: "utf8", env: { NODE_ENV: "production", ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) } };
  const child = spawnSync(process.execPath, ["-e", startup], childOptions);
  assert.equal(child.status, 0, child.stderr);
  const loaded = JSON.parse(child.stdout.trim());
  for (const key of Object.keys(parsed)) assert.equal(loaded[key], env[key], `${key} must survive Next.js loading, including dollar expansion`);
  for (const suffix of ["\\$NAME", "\\${NAME}", "\\\\$NAME", "\\n\\r", "'\"`", "#hash", "\"'`\\$NAME"]) {
    const value = "synthetic-encryption-value-with-padding-" + suffix;
    await writeFile(destination, serializeAmplifyEnvironment({ ...env, ENCRYPTION_SECRET: value }));
    const result = spawnSync(process.execPath, ["-e", startup], childOptions);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout.trim()).ENCRYPTION_SECRET, value);
  }
  const checkScript = resolve("scripts", "check-production.mjs");
  const productionCheck = spawnSync(process.execPath, [checkScript], childOptions);
  assert.equal(productionCheck.status, 0, productionCheck.stderr);
  const missing = spawnSync(process.execPath, [checkScript], { ...childOptions, env: { ...childOptions.env, MONGODB_URI: "" } });
  assert.equal(missing.status, 1, "An injected value must take precedence over dotenv files");
  assert.match(missing.stderr, /MONGODB_URI/);
  const malformed = spawnSync(process.execPath, [checkScript], { ...childOptions, env: { ...childOptions.env, SMTP_URL: "smtps://test-secret-marker@[" } });
  assert.equal(malformed.status, 1);
  assert.doesNotMatch(malformed.stderr, /test-secret-marker/, "URL errors must not print credential-bearing inputs");
} finally {
  await unlink(destination);
  await rmdir(directory);
}
const yaml = require("js-yaml").load(await readFile(resolve("amplify.yml"), "utf8"));
assert.equal(yaml.version, 1);
assert.equal(yaml.frontend.artifacts.baseDirectory, ".next");
assert.ok(yaml.frontend.phases.preBuild.commands.includes("npm ci"));
const commands = yaml.frontend.phases.build.commands;
assert.ok(commands.indexOf("node scripts/prepare-amplify-env.mjs") < commands.indexOf("npm run build"));
for (const command of ["npm run production:check", "npm run typecheck", "npm run lint", "npm test", "npm run build"]) assert.ok(commands.includes(command));
assert.deepEqual(yaml.frontend.cache.paths, [".next/cache/**/*", "node_modules/**/*"]);
console.log("Amplify environment checks passed: source-derived coverage, dynamic accesses, secret exclusion, atomic/repeatable writes, optional values, production guards, Next.js dollar-safe loading, isolated instrumentation startup and valid YAML. No provider or production database calls.");
