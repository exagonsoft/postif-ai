import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getAdminDirectory, getFlagRegistry, getWorkerSummary, parseAdminQuery, type DirectoryKind } from "@/lib/platform-admin";
import { getAdminCatalog } from "@/lib/billing-catalog";
import { PlatformAdminDirectory } from "@/components/PlatformAdminDirectory";
import { PlatformWorkerSummary } from "@/components/PlatformWorkerSummary";
import { PlatformAdministratorsClient } from "@/components/PlatformAdministratorsClient";
import { BillingCatalogAdmin } from "@/components/BillingCatalogAdmin";
import { AdminConsoleClient } from "@/components/AdminConsoleClient";
import { WorkflowError } from "@/lib/post-policy";
import { getServerI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
const sections: Record<DirectoryKind, string> = {
  customers: "admin.sections.customers", workspaces: "admin.sections.workspaces", subscriptions: "admin.sections.subscriptions",
  operations: "admin.sections.operations", audit: "admin.sections.audit", admins: "admin.sections.admins",
};
function isDirectory(section: string): section is DirectoryKind { return Object.hasOwn(sections, section); }
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { t } = await getServerI18n();
  const { section } = await params;
  return { title: t(section === "catalog" ? "admin.sections.catalog" : isDirectory(section) ? sections[section] : "admin.overview.title") };
}
export default async function AdminSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerI18n();
  const actor = await getAuthContext();
  if (actor?.user.systemRole !== "operator") redirect("/app");
  const { section } = await params;
  if (section === "catalog") return <div className="space-y-6"><h1 className="text-3xl font-extrabold">{t("admin.sections.catalog")}</h1><BillingCatalogAdmin initialCatalog={await getAdminCatalog(actor)} /></div>;
  if (!isDirectory(section)) notFound();
  const result = await (async () => getAdminDirectory(actor, section, parseAdminQuery(await searchParams)))().then(data => ({ data })).catch(error => {
    if (!(error instanceof WorkflowError)) throw error;
    return { message: error.message };
  });
  if ("message" in result) return <div role="alert" className="surface-card rounded-2xl p-6">{t("admin.directory.invalidQuery")}</div>;
  const data = result.data;
  return <div className="space-y-6">
    <h1 className="text-3xl font-extrabold">{t(sections[section])}</h1>
    {section === "admins" && <PlatformAdministratorsClient />}
    {section === "operations" && <PlatformWorkerSummary workers={await getWorkerSummary(actor)} />}
    {section === "audit" && <AdminConsoleClient flags={await getFlagRegistry(actor)} />}
    {section === "subscriptions" && <p className="text-sm text-[var(--text-muted)]">{t("admin.sections.subscriptionHelp")}</p>}
    <PlatformAdminDirectory data={data} path={`/app/admin/${section}`} statuses={section === "subscriptions" ? ["ACTIVE", "CANCELLED", "SUSPENDED", "EXPIRED", "APPROVED", "APPROVAL_PENDING", "inactive"] :
      section === "operations" ? ["queued", "processing", "completed", "failed", "retrying", "uncertain", "cancelled"] : []} />
  </div>;
}
