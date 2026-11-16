import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getAuthContext } from "@/lib/auth";
import OnboardingWizard from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const createWorkspace = (await searchParams).mode === "create";
  const ctx = await getAuthContext();
  if (!ctx?.workspace) redirect(createWorkspace ? "/login?next=%2Fonboarding%3Fmode%3Dcreate" : "/login?next=/onboarding");
  if (!createWorkspace && ctx.memberRole !== "owner") redirect("/app");

  const [completed] = await db.find(auditLogs, {
    workspaceId: ctx.workspace.id,
    action: "onboarding.completed",
  }, { limit: 1 });
  if (!createWorkspace && completed) redirect("/app");

  return <OnboardingWizard
    workspaceId={ctx.workspace.id}
    createWorkspace={createWorkspace}
    initialWorkspaceName={createWorkspace ? "" : ctx.workspace.name}
    initialBrand={createWorkspace ? null : ctx.activeBrand}
    initialAiBillingMode={!createWorkspace && ctx.workspace.aiBillingMode === "managed" ? "managed" : "byok"}
  />;
}
