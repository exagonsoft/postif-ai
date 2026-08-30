import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, optionalString, requiredId, requiredString, toJson } from "@/lib/api/response";
import { Post } from "@/models/post";
import { requireTenantAccess } from "@/lib/auth/tenant-access";

const editableStatuses = ["draft", "scheduled", "stopped", "canceled"];

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/posts/[postId]">) {
  try {
    const { postId } = await context.params;
    const body = await request.json();
    await connectToDatabase();
    const existingPost = await Post.findById(requiredId(postId, "postId")).lean();
    if (!existingPost) throw new ApiError(404, "Post was not found.");
    await requireTenantAccess(existingPost.profileId.toString(), "editor");
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = optionalString(body.title, "title");
    if (body.contentHtml !== undefined) update.contentHtml = requiredString(body.contentHtml, "contentHtml");
    if (body.contentText !== undefined) update.contentText = requiredString(body.contentText, "contentText");
    if (body.scheduledFor !== undefined) {
      const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
      if (scheduledFor && Number.isNaN(scheduledFor.valueOf())) throw new ApiError(400, "scheduledFor must be a valid date.");
      update.scheduledFor = scheduledFor;
    }
    if (body.status !== undefined) {
      if (!editableStatuses.includes(body.status)) throw new ApiError(400, "This status cannot be set manually.");
      update.status = body.status;
    }
    const post = await Post.findByIdAndUpdate(requiredId(postId, "postId"), { $set: update }, { new: true, runValidators: true }).lean();
    if (!post) throw new ApiError(404, "Post was not found.");
    return Response.json({ data: toJson(post) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/posts/[postId]">) {
  try {
    const { postId } = await context.params;
    await connectToDatabase();
    const id = requiredId(postId, "postId");
    const existingPost = await Post.findById(id).lean();
    if (!existingPost) throw new ApiError(404, "Post was not found.");
    await requireTenantAccess(existingPost.profileId.toString(), "admin");
    const post = await Post.findByIdAndDelete(id).lean();
    if (!post) throw new ApiError(404, "Post was not found.");
    return Response.json({ data: toJson(post) });
  } catch (error) { return errorResponse(error); }
}