import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...["alert", "confirm", "prompt"].map(name => ({ name, message: "Use a custom dialog instead of a browser dialog." }))],
      "no-restricted-properties": ["error", ...["window", "self", "globalThis"].flatMap(object =>
        ["alert", "confirm", "prompt"].map(property => ({ object, property, message: "Use a custom dialog instead of a browser dialog." })))],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
