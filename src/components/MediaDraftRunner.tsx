"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppLanguage } from "@/i18n/provider";

export function MediaDraftRunner({ postId, disabled }: { postId: number; disabled: boolean }) {
  const { t } = useAppLanguage();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const advance = async () => {
      let continuePolling = true;
      try {
        const response = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "advance_media_draft", postId }) });
        const data = await response.json();
        if (!response.ok) {
          if (response.status < 500) continuePolling = false;
          throw new Error(data.error || t("customer.mediaDraft.checkFailed"));
        }
        if (!active) return;
        if (data.post.status !== "waiting_media") {
          continuePolling = false;
          setMessage(data.post.status === "draft" && data.post.mediaIds.includes(data.mediaAssetId) ? t("customer.mediaDraft.ready") : data.post.approvalNote || t("customer.mediaDraft.failed"));
          setRunning(false);
          router.refresh();
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : t("customer.mediaDraft.checkFailed"));
          if (!continuePolling) setRunning(false);
        }
      } finally {
        if (active && continuePolling) timer = setTimeout(() => void advance(), 5000);
      }
    };
    void advance();
    return () => { active = false; clearTimeout(timer); };
  }, [running, postId, router, t]);

  return <div className="mt-2">
    <button type="button" disabled={disabled || running} onClick={() => { setMessage(t("customer.mediaDraft.queued")); setRunning(true); }} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
      {running ? t("customer.mediaDraft.resuming") : t("customer.mediaDraft.resume")}
    </button>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>;
}
