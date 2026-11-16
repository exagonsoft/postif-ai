import type { getWorkerSummary } from "@/lib/platform-admin";
import { getServerI18n } from "@/i18n/server";
import { adminDate, adminPhase, adminStatus } from "@/app/app/admin/_display";

export async function PlatformWorkerSummary({ workers }: { workers: Awaited<ReturnType<typeof getWorkerSummary>> }) {
  const { t, formatDate } = await getServerI18n();
  return <section className="surface-card rounded-3xl p-6">
    <h2 className="text-base font-bold">{t("admin.workers.title")}</h2>
    <p className="mt-2 text-xs text-[var(--text-muted)]">{t("admin.workers.help")}</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr><th className="p-2">{t("admin.workers.phase")}</th><th className="p-2">{t("admin.fields.status")}</th><th className="p-2">{t("admin.workers.started")}</th><th className="p-2">{t("admin.workers.heartbeat")}</th><th className="p-2">{t("admin.fields.error")}</th></tr></thead>
      <tbody>{workers.map(worker => <tr key={worker.id} className="border-t border-[var(--border-subtle)]">
        <td className="p-2">{adminPhase(t, worker.phase)}</td><td className="p-2">{adminStatus(t, worker.status)}</td><td className="p-2">{adminDate(formatDate, t, worker.startedAt)}</td>
        <td className="p-2">{adminDate(formatDate, t, worker.heartbeatAt)}</td><td className="p-2">{t(worker.errorRecorded ? "admin.diagnostics" : "admin.noneRecorded")}</td>
      </tr>)}</tbody>
    </table></div>
    {!workers.length && <p className="mt-4 text-sm text-[var(--text-muted)]">{t("admin.workers.empty")}</p>}
  </section>;
}
