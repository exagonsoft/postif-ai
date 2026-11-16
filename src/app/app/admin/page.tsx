import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getPlatformOverview } from "@/lib/platform-admin";
import { PLATFORM_ADMIN_NAV } from "@/lib/platform-admin-navigation";
import { PlatformWorkerSummary } from "@/components/PlatformWorkerSummary";
import { getServerI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getServerI18n();
  return { title: t("admin.overview.title") };
}
export default async function OperatorAdminConsolePage() {
  const { t, formatNumber } = await getServerI18n();
  const actor = await getAuthContext();
  if (actor?.user.systemRole !== "operator") redirect("/app");
  const overview = await getPlatformOverview(actor);
  const metrics = [
    [t("admin.overview.customers"), formatNumber(overview.customers)], [t("admin.overview.administrators"), formatNumber(overview.administrators)], [t("admin.overview.workspaces"), formatNumber(overview.tenants)],
    [t("admin.overview.channels"), formatNumber(overview.channels)], [t("admin.overview.subscriptions"), formatNumber(overview.paidSubscriptions)],
    [t("admin.overview.mrr"), formatNumber(overview.mrr, { style: "currency", currency: "USD" })], [t("admin.overview.queued"), formatNumber(overview.queued)],
    [t("admin.overview.failed"), formatNumber(overview.failed)], [t("admin.overview.aiRecords"), formatNumber(overview.aiRecords)],
  ];
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase text-rose-400">{t("admin.overview.internal")}</p>
      <h1 className="mt-2 text-3xl font-extrabold">{t("admin.overview.title")}</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("admin.overview.totals")} <strong>{overview.environment}</strong>. {t("admin.overview.help")}</p>
    </div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="surface-card rounded-2xl p-5">
      <p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-extrabold text-cyan-400">{value}</p>
    </div>)}</section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{PLATFORM_ADMIN_NAV.slice(1).map(item => <Link key={item.href} href={item.href} className="surface-card rounded-2xl p-5 text-sm font-bold hover:border-violet-500">{t(`admin.nav.${item.href.split("/").pop()}`)} →</Link>)}</section>
    <PlatformWorkerSummary workers={overview.workers} />
  </div>;
}
