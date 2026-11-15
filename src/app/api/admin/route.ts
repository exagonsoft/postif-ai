import { NextResponse } from "next/server";
import { db } from "@/db";
import { featureFlags, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.user || ctx.user.systemRole !== "operator") {
      return NextResponse.json(
        { error: "Operator authorization required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (body.action === "toggle_flag") {
      const flagId = Number(body.flagId);
      const enabled = Boolean(body.enabled);
      const [updated] = await db
        .update(featureFlags)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(featureFlags.id, flagId))
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace?.id ?? null,
        actorEmail: ctx.user.email,
        action: "admin.feature_flag_toggled",
        resourceType: "feature_flag",
        resourceId: updated?.key || String(flagId),
        metadata: { enabled },
      });

      return NextResponse.json({ ok: true, flag: updated });
    }

    return NextResponse.json({ error: "Invalid admin action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Admin operation failed" }, { status: 500 });
  }
}
