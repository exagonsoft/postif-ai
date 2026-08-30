import { requireTenantAccess } from "@/lib/auth/tenant-access";
import { ApiError, errorResponse, optionalString, requiredId, requiredString, toJson } from "@/lib/api/response";
import { Campaign } from "@/models/campaign";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/campaigns/[campaignId]">) {
  try {
    const { campaignId } = await context.params;
    const body = await request.json();
    const campaign = await Campaign.findById(requiredId(campaignId, "campaignId")).lean();
    if (!campaign) throw new ApiError(404, "Campaign was not found.");
    await requireTenantAccess(campaign.profileId.toString(), "editor");
    const update = { name: body.name === undefined ? undefined : requiredString(body.name, "name"), description: body.description === undefined ? undefined : optionalString(body.description, "description"), status: ["draft", "active", "archived"].includes(body.status) ? body.status : undefined, startsAt: body.startsAt === undefined ? undefined : body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt === undefined ? undefined : body.endsAt ? new Date(body.endsAt) : null };
    const updatedCampaign = await Campaign.findByIdAndUpdate(campaign._id, { $set: update }, { new: true, runValidators: true }).lean();
    return Response.json({ data: toJson(updatedCampaign) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/campaigns/[campaignId]">) {
  try {
    const { campaignId } = await context.params;
    const campaign = await Campaign.findById(requiredId(campaignId, "campaignId")).lean();
    if (!campaign) throw new ApiError(404, "Campaign was not found.");
    await requireTenantAccess(campaign.profileId.toString(), "admin");
    await Campaign.deleteOne({ _id: campaign._id });
    return Response.json({ data: toJson(campaign) });
  } catch (error) { return errorResponse(error); }
}