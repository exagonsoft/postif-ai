import { ApiError, errorResponse, optionalString, requiredId, requiredString, toJson } from "@/lib/api/response";
import { Post } from "@/models/post";
import { requireTenantAccess } from "@/lib/auth/tenant-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const access = await requireTenantAccess(query.get("profileId"), "viewer");
    return Response.json({ data: toJson(await Post.find({ profileId: access.profileId }).sort({ createdAt: -1 }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const status = body.status ?? "draft";
    if (!["draft", "scheduled", "publishing", "published", "partially_failed", "failed", "stopped", "canceled"].includes(status)) throw new ApiError(400, "status is invalid.");
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : undefined;
    if (scheduledFor && Number.isNaN(scheduledFor.valueOf())) throw new ApiError(400, "scheduledFor must be a valid date.");
    if (status === "scheduled" && !scheduledFor) throw new ApiError(400, "scheduledFor is required for scheduled posts.");
    const destinations = Array.isArray(body.destinations) ? body.destinations.map((destination: unknown) => {
      if (!destination || typeof destination !== "object") throw new ApiError(400, "destinations must contain valid entries.");
      const entry = destination as Record<string, unknown>;
      return { accountId: requiredId(entry.accountId, "destination.accountId"), platform: requiredString(entry.platform, "destination.platform"), content: optionalString(entry.content, "destination.content"), status: "pending" };
    }) : [];
    if (!destinations.length) throw new ApiError(400, "At least one destination is required.");
    const access = await requireTenantAccess(body.profileId, "editor");
    const post = await Post.create({ profileId: access.profileId, campaignId: body.campaignId ? requiredId(body.campaignId, "campaignId") : undefined, title: optionalString(body.title, "title"), contentHtml: requiredString(body.contentHtml, "contentHtml"), contentText: requiredString(body.contentText, "contentText"), media: Array.isArray(body.media) ? body.media : [], destinations, scheduledFor, timezone: requiredString(body.timezone, "timezone"), status });
    return Response.json({ data: toJson(post) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}