import "./register-ts.mjs";
import { config } from "dotenv";
import { stdin, stdout } from "node:process";
import { createOperatorPrompts } from "./operator-prompts.mjs";

if (process.argv.includes("--help")) {
  console.log("Create a platform operator account only, with no workspace or brand.");
  console.log("Usage: npm run admin:create (interactive terminal; password input is hidden).");
  console.log("Configure MongoDB and initialize schema first. Existing accounts are never overwritten or promoted.");
} else {
  config({ path: ".env.local", quiet: true });
  const { createPlatformOperator } = await import("../src/lib/operator-accounts.ts");
  const { validateAccountRegistration } = await import("../src/lib/account-registration.ts");
  const { WorkflowError } = await import("../src/lib/post-policy.ts");
  const { getMongoDatabase, closeDatabase } = await import("../src/db/index.ts");
  let prompts;
  try {
    if (!stdin.isTTY || !stdout.isTTY) throw new WorkflowError("Run admin:create in an interactive terminal. Do not pass passwords in arguments or environment variables.");
    if (!process.env.MONGODB_URI?.trim() || !process.env.MONGODB_DB?.trim()) throw new WorkflowError("Configure MONGODB_URI and MONGODB_DB first.");
    prompts = createOperatorPrompts(stdin, stdout);
    const question = (label, secret = false) => prompts.question(label, secret);
    const name = await question("Administrator name: ");
    const email = await question("Administrator email: ");
    const password = await question("Password (at least 12 characters): ", true);
    if (password !== await question("Confirm password: ", true)) throw new WorkflowError("Passwords do not match.");
    validateAccountRegistration({ name, email, password });
    const confirmation = await question("Create this account in the configured MongoDB database? Type CREATE OPERATOR: ");
    if (confirmation !== "CREATE OPERATOR") throw new WorkflowError("Cancelled. No account was created.");
    const database = await getMongoDatabase();
    const indexes = await database.collection("users").listIndexes().toArray();
    for (const field of ["id", "email"]) {
      if (!indexes.some(index => index.unique && Object.keys(index.key).length === 1 && index.key[field] === 1)) {
        throw new WorkflowError("Initialize collection indexes with npm run db:init before creating an operator.");
      }
    }
    await createPlatformOperator({ name, email, password });
    console.log("Platform operator created without a workspace or brand. Sign in and open /app/admin.");
  } catch (error) {
    console.error(error instanceof WorkflowError ? error.message :
      error instanceof Error && error.name === "AbortError" ? "Cancelled. No account was created." :
      "Operator creation failed. Verify MongoDB access and initialized schema; no credentials are logged.");
    process.exitCode = 1;
  } finally {
    prompts?.close();
    try { await closeDatabase(); }
    catch { console.error("MongoDB connection cleanup failed."); process.exitCode = 1; }
  }
}
