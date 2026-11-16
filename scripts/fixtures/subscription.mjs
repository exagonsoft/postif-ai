import { db } from "../../src/db/index.ts";
import { billingSubscriptions } from "../../src/db/billing-schema.ts";
import { getPlanDefinition } from "../../src/lib/plans.ts";

export async function setTestSubscription(workspaceId, planSlug = "agency", paidThrough = new Date(Date.now() + 30 * 86400000)) {
  if (process.env.MONGO_TEST_DATABASE !== "true") throw new Error("Subscription fixtures are limited to the isolated test database.");
  const values = { planSlug, paidThrough, environment: "sandbox", planSnapshot: getPlanDefinition(planSlug), paypalSubscriptionId: `I-TEST${workspaceId}` };
  await db.upsert(billingSubscriptions, "workspaceId", { workspaceId, ...values }, values);
}
