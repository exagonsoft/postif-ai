"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
export interface PostMedia { id: number; title: string; assetType: string; url: string; generationStatus: string; generationError?: string | null }

export function MediaPreview({ asset }: { asset: PostMedia }) {
  if (asset.generationStatus === "deleting") return <p className="p-3 text-sm">Deletion pending. Retry deletion to finish.</p>;
  if (asset.generationStatus !== "ready") return <p className="p-3 text-sm">{asset.generationStatus === "failed" ? asset.generationError || "Generation failed" : `Generation ${asset.generationStatus}…`}</p>;
  return asset.assetType === "video" ? <video src={asset.url} controls preload="metadata" className="max-h-64 w-full rounded-xl" /> : <Image unoptimized src={asset.url} alt={asset.title} width={1024} height={1024} className="max-h-64 w-full rounded-xl object-contain" />;
}

export function PostMediaPicker({ topic = "", selected, onChange, onAssets, libraryOnly = false, uploadOnly = false, canDelete = false }: { topic?: string; selected: number[]; onChange: (ids: number[]) => void; onAssets?: (assets: PostMedia[]) => void; libraryOnly?: boolean; uploadOnly?: boolean; canDelete?: boolean }) {
  const [assets, setAssets] = useState<PostMedia[]>([]);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [ratio, setRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/media");
    if (!response.ok) throw new Error("Unable to load media.");
    const data = await response.json(); setAssets(data.assets); onAssets?.(data.assets);
  }, [onAssets]);
  useEffect(() => {
    let active = true;
    const poll = () => { if (active) refresh().catch(error => setMessage(error.message)); };
    poll(); const timer = setInterval(poll, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);
  async function upload(file: File) {
    setBusy(true); setMessage("");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Choose a file smaller than 50 MB.");
      const response = await fetch("/api/media/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (!libraryOnly) onChange([...selected, data.asset.id]);
      await refresh(); setMessage(libraryOnly ? "Upload saved to your media library." : "Upload attached to this post.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt || topic, kind, aspectRatio: ratio }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await refresh(); setMessage("Generation queued. You can leave this page; the completed media will appear in your library.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Generation failed."); }
    finally { setBusy(false); }
  }
  async function deleteAsset(asset: PostMedia) {
    if (!window.confirm(`Delete "${asset.title}" from the media library and storage?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", assetId: asset.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Media deletion failed.");
      onChange(selected.filter(id => id !== asset.id));
      await refresh(); setMessage("Media deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Media deletion failed."); }
    finally { setBusy(false); }
  }
  return <section className="surface-card space-y-4 rounded-3xl p-6">
    <h3 className="font-bold">Images & videos</h3>
    <label className="block text-sm">Upload an image or video (up to 50 MB)
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={busy || selected.length >= 10} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} className="mt-2 block w-full text-xs" />
    </label>
    {!uploadOnly && <><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={topic || "Describe the image or video you want to generate"} maxLength={1000} rows={2} className="elevated-card w-full rounded-xl p-3 text-sm" />
    <div className="flex flex-wrap gap-3">
      <select aria-label="Media type" value={kind} onChange={event => { setKind(event.target.value as "image" | "video"); if (event.target.value === "video" && ratio === "1:1") setRatio("16:9"); }} className="elevated-card rounded-xl p-2"><option value="image">Image</option><option value="video">Video (5 seconds)</option></select>
      <select aria-label="Media aspect ratio" value={ratio} onChange={event => setRatio(event.target.value)} className="elevated-card rounded-xl p-2"><option value="16:9">Landscape</option><option value="9:16">Portrait</option>{kind === "image" && <option value="1:1">Square</option>}</select>
      <button disabled={busy || !(prompt || topic).trim()} onClick={generate} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-50">Generate {kind}</button>
    </div>
    <p className="text-xs text-[var(--text-secondary)]">Images: 40 managed credits, or your OpenAI key. Videos: 120 managed credits. Failed generations return reserved credits. Your administrator must enable the media provider and background worker.</p></>}
    <p role="status" className="text-sm">{message}</p>
    <div className="grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2">{assets.map(asset => <div key={asset.id} className={`rounded-xl border p-3 ${selected.includes(asset.id) ? "border-violet-500" : "border-[var(--border-subtle)]"}`}>
      <MediaPreview asset={asset} />
      <label className="mt-2 block text-xs">{!libraryOnly && <input type="checkbox" className="mr-2" disabled={asset.generationStatus !== "ready" || (!selected.includes(asset.id) && selected.length >= 10)} checked={selected.includes(asset.id)} onChange={() => onChange(selected.includes(asset.id) ? selected.filter(id => id !== asset.id) : [...selected, asset.id])} />}{asset.title}</label>
      {libraryOnly && canDelete && <button type="button" disabled={busy || ["queued", "processing"].includes(asset.generationStatus)} onClick={() => void deleteAsset(asset)} className="mt-2 text-xs font-bold text-rose-400 disabled:opacity-50">{asset.generationStatus === "deleting" ? "Retry deletion" : "Delete"}</button>}
    </div>)}</div>
  </section>;
}
