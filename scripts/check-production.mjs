import nextEnvironment from "@next/env";
import "./register-ts.mjs";
try {
  process.env.NODE_ENV = "production";
  nextEnvironment.loadEnvConfig(process.cwd(), false);
  const { validateRuntimeConfig } = await import("../src/lib/runtime-config.ts");
  validateRuntimeConfig();
  console.log("Production environment configuration is valid. Provider access and deployment readiness still require verification.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production configuration validation failed.");
  process.exitCode = 1;
}
