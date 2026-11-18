import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { assertSocialMutationOrigin, managedSelectionInput, managedSocialErrorCode, readManagedSelection, reportLinkedInOAuthFailure, selectManagedDestination } from "@/lib/social-managed-oauth";
import { SocialProviderError } from "@/lib/social-provider";
import { WorkflowError } from "@/lib/post-policy";
import { withWorkerDeadline } from "@/lib/worker-network";
import { reportFacebookEntry, reportFacebookRejection } from "@/lib/facebook-oauth-diagnostics";
import { reportInstagramRejection } from "@/lib/instagram-oauth-diagnostics";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function GET(req: Request, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params;
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace || !["owner", "admin"].includes(ctx.memberRole)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
    return NextResponse.json(await readManagedSelection({ workspaceId: ctx.workspace.id, userId: ctx.user.id, platform,
      ticket: new URL(req.url).searchParams.get("ticket") || "" }), { headers });
  } catch (error) {
    if (platform === "linkedin") reportLinkedInOAuthFailure("selection", error);
    if (platform === "facebook") reportFacebookRejection("selection_read", managedSocialErrorCode(error));
    if (platform === "instagram") reportInstagramRejection("selection_read", managedSocialErrorCode(error, platform));
    return NextResponse.json({ code: managedSocialErrorCode(error, platform) }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400, headers });
  }
}
export async function POST(req: Request, context: { params: Promise<{ platform: string }> }) {
  return withWorkerDeadline(Date.now() + 20000, async () => {
    const { platform } = await context.params;
    if (platform === "facebook") reportFacebookEntry("selection_received");
    try {
      const ctx = await getAuthContext();
      if (!ctx?.workspace || !["owner", "admin"].includes(ctx.memberRole)) {
        if (platform === "facebook") reportFacebookRejection("selection_session", "FORBIDDEN");
        return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
      }
      assertSocialMutationOrigin(req, true);
      const body = managedSelectionInput.parse(await req.json());
      await selectManagedDestination({ ...body, workspaceId: ctx.workspace.id, userId: ctx.user.id, actorEmail: ctx.user.email, platform });
      return NextResponse.json({ ok: true }, { headers });
    } catch (error) {
      if (platform === "facebook") reportFacebookRejection("selection", managedSocialErrorCode(error));
      if (platform === "instagram") reportInstagramRejection("selection", managedSocialErrorCode(error, platform));
      return NextResponse.json({ code: managedSocialErrorCode(error, platform) }, { status: error instanceof SocialProviderError || error instanceof WorkflowError ? error.status : 400, headers });
    }
  });
}
