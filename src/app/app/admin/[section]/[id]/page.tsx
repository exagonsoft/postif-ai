import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getAdminDetail, parseAdminId } from "@/lib/platform-admin";
import { WorkflowError } from "@/lib/post-policy";
import { getServerI18n } from "@/i18n/server";
import { adminDate, adminLabel, adminStatus } from "../../_display";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { t } = await getServerI18n();
  const { section } = await params;
  const titles: Record<string, string> = {
    customers: "admin.sections.customers", admins: "admin.sections.admins",
    workspaces: "admin.sections.workspaces", subscriptions: "admin.sections.subscriptions",
  };
  return { title: t(titles[section] ?? "admin.overview.title") };
}
export default async function AdminDetailPage({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { t, formatDate, formatNumber } = await getServerI18n();
  const actor = await getAuthContext();
  if (actor?.user.systemRole !== "operator") redirect("/app");
  const { section, id } = await params;
  if (section !== "customers" && section !== "admins" && section !== "workspaces" && section !== "subscriptions") notFound();
  let detail: Awaited<ReturnType<typeof getAdminDetail>>;
  try {
    detail = await getAdminDetail(actor, section, parseAdminId(id));
  } catch (error) {
    if (error instanceof WorkflowError && error.status === 404) notFound();
    throw error;
  }
  function fact(label: string, value: string) {
    if (label.endsWith("(UTC)")) return adminDate(formatDate, t, value);
    if (["Email verified", "Renewals stopped"].includes(label)) return t(value === "Yes" ? "admin.yes" : "admin.no");
    if (label === "Role") return t(value === "Customer" ? "admin.customer" : "admin.administrator");
    if (["Provider status", "Interval", "AI mode", "Environment"].includes(label)) return adminStatus(t, value);
    if (label === "Current paid access" && value === "No current paid evidence") return t("admin.noPaidEvidence");
    if (label === "Paid snapshot" && value === "None") return t("admin.none");
    if (["Active sessions", "Brands", "Connected channels", "Publishing jobs", "Stored credit balance"].includes(label)) return formatNumber(Number(value));
    if (label === "Owner" && value.startsWith("User #")) return t("admin.userRecord", { id: value.slice(6) });
    return value;
  }
  return <div className="space-y-6">
    <Link href={`/app/admin/${section}`} className="text-sm text-cyan-400">{t("admin.detail.back")}</Link>
    <h1 className="text-3xl font-extrabold">{section === "subscriptions" && detail.title === `Subscription record #${id}` ? t("admin.detail.subscriptionRecord", { id }) : detail.title}</h1>
    <p className="text-sm text-[var(--text-muted)]">{t(section === "workspaces" ? "admin.detail.workspaceHelp" : section === "subscriptions" ? "admin.detail.subscriptionHelp" : "admin.detail.accountHelp")}</p>
    <dl className="surface-card grid gap-5 rounded-3xl p-6 sm:grid-cols-2">{Object.entries(detail.facts).map(([label, value]) => <div key={label}>
      <dt className="text-xs text-[var(--text-muted)]">{adminLabel(t, label)}</dt><dd className="mt-2 break-words text-sm font-semibold">{fact(label, value)}</dd>
    </div>)}</dl>
    <section className="flex flex-wrap gap-3">{detail.links.map(link => <Link key={link.href} href={link.href} className="surface-card rounded-xl px-4 py-3 text-sm text-cyan-400">{section === "customers" || section === "admins" ? link.label : adminLabel(t, link.label)}</Link>)}</section>
    {"payments" in detail && detail.payments && <section className="surface-card overflow-x-auto rounded-3xl p-6">
      <h2 className="font-bold">{t("admin.detail.ledger")}</h2>
      <table className="mt-4 w-full text-left text-xs"><thead><tr><th className="p-2">{t("admin.detail.transaction")}</th><th className="p-2">{t("admin.detail.amount")}</th><th className="p-2">{t("admin.detail.payment")}</th><th className="p-2">{t("admin.detail.periodEnd")}</th><th className="p-2">{t("admin.detail.invalidated")}</th></tr></thead>
        <tbody>{detail.payments.map(payment => <tr key={payment.transaction}><td className="p-2">{payment.transaction}</td><td className="p-2">{payment.amount}</td><td className="p-2">{adminDate(formatDate, t, payment.time)}</td><td className="p-2">{adminDate(formatDate, t, payment.periodEnd)}</td><td className="p-2">{t(payment.invalidated ? "admin.yes" : "admin.no")}</td></tr>)}</tbody>
      </table>{!detail.payments.length && <p className="mt-4 text-sm">{t("admin.detail.noPayments")}</p>}
    </section>}
  </div>;
}
