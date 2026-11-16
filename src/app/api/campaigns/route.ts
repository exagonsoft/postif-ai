import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, posts, auditLogs, brands, workspaces } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import { getWorkspacePublishing } from "@/lib/workspace-publishing";
import { assertBrandEntitlement, assertFeature } from "@/lib/entitlements";
import { WorkflowError } from "@/lib/post-policy";
import { SOCIAL_PLATFORM_SPECS } from "@/lib/social-adapters";
import { campaignRequests } from "@/db/entitlement-schema";
import { hashToken } from "@/lib/crypto";

const platform = z.string().refine(value => Object.hasOwn(SOCIAL_PLATFORM_SPECS, value), "Unsupported platform.");
const input = z.object({
  action: z.enum(["create", "update_status", "delete"]),
  campaignId: z.number().int().positive().optional(),
  brandId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  objective: z.string().max(2000).optional(),
  audience: z.string().max(2000).optional(),
  platforms: z.array(platform).min(1).max(8).optional(),
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  strategySummary: z.string().max(20000).optional(),
  contentThemes: z.array(z.string().max(1000)).max(30).optional(),
  weeklyCadence: z.number().int().min(1).max(30).optional(),
  samplePosts: z.array(z.object({
    title: z.string().max(300), platform, content: z.string().max(20000),
    dayOffset: z.number().int().min(0).max(366),
  })).max(30).optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !ctx.activeBrand) throw new WorkflowError("Unauthorized", 401);
    if (!["owner", "admin", "editor", "approver"].includes(ctx.memberRole)) throw new WorkflowError("Campaign editing permission required.", 403);
    const body = input.parse(await req.json());
    const requestKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/).optional().parse(req.headers.get("Idempotency-Key") ?? undefined);
    const workspaceId = ctx.workspace.id;
    const result = await db.transaction(async tx => {
      await tx.find(workspaces, { id: workspaceId }, { lock: true });
      if (body.action !== "delete") await assertFeature(workspaceId, "campaigns", tx);
      if (body.action === "create") {
        const key = `${workspaceId}:${requestKey ?? crypto.randomUUID()}`;
        const inputHash = hashToken(JSON.stringify(body));
        const [previous] = await tx.find(campaignRequests, { key });
        if (previous) {
          if (previous.inputHash !== inputHash) throw new WorkflowError("This request key has already been used with different campaign data.", 409);
          const [campaign] = await tx.find(campaigns, { id: previous.campaignId, workspaceId });
          if (!campaign) throw new WorkflowError("This campaign was deleted. Start a new request to create another.", 409);
          return campaign;
        }
        const brandId = body.brandId ?? ctx.activeBrand.id;
        const [brand] = await tx.find(brands, { id: brandId, workspaceId });
        if (!brand) throw new WorkflowError("Brand not found in this workspace.", 404);
        await assertBrandEntitlement(workspaceId, brandId, tx);
        const { isTeamWorkspace } = await getWorkspacePublishing(workspaceId, tx);
        const platforms = body.platforms ?? ["linkedin", "x", "instagram"];
        if (body.samplePosts?.some(post => !platforms.includes(post.platform))) throw new WorkflowError("Campaign drafts must use a selected platform.");
        const [campaign] = await tx.insert(campaigns, {
          workspaceId, brandId, name: body.name || "Untitled Campaign",
          description: body.description || "", objective: body.objective || "Brand Awareness",
          audience: body.audience || brand.targetAudience, platforms, status: body.status || "active",
          startDate: body.startDate || new Date().toISOString().slice(0, 10),
          endDate: body.endDate || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
          strategySummary: body.strategySummary || "", contentThemes: body.contentThemes || [],
          weeklyCadence: body.weeklyCadence ?? 4, isSampleData: false,
        });
        for (const draft of body.samplePosts || []) {
          await tx.insert(posts, {
            workspaceId, brandId, campaignId: campaign.id, title: draft.title || "Campaign Post",
            topic: campaign.name, baseContent: draft.content, contentType: "Campaign Post", tone: brand.tone,
            status: "draft", requiresApproval: isTeamWorkspace,
            scheduledAt: new Date(Date.now() + Math.max(1, draft.dayOffset) * 86400000),
            platforms: [draft.platform],
            variants: { [draft.platform]: {
              content: draft.content, hashtags: brand.suggestedHashtags.slice(0, 3), cta: "",
              formatLabel: "Campaign Draft", characterCount: draft.content.length,
            } },
            createdByAgent: true,
          });
        }
        await tx.insert(auditLogs, { workspaceId, actorEmail: ctx.user.email, action: "campaign.created", resourceType: "campaign", resourceId: String(campaign.id), metadata: { name: campaign.name } });
        await tx.insert(campaignRequests, { key, workspaceId, campaignId: campaign.id, inputHash });
        return campaign;
      }
      if (!body.campaignId) throw new WorkflowError("Choose a campaign.");
      const filter = { id: body.campaignId, workspaceId };
      const [campaign] = await tx.find(campaigns, filter);
      if (!campaign) throw new WorkflowError("Campaign not found.", 404);
      if (body.action === "delete") {
        await tx.remove(campaigns, filter);
        return null;
      }
      const [updated] = await tx.update(campaigns, filter, { status: body.status || "active" });
      return updated;
    });
    return NextResponse.json({ ok: true, campaign: result });
  } catch (error) {
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid campaign." }, { status: 400 });
    console.error("Campaign operation failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Campaign operation failed." }, { status: 500 });
  }
}
