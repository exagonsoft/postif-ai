import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDuePosts } from "@/lib/publishing-worker";
import { deliverNotifications } from "@/lib/notification-service";
import { refreshPendingMedia } from "@/lib/media-generation";
import { reconcileAutomaticPostMedia } from "@/lib/automatic-post-media";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) {
  const secret = process.env.WORKER_SECRET;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const media = await refreshPendingMedia();
    const preparedPosts = await reconcileAutomaticPostMedia();
    const processed = await processDuePosts();
    const notifications = await deliverNotifications();
    return NextResponse.json({ ok: true, processed, media, preparedPosts, notifications });
  } catch (error) {
    console.error("Worker failed", error);
    return NextResponse.json({ error: "Worker run failed." }, { status: 500 });
  }
}
