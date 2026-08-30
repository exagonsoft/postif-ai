import { ApiError, errorResponse, optionalString, requiredString, toJson } from "@/lib/api/response";
import { SocialAccount } from "@/models/social-account";
import { requireTenantAccess } from "@/lib/auth/tenant-access";

const providers = ["instagram", "facebook", "linkedin", "pinterest", "x", "youtube"] as const;
type Provider = typeof providers[number];

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const access = await requireTenantAccess(query.get("profileId"), "viewer");
    return Response.json({ data: toJson(await SocialAccount.find({ profileId: access.profileId }).sort({ createdAt: -1 }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const platformInput = requiredString(body.platform, "platform").toLowerCase();
    if (!providers.includes(platformInput as Provider)) throw new ApiError(400, "platform is not supported.");
    const platform = platformInput as Provider;
    const access = await requireTenantAccess(body.profileId, "editor");
    const profileId = access.profileId;
    const destinationId = requiredString(body.destinationId, "destinationId");
    const accountData = { displayName: requiredString(body.displayName, "displayName"), handle: optionalString(body.handle, "handle"), status: body.status === "pending" ? "pending" : "connected", scopes: Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown): scope is string => typeof scope === "string") : [] };
    await SocialAccount.updateOne({ profileId, platform, destinationId }, { $set: accountData }, { upsert: true });
    const savedAccount = await SocialAccount.findOne({ profileId, platform, destinationId }).lean();
    return Response.json({ data: toJson(savedAccount) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}