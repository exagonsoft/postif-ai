"use client";

import React from "react";
import { useAppLanguage } from "@/i18n/provider";
import Link from "next/link";
import Image from "next/image";

export function BrandLogo({
  href = "/",
  compact = false,
  showByline = false,
}: {
  href?: string;
  compact?: boolean;
  showByline?: boolean;
}) {
  const { t } = useAppLanguage();
  return (
    <Link href={href} className="group inline-flex items-center gap-3 focus:outline-none">
      <Image
        src="/icons/favico.png"
        alt={compact ? "POSTIF-AI" : ""}
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-violet-600/25 transition-transform group-hover:scale-105"
      />

      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-extrabold tracking-tight">
              POSTIF<span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">-AI</span>
            </span>
          </div>
          {showByline && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              {t("common.byline")}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
