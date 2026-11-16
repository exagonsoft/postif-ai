import { cookies } from "next/headers";
import { db } from "@/db";
import { users, sessions, workspaces, workspaceMembers, brands, } from "@/db/schema";
import { eq, gt, and } from "@/db/filters";
import { hashToken } from "./crypto";
import { getWorkspaceEntitlements } from "./entitlements";
export const SESSION_COOKIE_NAME = "postifai_session";
export async function getAuthContext() {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    let currentUser = null;
    let activeWorkspaceId: number | null = null;
    if (rawToken) {
        const tokenHash = hashToken(rawToken);
        const [session] = await db.find(sessions, and(eq("tokenHash", tokenHash), gt("expiresAt", new Date())), {});
        if (session) {
            const [foundUser] = await db.find(users, eq("id", session.userId), {});
            if (foundUser) {
                currentUser = foundUser;
                activeWorkspaceId = session.activeWorkspaceId ?? null;
            }
        }
    }
    if (!currentUser) {
        return null;
    }
    const memberships = await db.find(workspaceMembers, { userId: currentUser.id, status: "active" }, {});
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const userWorkspaces = await db.find(workspaces, { $or: [{ ownerId: currentUser.id }, { id: { $in: workspaceIds } }] });
    const selectedWorkspace = userWorkspaces.find((w) => w.id === activeWorkspaceId) ||
        userWorkspaces[0] ||
        null;
    if (!selectedWorkspace) {
        return {
            user: currentUser,
            workspace: null,
            workspaces: [],
            brands: [],
            activeBrand: null,
            memberRole: "owner",
        };
    }
    const workspaceBrands = await db.find(brands, eq("workspaceId", selectedWorkspace.id), {});
    const membership = memberships.find((m) => m.workspaceId === selectedWorkspace.id);
    const entitlement = await getWorkspaceEntitlements(selectedWorkspace.id);
    return {
        user: currentUser,
        workspace: { ...selectedWorkspace, planSlug: entitlement.plan.slug, aiBillingMode: entitlement.plan.allowsConfigurableAiMode ? selectedWorkspace.aiBillingMode : entitlement.plan.defaultAiMode },
        workspaces: userWorkspaces,
        brands: workspaceBrands,
        activeBrand: workspaceBrands[0] || null,
        memberRole: selectedWorkspace.ownerId === currentUser.id ? "owner" : entitlement.features.team && membership && ["admin", "editor", "approver", "viewer"].includes(membership.role) ? membership.role : "viewer",
    };
}
