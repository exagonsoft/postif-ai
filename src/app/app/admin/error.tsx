"use client";
import { useAppLanguage } from "@/i18n/provider";

export default function AdminError({ reset }: { reset: () => void }) {
  const { t } = useAppLanguage();
  return <div role="alert" className="surface-card rounded-3xl p-6">
    <h2 className="text-xl font-bold">{t("admin.error.title")}</h2>
    <p className="mt-3 text-sm">{t("admin.error.help")}</p>
    <button onClick={reset} className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">{t("admin.tryAgain")}</button>
  </div>;
}
