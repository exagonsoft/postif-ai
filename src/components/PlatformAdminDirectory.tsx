import Link from "next/link";
import type { AdminDirectory } from "@/lib/platform-admin";
import { getServerI18n } from "@/i18n/server";
import { adminDate, adminLabel, adminStatus } from "@/app/app/admin/_display";

export async function PlatformAdminDirectory({ data, path, statuses = [] }: {
  data: AdminDirectory; path: string; statuses?: string[];
}) {
  const { t, formatDate, formatNumber } = await getServerI18n();
  function cell(key: string, value: string) {
    if (["createdAt", "paidThrough", "scheduled"].includes(key)) return adminDate(formatDate, t, value);
    if (["status", "interval"].includes(key)) return adminStatus(t, value);
    if (key === "verified") return t(value === "Yes" ? "admin.yes" : "admin.no");
    if (key === "error") return t(value === "None recorded" ? "admin.noneRecorded" : "admin.diagnostics");
    if (key === "access") return value.startsWith("Verified: ") ? t("admin.verifiedPlan", { name: value.slice(10) }) : t("admin.noPaidEvidence");
    if (key === "provider" && value === "Not linked") return t("admin.notLinked");
    if (key === "plan" && value === "No paid snapshot") return t("admin.noPaidSnapshot");
    return value;
  }
  const pageLink = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (data.query.q) params.set("q", data.query.q);
    if (data.query.status) params.set("status", data.query.status);
    return `${path}?${params}`;
  };
  return <section className="surface-card rounded-3xl p-5 sm:p-6">
    <form action={path} method="get" className="mb-5 flex flex-wrap gap-3">
      <input type="search" name="q" aria-label={t("admin.directory.searchRecords")} maxLength={120} defaultValue={data.query.q}
        placeholder={t("admin.directory.placeholder")} className="elevated-card min-w-56 flex-1 rounded-xl px-4 py-2 text-sm" />
      {statuses.length > 0 && <select name="status" aria-label={t("admin.directory.filter")} defaultValue={data.query.status} className="elevated-card rounded-xl px-3 py-2 text-sm">
        <option value="">{t("admin.directory.allStatuses")}</option>{statuses.map(status => <option key={status} value={status}>{adminStatus(t, status)}</option>)}
      </select>}
      <button type="submit" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">{t("admin.directory.search")}</button>
      <Link href={path} className="rounded-xl px-3 py-2 text-sm text-cyan-400">{t("admin.directory.reset")}</Link>
    </form>
    <p className="mb-3 text-xs text-[var(--text-muted)]">{t("admin.directory.count", { total: formatNumber(data.total), page: formatNumber(data.query.page), pages: formatNumber(data.pages) })}</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-[var(--border-subtle)]">
          <th className="px-3 py-3 text-xs">ID</th>
          {data.columns.map(column => <th key={column.key} className="px-3 py-3 text-xs">{adminLabel(t, column.label)}</th>)}
          <th className="px-3 py-3 text-xs">{t("admin.directory.details")}</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {data.rows.map(row => <tr key={row.id}>
            <td className="px-3 py-3 font-mono text-xs">#{row.id}</td>
            {data.columns.map(column => <td key={column.key} className="max-w-sm break-words px-3 py-3 text-xs">{cell(column.key, row.cells[column.key])}</td>)}
            <td className="px-3 py-3">{row.href && <Link href={row.href} className="text-xs font-semibold text-cyan-400">{t("admin.directory.view")}</Link>}</td>
          </tr>)}
          {!data.rows.length && <tr><td colSpan={data.columns.length + 2} className="px-3 py-8 text-center text-[var(--text-muted)]">{t("admin.directory.empty")}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mt-5 flex gap-4 text-sm">
      {data.query.page > 1 && <Link href={pageLink(data.query.page - 1)} className="text-cyan-400">{t("admin.previous")}</Link>}
      {data.query.page < data.pages && <Link href={pageLink(data.query.page + 1)} className="text-cyan-400">{t("admin.next")}</Link>}
    </div>
  </section>;
}
