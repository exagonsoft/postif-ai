"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppLanguage } from "@/i18n/provider";

export type ImmediatePublishingJob = { id: number; platform: string; status: string; errorMessage: string | null };

export function ImmediatePublishingProgress({ job }: { job: ImmediatePublishingJob }) {
  const { t } = useAppLanguage();
  const router = useRouter();
  const [result, setResult] = useState(job);
  const [checkError, setCheckError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check_immediate", jobId: job.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("customer.publish.checkFailed"));
        if (typeof data.status !== "string") throw new Error(t("customer.publish.checkFailed"));
        if (!active) return;
        setResult({ ...job, status: data.status, errorMessage: data.errorMessage || null });
        if (["queued", "processing"].includes(data.status)) timer = setTimeout(() => void check(), 15000);
        else router.refresh();
      } catch (error) {
        if (active) setCheckError(error instanceof Error ? error.message : t("customer.publish.checkFailed"));
      }
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [job, router, t]);

  return <div role={checkError || ["failed", "blocked", "uncertain"].includes(result.status) ? "alert" : "status"} className="rounded-xl bg-slate-800 p-3 text-xs">
    <strong>{result.platform.toUpperCase()}</strong>{" · "}{t(`customer.status.${result.status}`)}
    {result.errorMessage && <p className="mt-1">{result.errorMessage}</p>}
    {checkError && <p className="mt-1">{t("customer.publish.checkFailed")} {checkError}</p>}
    {["queued", "processing"].includes(result.status) && <p className="mt-1">{t("customer.publish.pending")}</p>}
  </div>;
}
