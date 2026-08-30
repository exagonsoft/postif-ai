import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, optionalString, requiredId, toJson } from "@/lib/api/response";
import { Post } from "@/models/post";
import { Profile } from "@/models/profile";
import { SocialAccount } from "@/models/social-account";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/profiles/[profileId]">) {
  try {
    const { profileId } = await context.params;
    const body = await request.json();
    const update = { name: optionalString(body.name, "name"), kind: body.kind === "personal" || body.kind === "business" ? body.kind : undefined, timezone: optionalString(body.timezone, "timezone") };
    await connectToDatabase();
    const profile = await Profile.findByIdAndUpdate(requiredId(profileId, "profileId"), { $set: update }, { new: true, runValidators: true }).lean();
    if (!profile) throw new ApiError(404, "Profile was not found.");
    return Response.json({ data: toJson(profile) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/profiles/[profileId]">) {
  try {
    const { profileId } = await context.params;
    const id = requiredId(profileId, "profileId");
    await connectToDatabase();
    if (await Post.exists({ profileId: id }) || await SocialAccount.exists({ profileId: id })) throw new ApiError(409, "Delete this profile's posts and accounts first.");
    const profile = await Profile.findByIdAndDelete(id).lean();
    if (!profile) throw new ApiError(404, "Profile was not found.");
    return Response.json({ data: toJson(profile) });
  } catch (error) { return errorResponse(error); }
}