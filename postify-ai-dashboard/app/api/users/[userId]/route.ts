import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, optionalString, requiredId, toJson } from "@/lib/api/response";
import { Profile } from "@/models/profile";
import { User } from "@/models/user";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/users/[userId]">) {
  try {
    const { userId } = await context.params;
    const body = await request.json();
    const update = { name: optionalString(body.name, "name"), role: body.role === "member" ? "member" : body.role === "owner" ? "owner" : undefined };
    await connectToDatabase();
    const user = await User.findByIdAndUpdate(requiredId(userId, "userId"), { $set: update }, { new: true, runValidators: true }).lean();
    if (!user) throw new ApiError(404, "User was not found.");
    return Response.json({ data: toJson(user) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/users/[userId]">) {
  try {
    const { userId } = await context.params;
    const id = requiredId(userId, "userId");
    await connectToDatabase();
    if (await Profile.exists({ ownerId: id })) throw new ApiError(409, "Delete this user's profiles first.");
    const user = await User.findByIdAndDelete(id).lean();
    if (!user) throw new ApiError(404, "User was not found.");
    return Response.json({ data: toJson(user) });
  } catch (error) { return errorResponse(error); }
}