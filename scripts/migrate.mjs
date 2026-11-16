import { config } from "dotenv";
import "./register-ts.mjs";
config({ path: ".env.local", quiet: true });
const { initializeDatabase, closeDatabase, db } = await import("../src/db/index.ts");
try {
  if(process.argv.includes("--check")) await db.ping();
  else await initializeDatabase();
  console.log("MongoDB connection/schema check completed.");
} finally { await closeDatabase(); }
