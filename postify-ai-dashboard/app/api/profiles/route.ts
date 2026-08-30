import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, requiredString, toJson } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { Profile } from "@/models/profile";
import { ProfileMembership } from "@/models/profile-membership";
import { User } from "@/models/user";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectToDatabase();
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Authentication is required.");
    const memberships = await ProfileMembership.find({ userId: user.id }).select("profileId").lean();
    return Response.json({ data: toJson(await Profile.find({ _id: { $in: memberships.map((membership) => membership.profileId) } }).sort({ createdAt: -1 }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Authentication is required.");
    const name = requiredString(body.name, "name");
    const kind = body.kind === "personal" ? "personal" : "business";
    const timezone = typeof body.timezone === "string" ? body.timezone : "America/Santo_Domingo";
    await connectToDatabase();
    const owner = await User.findById(user.id);
    if (!owner) throw new ApiError(401, "Session user was not found.");
    const profile = await Profile.create({ ownerId: owner._id, name, kind, timezone });
    await ProfileMembership.create({ profileId: profile._id, userId: owner._id, role: "owner" });
    return Response.json({ data: toJson(profile) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}