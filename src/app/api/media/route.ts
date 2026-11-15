import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets, auditLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.workspace || !ctx.user || !ctx.activeBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const title = String(body.title || "Brand Visual Concept").trim();
      const prompt = String(body.prompt || "").trim();
      const aspectRatio = String(body.aspectRatio || "16:9");
      const assetType = String(body.assetType || "image");
      const brandPreset = String(body.brandPreset || "Nebula Violet");
      const tags = Array.isArray(body.tags)
        ? body.tags
        : String(body.tags || "Social, Brand")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      const generatedAltText =
        String(body.altText || "").trim() ||
        `${title} — ${aspectRatio} ${brandPreset} brand graphic for ${ctx.activeBrand.name}${
          prompt ? `: ${prompt.slice(0, 120)}` : ""
        }`;

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          workspaceId: ctx.workspace.id,
          brandId: ctx.activeBrand.id,
          title,
          prompt,
          assetType,
          aspectRatio,
          url: String(body.url || `preset://${brandPreset.toLowerCase().replace(/\s+/g, "-")}-${aspectRatio}`),
          tags,
          altText: generatedAltText,
          brandPreset,
          isSampleData: false,
        })
        .returning();

      await db.insert(auditLogs).values({
        workspaceId: ctx.workspace.id,
        actorEmail: ctx.user.email,
        action: "media_asset.created",
        resourceType: "media_asset",
        resourceId: String(asset.id),
      });

      return NextResponse.json({ ok: true, asset });
    }

    if (action === "update") {
      const assetId = Number(body.assetId);
      const [updated] = await db
        .update(mediaAssets)
        .set({
          aspectRatio: body.aspectRatio ? String(body.aspectRatio) : undefined,
          brandPreset: body.brandPreset ? String(body.brandPreset) : undefined,
          altText: body.altText !== undefined ? String(body.altText) : undefined,
        })
        .where(
          and(
            eq(mediaAssets.id, assetId),
            eq(mediaAssets.workspaceId, ctx.workspace.id)
          )
        )
        .returning();

      return NextResponse.json({ ok: true, asset: updated });
    }

    if (action === "delete") {
      const assetId = Number(body.assetId);
      await db
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, assetId),
            eq(mediaAssets.workspaceId, ctx.workspace.id)
          )
        );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid media action" }, { status: 400 });
  } catch (err) {
    console.error("Media API error:", err);
    return NextResponse.json({ error: "Media operation failed" }, { status: 500 });
  }
}
