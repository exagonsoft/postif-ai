import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { and, eq } from "@/db/filters";
type Connection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function getWorkspacePublishing(workspaceId: number, connection: Connection = db) {
    const [workspace] = await connection.find(workspaces, eq("id", workspaceId), {});
    if (!workspace)
        throw new Error("Workspace not found.");
    const members = await connection.find(workspaceMembers, and(eq("workspaceId", workspaceId), eq("status", "active")), { projection: { userId: 1 } });
    const users = new Set([workspace.ownerId, ...members.flatMap(member => member.userId === null ? [] : [member.userId])]);
    return { isTeamWorkspace: users.size > 1, ownerId: workspace.ownerId };
}
