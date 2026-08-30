import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, optionalString, requiredId, toJson } from "@/lib/api/response";
import { Post } from "@/models/post";
import { SocialAccount } from "@/models/social-account";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/accounts/[accountId]">) {
  try {
    const { accountId } = await context.params;
    const body = await request.json();
    const update = { displayName: optionalString(body.displayName, "displayName"), handle: optionalString(body.handle, "handle"), status: ["connected", "expired", "revoked", "pending"].includes(body.status) ? body.status : undefined, scopes: Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown): scope is string => typeof scope === "string") : undefined };
    await connectToDatabase();
    const account = await SocialAccount.findByIdAndUpdate(requiredId(accountId, "accountId"), { $set: update }, { new: true, runValidators: true }).lean();
    if (!account) throw new ApiError(404, "Social account was not found.");
    return Response.json({ data: toJson(account) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/accounts/[accountId]">) {
  try {
    const { accountId } = await context.params;
    const id = requiredId(accountId, "accountId");
    await connectToDatabase();
    if (await Post.exists({ "destinations.accountId": id })) throw new ApiError(409, "Delete or update posts that use this account first.");
    const account = await SocialAccount.findByIdAndDelete(id).lean();
    if (!account) throw new ApiError(404, "Social account was not found.");
    return Response.json({ data: toJson(account) });
  } catch (error) { return errorResponse(error); }
}