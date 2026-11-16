import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { hashPassword } from "./crypto";
import { validateAccountRegistration } from "./account-registration";
import { WorkflowError } from "./post-policy";

export async function createPlatformOperator(input: { name: string; email: string; password: string }, actor?: { id: number; email: string }) {
  const { name, email, password } = validateAccountRegistration(input);
  const passwordHash = hashPassword(password);
  return db.transaction(async tx => {
    if ((await tx.find(users, { email })).length) {
      throw new WorkflowError("This account already exists. Use trusted database access to review its platform role.", 409);
    }
    const [user] = await tx.insert(users, { name, email, passwordHash, systemRole: "operator", emailVerified: false });
    if (actor) await tx.insert(auditLogs, { workspaceId: null, actorEmail: actor.email, action: "admin.administrator_created",
      resourceType: "user", resourceId: String(user.id), metadata: { actorUserId: actor.id, systemRole: "operator" } });
    return { id: user.id };
  });
}
