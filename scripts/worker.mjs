import { config } from "dotenv";
import { setTimeout } from "node:timers/promises";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
if (process.env.NODE_ENV === "production" && !process.argv.includes("--once")) throw new Error("The poller is for manual development only. In production, schedule authenticated POST /api/worker requests.");
if (!process.env.WORKER_SECRET || process.env.WORKER_SECRET.length < 32) throw new Error("Set WORKER_SECRET to at least 32 random characters.");
if (!process.env.APP_URL) throw new Error("APP_URL is required.");
const endpoint = new URL("/api/worker", process.env.APP_URL);
if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) throw new Error("Remote worker requests require HTTPS.");
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
do {
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${process.env.WORKER_SECRET}` }, signal: AbortSignal.timeout(35000) });
    console.log(new Date().toISOString(), response.ok ? await response.json() : `Worker returned HTTP ${response.status}`);
  } catch { console.error("Worker request failed. Check that the application is running."); }
  if (process.argv.includes("--once") || stopped) break;
  await setTimeout(30000);
} while (!stopped);
