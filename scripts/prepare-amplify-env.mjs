import { writeFile, chmod, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { auditAmplifyEnvironment, environmentPolicy } from "./audit-amplify-env.mjs";
const { validateRuntimeConfig } = await import("../src/lib/runtime-config.ts");

export function serializeAmplifyEnvironment(env) {
  const allowed = Object.fromEntries(environmentPolicy.runtime.filter(key => env[key]?.trim()).map(key => [key, env[key]]));
  if (allowed.MEDIA_STORAGE_PROVIDER !== "s3") throw new Error("Amplify permanent media storage must use S3.");
  try { validateRuntimeConfig({ ...allowed, NODE_ENV: "production" }); }
  catch (error) { throw new Error(`SSR configuration validation failed: ${error instanceof Error ? error.message : "invalid configuration"}`); }
  if (new URL(allowed.APP_URL).protocol !== "https:") throw new Error("APP_URL must use HTTPS on Amplify.");
  return Object.entries(allowed).map(([key, value]) => {
    if (/[\r\n\0]/.test(value)) throw new Error(`${key} must be a single-line environment value.`);
    const encoded = value.replaceAll("$", "\\$");
    for (const quote of ["'", "`", '"', ""]) {
      if (quote && encoded.includes(quote)) continue;
      const line = `${key}=${quote}${encoded}${quote}`;
      if (parse(line)[key] === encoded) return line;
    }
    throw new Error(`${key} cannot be represented safely in the SSR environment file.`);
  }).join("\n") + "\n";
}

export async function writeAmplifyEnvironment(env, destination = resolve(".env.production")) {
  await auditAmplifyEnvironment();
  const contents = serializeAmplifyEnvironment(env);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
    await chmod(destination, 0o600);
  } finally {
    try { await unlink(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.AWS_APP_ID || !process.env.AWS_BRANCH) throw new Error("This command is only for an Amplify build environment.");
    await writeAmplifyEnvironment(process.env);
    console.log("Prepared audited SSR configuration. Values were not logged; AWS platform credentials were not copied.");
    console.log("Security: the deployment artifact contains server secrets. Restrict build/artifact access and retention.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "SSR environment preparation failed.");
    process.exitCode = 1;
  }
}
