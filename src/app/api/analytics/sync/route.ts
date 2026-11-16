import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { syncSocialAnalytics } from "@/lib/social-lifecycle";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ error: "Owner or admin required." }, { status: 403 });
  if (!(await getWorkspaceEntitlements(ctx.workspace.id)).features.advancedAnalytics) return NextResponse.json({ error: "Provider analytics synchronization requires Pro or Agency. Recorded analytics remain readable on all plans." }, { status: 403 });
  try {
    const body = z.object({ accountId: z.number().int().positive().optional() }).parse(await req.json());
    if (body.accountId && !(await db.find(socialAccounts, { id: body.accountId, workspaceId: ctx.workspace.id })).length) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const result = await syncSocialAnalytics({ workspaceId: ctx.workspace.id, accountId: body.accountId, limit: 3, deadline: Date.now() + 20000 });
    return NextResponse.json({ ...result, ...(result.failed ? { error: "Some providers could not sync. Review per-account capability and sync status." } : {}) }, { status: result.failed ? 422 : result.skipped && !result.processed ? 409 : 200 });
  } catch { return NextResponse.json({ error: "Analytics synchronization failed. No estimated data was stored." }, { status: 400 }); }
}
