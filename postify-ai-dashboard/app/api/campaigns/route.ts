import { requireTenantAccess } from "@/lib/auth/tenant-access";
import { ApiError, errorResponse, optionalString, requiredString, toJson } from "@/lib/api/response";
import { Campaign } from "@/models/campaign";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const access = await requireTenantAccess(query.get("profileId"), "viewer");
    return Response.json({ data: toJson(await Campaign.find({ profileId: access.profileId }).sort({ createdAt: -1 }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const access = await requireTenantAccess(body.profileId, "editor");
    const status = body.status ?? "draft";
    if (!["draft", "active", "archived"].includes(status)) throw new ApiError(400, "status is invalid.");
    const campaign = await Campaign.create({ profileId: access.profileId, name: requiredString(body.name, "name"), description: optionalString(body.description, "description"), status, startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : undefined });
    return Response.json({ data: toJson(campaign) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}