"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, destructive = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      className="surface-card m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl p-6 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:p-8">
      <h2 id={titleId} className="text-xl font-extrabold">{title}</h2>
      <p id={descriptionId} className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      <div className="mt-7 flex flex-wrap justify-end gap-3">
        <button ref={cancelRef} type="button" onClick={onCancel}
          className="rounded-xl border border-[var(--border-subtle)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400">{cancelLabel}</button>
        <button type="button" onClick={onConfirm}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${destructive ? "bg-rose-600 hover:bg-rose-500 focus-visible:outline-rose-400" : "bg-violet-600 hover:bg-violet-500 focus-visible:outline-violet-400"}`}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
