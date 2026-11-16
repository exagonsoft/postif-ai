"use client";
import { useAppLanguage } from "@/i18n/provider";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
export interface PostMedia { id: number; title: string; assetType: string; url: string; generationStatus: string; generationError?: string | null }

export function MediaPreview({ asset }: { asset: PostMedia }) {
  const { t } = useAppLanguage();
  const displayStatus = (value: string) => ["queued","processing","ready","failed","deleting","image","video","gif"].includes(value) ? t(`customer.status.${value}`) : value;

  if (asset.generationStatus === "deleting") return <p className="p-3 text-sm">{t("customer.text.532")}</p>;
  if (asset.generationStatus !== "ready") return <p className="p-3 text-sm">{asset.generationStatus === "failed" ? asset.generationError || t("customer.text.533") : t("customer.generationStatus", { status: displayStatus(asset.generationStatus) })}</p>;
  return asset.assetType === "video" ? <video src={asset.url} controls preload="metadata" className="max-h-64 w-full rounded-xl" /> : <Image unoptimized src={asset.url} alt={asset.title} width={1024} height={1024} className="max-h-64 w-full rounded-xl object-contain" />;
}

export function PostMediaPicker({ topic = "", selected, onChange, onAssets, libraryOnly = false, uploadOnly = false, canDelete = false }: { topic?: string; selected: number[]; onChange: (ids: number[]) => void; onAssets?: (assets: PostMedia[]) => void; libraryOnly?: boolean; uploadOnly?: boolean; canDelete?: boolean }) {
  const { t } = useAppLanguage();
  const displayStatus = (value: string) => ["queued","processing","ready","failed","deleting","image","video","gif"].includes(value) ? t(`customer.status.${value}`) : value;

  const [assets, setAssets] = useState<PostMedia[]>([]);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [ratio, setRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/media");
    if (!response.ok) throw new Error(t("customer.text.534"));
    const data = await response.json(); setAssets(data.assets); onAssets?.(data.assets);
  }, [onAssets, t]);
  useEffect(() => {
    let active = true;
    const poll = () => { if (active) refresh().catch(error => setMessage(error.message)); };
    poll(); const timer = setInterval(poll, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);
  async function upload(file: File) {
    setBusy(true); setMessage("");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(t("customer.text.535"));
      const capabilityResponse = await fetch("/api/media/upload/intents", { cache: "no-store" });
      const capability = await capabilityResponse.json();
      if (!capabilityResponse.ok) throw new Error(capability.error || t("customer.text.536"));
      let response: Response;
      if (capability.direct) {
        const intentResponse = await fetch("/api/media/upload/intents", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, byteSize: file.size }),
        });
        const intent = await intentResponse.json();
        if (!intentResponse.ok) throw new Error(intent.error || t("customer.text.537"));
        const form = new FormData();
        for (const [key, value] of Object.entries(intent.post.fields)) form.append(key, value as string);
        form.append("file", file);
        const uploaded = await fetch(intent.post.url, { method: "POST", body: form, credentials: "omit" });
        if (!uploaded.ok) {
          await fetch(`/api/media/upload/intents/${intent.intentId}`, { method: "DELETE" });
          throw new Error(t("customer.text.538"));
        }
        const complete = () => fetch(`/api/media/upload/intents/${intent.intentId}`, { method: "POST" });
        try { response = await complete(); }
        catch { response = await complete(); }
        // A lost completion response is safe to retry; the server returns the same asset.
        if (response.status >= 500) response = await complete();
      } else {
        response = await fetch("/api/media/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file });
      }
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (!libraryOnly) onChange([...selected, data.asset.id]);
      await refresh(); setMessage(libraryOnly ? t("customer.text.540") : t("customer.text.541"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("customer.text.542")); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt || topic, kind, aspectRatio: ratio }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await refresh(); setMessage(t("customer.text.543"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("customer.text.544")); }
    finally { setBusy(false); }
  }
  async function deleteAsset(asset: PostMedia) {
    if (!window.confirm(t("customer.deleteMedia", { title: asset.title }))) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", assetId: asset.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("customer.text.545"));
      onChange(selected.filter(id => id !== asset.id));
      await refresh(); setMessage(t("customer.text.546"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("customer.text.545")); }
    finally { setBusy(false); }
  }
  return <section className="surface-card space-y-4 rounded-3xl p-6">
    <h3 className="font-bold">{t("customer.text.548")}</h3>
    <label className="block text-sm">{t("customer.text.549")}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={busy || selected.length >= 10} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} className="mt-2 block w-full text-xs" />
    </label>
    {!uploadOnly && <><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={topic || t("customer.text.550")} maxLength={1000} rows={2} className="elevated-card w-full rounded-xl p-3 text-sm" />
    <div className="flex flex-wrap gap-3">
      <select aria-label={t("customer.text.551")} value={kind} onChange={event => { setKind(event.target.value as "image" | "video"); if (event.target.value === "video" && ratio === "1:1") setRatio("16:9"); }} className="elevated-card rounded-xl p-2"><option value="image">{t("customer.text.286")}</option><option value="video">{t("customer.text.553")}</option></select>
      <select aria-label={t("customer.text.554")} value={ratio} onChange={event => setRatio(event.target.value)} className="elevated-card rounded-xl p-2"><option value="16:9">{t("customer.text.555")}</option><option value="9:16">{t("customer.text.556")}</option>{kind === "image" && <option value="1:1">{t("customer.text.557")}</option>}</select>
      <button disabled={busy || !(prompt || topic).trim()} onClick={generate} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50">{t("customer.generateKind", { kind: displayStatus(kind) })}</button>
    </div>
    <p className="text-xs text-[var(--text-secondary)]">{t("customer.text.559")}</p></>}
    <p role="status" className="text-sm">{message}</p>
    <div className="grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2">{assets.map(asset => <div key={asset.id} className={`rounded-xl border p-3 ${selected.includes(asset.id) ? "border-violet-500" : "border-[var(--border-subtle)]"}`}>
      <MediaPreview asset={asset} />
      <label className="mt-2 block text-xs">{!libraryOnly && <input type="checkbox" className="mr-2" disabled={asset.generationStatus !== "ready" || (!selected.includes(asset.id) && selected.length >= 10)} checked={selected.includes(asset.id)} onChange={() => onChange(selected.includes(asset.id) ? selected.filter(id => id !== asset.id) : [...selected, asset.id])} />}{asset.title}</label>
      {libraryOnly && canDelete && <button type="button" disabled={busy || ["queued", "processing"].includes(asset.generationStatus)} onClick={() => void deleteAsset(asset)} className="mt-2 text-xs font-bold text-rose-400 disabled:opacity-50">{asset.generationStatus === "deleting" ? t("customer.text.560") : t("customer.text.561")}</button>}
    </div>)}</div>
  </section>;
}
