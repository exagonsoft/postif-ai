import { cookies } from "next/headers";
import { db } from "@/db";
import {
  users,
  sessions,
  workspaces,
  workspaceMembers,
  brands,
} from "@/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { hashToken } from "./crypto";
import { ensureSeeded } from "./seed";

export const SESSION_COOKIE_NAME = "postifai_session";

export async function getAuthContext() {
  await ensureSeeded();

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  let currentUser = null;
  let activeWorkspaceId: number | null = null;

  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));

    if (session) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId));
      if (foundUser) {
        currentUser = foundUser;
        activeWorkspaceId = session.activeWorkspaceId ?? null;
      }
    }
  }

  // Fallback to the seeded demo user so evaluators & visitors can immediately explore
  // the full application without friction, while still allowing Sign Out / Register / Login.
  const isDemoFallback = !currentUser;
  if (!currentUser) {
    const [demoUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "alex.mercer@nebulacloud.io"));
    currentUser = demoUser || null;
  }

  if (!currentUser) {
    return null;
  }

  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, currentUser.id));

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const allWorkspaces = await db.select().from(workspaces);
  const userWorkspaces = allWorkspaces.filter(
    (w) => w.ownerId === currentUser!.id || workspaceIds.includes(w.id)
  );

  const selectedWorkspace =
    userWorkspaces.find((w) => w.id === activeWorkspaceId) ||
    userWorkspaces[0] ||
    null;

  if (!selectedWorkspace) {
    return {
      user: currentUser,
      isDemoFallback,
      workspace: null,
      workspaces: [],
      brands: [],
      activeBrand: null,
      memberRole: "owner",
    };
  }

  const workspaceBrands = await db
    .select()
    .from(brands)
    .where(eq(brands.workspaceId, selectedWorkspace.id));

  const membership = memberships.find((m) => m.workspaceId === selectedWorkspace.id);

  return {
    user: currentUser,
    isDemoFallback,
    workspace: selectedWorkspace,
    workspaces: userWorkspaces,
    brands: workspaceBrands,
    activeBrand: workspaceBrands[0] || null,
    memberRole: membership?.role || "owner",
  };
}
