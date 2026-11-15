import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (body.action === "mark_all_read") {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.workspaceId, ctx.workspace.id));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "mark_read") {
      const id = Number(body.id);
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.workspaceId, ctx.workspace.id)
          )
        );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid notification action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Notification update failed" }, { status: 500 });
  }
}
