import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requirePlatformAdmin, updatePlatformFlag } from "@/lib/platform-admin";
import { createPlatformOperator } from "@/lib/operator-accounts";
import { WorkflowError } from "@/lib/post-policy";

function actionBody(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    const actor = requirePlatformAdmin(context);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 16384) throw new WorkflowError("Admin request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new WorkflowError("Invalid JSON."); }
    if (!actionBody(body)) throw new WorkflowError("Invalid admin action.");
    if (body.action === "create_admin") {
      if (Object.keys(body).some(key => !["action", "name", "email", "password"].includes(key)) ||
        typeof body.name !== "string" || typeof body.email !== "string" || typeof body.password !== "string") throw new WorkflowError("Invalid administrator fields.");
      const result = await createPlatformOperator({ name: body.name, email: body.email, password: body.password }, actor);
      return NextResponse.json({ ok: true, id: result.id });
    }
    if (body.action === "toggle_flag") {
      if (Object.keys(body).some(key => !["action", "flagId", "enabled", "expectedEnabled"].includes(key))) throw new WorkflowError("Invalid flag fields.");
      const flag = await updatePlatformFlag(context, { flagId: body.flagId, enabled: body.enabled, expectedEnabled: body.expectedEnabled });
      return NextResponse.json({ ok: true, flag });
    }
    throw new WorkflowError("Invalid admin action.");
  } catch (error) {
    console.error("Platform admin operation failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: error instanceof WorkflowError ? error.message : "Admin operation failed. Refresh the directory before retrying an uncertain creation." },
      { status: error instanceof WorkflowError ? error.status : 500 });
  }
}
