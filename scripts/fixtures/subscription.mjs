import { db } from "../../src/db/index.ts";
import { billingSubscriptions } from "../../src/db/billing-schema.ts";

export async function setTestSubscription(workspaceId, planSlug = "agency", paidThrough = new Date(Date.now() + 30 * 86400000)) {
  if (process.env.MONGO_TEST_DATABASE !== "true") throw new Error("Subscription fixtures are limited to the isolated test database.");
  await db.upsert(billingSubscriptions, "workspaceId", { workspaceId, planSlug, paidThrough }, { planSlug, paidThrough });
}
