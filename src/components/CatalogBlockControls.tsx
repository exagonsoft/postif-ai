"use client";

import type { RefObject } from "react";
import { useAppLanguage } from "@/i18n/provider";

export function CatalogBlockControls({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const { t } = useAppLanguage();
  function expandBlocks(expanded: boolean) {
    containerRef.current?.querySelectorAll<HTMLDetailsElement>("details").forEach(block => { block.open = expanded; });
  }
  const control = "min-h-10 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold hover:bg-violet-500/10";
  return <div role="group" aria-label={t("admin.blocks.visibility")} className="mt-4 flex flex-wrap gap-3">
    <button type="button" className={control} onClick={() => expandBlocks(true)}>{t("admin.blocks.expand")}</button>
    <button type="button" className={control} onClick={() => expandBlocks(false)}>{t("admin.blocks.collapse")}</button>
  </div>;
}
