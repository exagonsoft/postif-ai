import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, toJson } from "@/lib/api/response";
import { Post } from "@/models/post";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/posts/[postId]/sync">) {
  try {
    const { postId } = await context.params;
    await connectToDatabase();
    const post = await Post.findById(postId);
    if (!post) throw new ApiError(404, "Post was not found.");
    const syncedAt = new Date();
    post.destinations.forEach((destination) => {
      if (destination.status === "published") {
        const metrics = destination.metrics ?? {};
        destination.metrics = { likes: (metrics.likes ?? 0) + 1, comments: metrics.comments ?? 0, reach: (metrics.reach ?? 0) + 10, engagement: metrics.engagement ?? 0, syncedAt };
      }
    });
    await post.save();
    return Response.json({ data: toJson(post) });
  } catch (error) { return errorResponse(error); }
}