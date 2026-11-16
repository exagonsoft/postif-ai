import { NextResponse } from "next/server";
import { runWorkerSweep } from "@/lib/worker-orchestrator";
import { isWorkerAuthorized } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  if (!isWorkerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runWorkerSweep();
    return NextResponse.json(result, { status: result.ok ? 200 : 207, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Worker sweep could not complete.");
    return NextResponse.json({ error: "Worker run failed." }, { status: 500 });
  }
}
