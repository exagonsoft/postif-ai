import { config } from "dotenv";
import "./register-ts.mjs";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const { validateRuntimeConfig } = await import("../src/lib/runtime-config.ts");
validateRuntimeConfig({ ...process.env, NODE_ENV: "production" });
console.log("Production environment configuration is valid. Provider access and deployment readiness still require verification.");
