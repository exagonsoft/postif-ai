import { getServerI18n } from "@/i18n/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import OnboardingWizard from "./OnboardingWizard";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { getFreePlan, getCatalogPlans } from "@/lib/billing-catalog";
import { privatePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getServerI18n();
  return privatePageMetadata(t("customer.text.108"));
}

export default async function OnboardingPage({ searchParams }: {
  searchParams: Promise<{ mode?: string }>;
}) {
  

  const createWorkspace = (await searchParams).mode === "create";
  const ctx = await getAuthContext();
  if (ctx?.user.systemRole === "operator") redirect("/app/admin");
  if (!ctx?.workspace) redirect(createWorkspace ? "/login?next=%2Fonboarding%3Fmode%3Dcreate" : "/login?next=/onboarding");
  if (!createWorkspace && ctx.memberRole !== "owner") redirect("/app");

  const [completed] = await db.find(auditLogs, {
    workspaceId: ctx.workspace.id,
    action: "onboarding.completed",
  }, { limit: 1 });
  if (!createWorkspace && completed) redirect("/app");
  const plan = createWorkspace ? await getFreePlan() : (await getWorkspaceEntitlements(ctx.workspace.id)).plan;
  const catalogPlans = await getCatalogPlans();

  return <OnboardingWizard
    workspaceId={ctx.workspace.id}
    createWorkspace={createWorkspace}
    initialWorkspaceName={createWorkspace ? "" : ctx.workspace.name}
    initialBrand={createWorkspace ? null : ctx.activeBrand}
    catalogPlans={catalogPlans}
    currentPlan={plan}
    initialAiBillingMode={!createWorkspace && ctx.workspace.aiBillingMode === "managed" ? "managed" : "byok"}
    allowedAiModes={plan.allowsConfigurableAiMode ? ["managed", "byok"] : [plan.defaultAiMode]}
  />;
}
