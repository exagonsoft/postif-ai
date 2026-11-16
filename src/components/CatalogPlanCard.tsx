"use client";

import type { ReactNode } from "react";
import { Archive, Loader2, Pencil, RotateCcw, Upload } from "lucide-react";
import type { AdminCatalog } from "@/lib/billing-catalog";
import { useAppLanguage } from "@/i18n/provider";

type Props = {
  plan: AdminCatalog["plans"][number];
  product?: AdminCatalog["products"][number];
  currentVersion?: AdminCatalog["versions"][number];
  environment: AdminCatalog["environment"];
  busy: boolean;
  publishing: boolean;
  onPublish: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onConfigure?: () => void;
  children?: ReactNode;
};
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50";

export function CatalogPlanCard({ plan, product, currentVersion, environment, busy, publishing, onPublish, onEdit, onArchive, onConfigure, children }: Props) {
  const { t, formatNumber } = useAppLanguage();
  const free = plan.slug === "free";
  const environmentName = t(environment === "live" ? "admin.environment.live" : "admin.environment.sandbox");
  const changed = !currentVersion || currentVersion.draftRevision !== plan.revision || currentVersion.productRevision !== product?.revision;
  const blocked = plan.archived ? t("admin.card.restoreFirst")
    : plan.detailsUpdatingVersionId ? t("admin.card.retryDetailsFirst")
    : !product || product.archived ? t("admin.card.productFirst")
    : product.publishingVersionId && product.publishingVersionId !== plan.publishingVersionId ? t("admin.card.finishFirst")
    : "";
  const action = free ? t("admin.card.publishLocal")
    : t(plan.publishingVersionId ? "admin.card.retry" : !currentVersion ? "admin.card.setup" : changed ? "admin.card.publishRevision" : "admin.card.verify", { environment: environmentName });
  const status = t(plan.archived ? "admin.card.archived" : free ? "admin.card.localOnly"
    : plan.detailsUpdatingVersionId ? "admin.card.detailsPending"
    : plan.publishingVersionId ? "admin.card.publicationPending"
    : !currentVersion ? "admin.card.notLinked"
    : changed ? "admin.card.changes"
    : "admin.card.published", { environment: environmentName });
  const needsAttention = !plan.archived && !free && (!currentVersion || changed || !!plan.publishingVersionId || !!plan.detailsUpdatingVersionId);
  const helperId = `catalog-plan-${plan.id}-publication-help`;

  return <article aria-label={t("admin.card.planLabel", { name: plan.draft.name })} className="elevated-card rounded-2xl p-4 sm:p-5">
    <details>
      <summary className="cursor-pointer rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-violet-500">
        <h4 className="inline text-lg font-bold">{plan.draft.name}
          <span className={`ml-3 inline-block rounded-full border px-3 py-1 align-middle text-xs font-semibold ${needsAttention ? "border-amber-500/40 bg-amber-500/10 text-[var(--text-primary)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{status}</span>
          <span className="mt-2 block text-sm font-normal text-[var(--text-secondary)]">{free ? t("admin.card.free")
            : t("admin.price", { monthly: formatNumber(plan.draft.monthlyPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), annual: formatNumber(plan.draft.annualMonthlyPrice * 12, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</span>
        </h4>
      </summary>
    <div className="space-y-4 pt-4">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-[var(--text-muted)]">{t("admin.card.mongo", { slug: plan.slug, revision: plan.revision, product: product?.name ?? t("admin.card.missingProduct") })}</p>
        {plan.draft.description && <p className="text-sm text-[var(--text-secondary)]">{plan.draft.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className={secondaryButton} disabled={busy || !!plan.publishingVersionId || !!plan.detailsUpdatingVersionId} onClick={onEdit} aria-label={t("admin.card.editLabel", { name: plan.draft.name })}><Pencil size={15} aria-hidden="true" />{t("admin.card.edit")}</button>
          <button type="button" className={secondaryButton} disabled={busy || !!plan.publishingVersionId || !!plan.detailsUpdatingVersionId || free} onClick={onArchive} aria-label={t(plan.archived ? "admin.card.restoreLabel" : "admin.card.archiveLabel", { name: plan.draft.name })}>
            {plan.archived ? <RotateCcw size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{t(plan.archived ? "admin.restore" : "admin.archive")}
          </button>
          {!free && onConfigure && <button type="button" className={secondaryButton} disabled={busy || !!blocked} onClick={onConfigure}>{t("admin.card.useExisting")}</button>}
        </div>
      </div>
      <div className="w-full space-y-2 lg:max-w-sm">
        <button type="button" disabled={busy || !!blocked} aria-busy={publishing} aria-label={t("admin.card.actionLabel", { action, name: plan.draft.name })} aria-describedby={helperId} onClick={onPublish}
          className={free ? `${secondaryButton} min-h-12 w-full` : "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/20 transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"}>
          {publishing ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}
          {publishing ? t(free ? "admin.card.publishing" : "admin.card.processing") : action}
        </button>
        <p id={helperId} className={`text-xs ${blocked ? "text-rose-500" : "text-[var(--text-secondary)]"}`}>{blocked || (free
          ? t("admin.card.localHelp")
          : plan.publishingVersionId ? t("admin.card.resumeHelp")
          : !changed ? t("admin.card.verifyHelp")
          : !currentVersion ? t("admin.card.setupHelp")
          : t("admin.card.revisionHelp"))}</p>
      </div>
    </div>
    {children && <div className="border-t border-[var(--border-subtle)] pt-3">{children}</div>}
    </div>
    </details>
  </article>;
}
