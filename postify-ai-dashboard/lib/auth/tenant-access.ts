import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, requiredId } from "@/lib/api/response";
import { ProfileMembership } from "@/models/profile-membership";
import { getSessionUser } from "./session";

export type TenantRole = "owner" | "admin" | "editor" | "viewer";

const roleWeight: Record<TenantRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export async function requireTenantAccess(profileId: unknown, minimumRole: TenantRole) {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Authentication is required.");
  const userId = requiredId(user.id, "session user");
  const tenantId = requiredId(profileId, "profileId");
  await connectToDatabase();
  const membership = await ProfileMembership.findOne({ userId, profileId: tenantId }).lean();
  if (!membership || roleWeight[membership.role as TenantRole] < roleWeight[minimumRole]) throw new ApiError(403, "You do not have permission to access this profile.");
  return { userId, profileId: tenantId, role: membership.role as TenantRole };
}