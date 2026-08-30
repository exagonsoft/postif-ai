"use client";

import { Bold, FileImage, ImagePlus, Italic, Send, Sparkles, X } from "lucide-react";
import { ChangeEvent, RefObject } from "react";
import { PlatformSelector } from "./platforms";
import { Platform, PostStatus } from "./types";

type ComposerProps = {
  content: string;
  selectedPlatforms: Platform[];
  scheduledFor: string;
  attachmentName: string | null;
  editorRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  onContentChange: (content: string) => void;
  onTogglePlatform: (platform: Platform) => void;
  onScheduleChange: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerateImage: () => void;
  onGenerateText: () => void;
  onRemoveAttachment: () => void;
  onSave: (status: PostStatus) => void;
};

export function PostComposer({ content, selectedPlatforms, scheduledFor, attachmentName, editorRef, inputRef, onContentChange, onTogglePlatform, onScheduleChange, onUpload, onGenerateImage, onGenerateText, onRemoveAttachment, onSave }: ComposerProps) {
  return <section id="composer" className="border border-[#dad6cd] bg-[#fbfaf7] p-5 sm:p-6" aria-labelledby="composer-title">
    <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d75a34]">New publication</p><h2 id="composer-title" className="mt-1 font-serif text-2xl font-semibold">Create a post</h2></div><span className="rounded-full bg-[#f2ede4] px-2.5 py-1 text-xs font-semibold">Simulated</span></div>
    <p id="content-label" className="mt-5 block text-sm font-bold">Post content</p>
    <div className="mt-2 overflow-hidden rounded-lg border border-[#cfcac0] bg-white focus-within:border-[#577b74] focus-within:ring-2 focus-within:ring-[#bfd7d1]"><div className="flex gap-1 border-b border-[#e1ddd4] bg-[#f7f5f0] p-1.5"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("bold")} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[#e6e2d9]" aria-label="Bold selected text"><Bold size={14} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("italic")} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[#e6e2d9]" aria-label="Italicize selected text"><Italic size={14} /></button></div><div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="content-label" onInput={(event) => onContentChange(event.currentTarget.innerText)} className="min-h-30 p-3 text-sm leading-6 outline-none">{content}</div></div>
    <div className="mt-2 flex justify-between text-xs text-[#777269]"><span>Rich text preview ready for adaptation</span><span>{content.length} characters</span></div>
    <div className="mt-5 border-y border-[#e4e1da] py-4"><p className="text-sm font-bold">Publish to</p><PlatformSelector selected={selectedPlatforms} onToggle={onTogglePlatform} /></div>
    <div className="mt-4 flex flex-wrap gap-2"><input ref={inputRef} onChange={onUpload} type="file" accept="image/*,video/*" className="sr-only" /><button onClick={() => inputRef.current?.click()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#d2cec5] px-2.5 text-xs font-bold"><ImagePlus size={15} />Upload media</button><button onClick={onGenerateImage} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#d2cec5] px-2.5 text-xs font-bold"><Sparkles size={15} />Generate image</button><button onClick={onGenerateText} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#d2cec5] px-2.5 text-xs font-bold"><Sparkles size={15} />Generate text</button></div>
    {attachmentName && <div className="mt-3 flex items-center gap-2 rounded-md bg-[#f0eee9] px-2.5 py-2 text-xs font-semibold"><FileImage size={14} /><span className="truncate">{attachmentName}</span><button onClick={onRemoveAttachment} className="ml-auto" aria-label="Remove attachment"><X size={14} /></button></div>}
    <label className="mt-5 block text-sm font-bold" htmlFor="date">Publication date</label><input id="date" type="datetime-local" value={scheduledFor} onChange={(event) => onScheduleChange(event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-[#cfcac0] bg-white px-3 text-sm" /><p className="mt-1.5 text-xs text-[#777269]">America/Santo_Domingo · used by the future publishing cron.</p>
    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><button onClick={() => onSave("Draft")} className="min-h-10 rounded-lg border border-[#cfcac0] px-3 text-sm font-bold">Save draft</button><button onClick={() => onSave("Scheduled")} className="min-h-10 rounded-lg bg-[#3f726b] px-3 text-sm font-bold text-white">Schedule</button><button onClick={() => onSave("Published")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#e8673c] px-3 text-sm font-bold text-white"><Send size={15} />Send now</button></div>
  </section>;
}
