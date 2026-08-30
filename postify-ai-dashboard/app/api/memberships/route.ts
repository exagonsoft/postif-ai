import { requireTenantAccess } from "@/lib/auth/tenant-access";
import { ApiError, errorResponse, requiredId, toJson } from "@/lib/api/response";
import { ProfileMembership } from "@/models/profile-membership";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const access = await requireTenantAccess(query.get("profileId"), "admin");
    return Response.json({ data: toJson(await ProfileMembership.find({ profileId: access.profileId }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const access = await requireTenantAccess(body.profileId, "admin");
    const role = body.role ?? "viewer";
    if (!["owner", "admin", "editor", "viewer"].includes(role)) throw new ApiError(400, "role is invalid.");
    const membership = await ProfileMembership.findOneAndUpdate({ profileId: access.profileId, userId: requiredId(body.userId, "userId") }, { $set: { role } }, { upsert: true, new: true });
    return Response.json({ data: toJson(membership) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}