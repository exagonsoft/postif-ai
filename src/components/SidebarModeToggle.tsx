"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAppLanguage } from "@/i18n/provider";

const STORAGE_KEY = "postifai-sidebar-mode";
const CHANGE_EVENT = "postif-sidebar-mode";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function snapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "icons";
}

export function useSidebarMode() {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  function toggleSidebar() {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "labels" : "icons");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { collapsed, toggleSidebar };
}

export function SidebarModeToggle({ collapsed, onToggle, controls }: {
  collapsed: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const { t } = useAppLanguage();
  const label = t(collapsed ? "common.sidebarShowLabels" : "common.sidebarIconsOnly");
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return <button type="button" onClick={onToggle} aria-label={label} title={label}
    aria-expanded={!collapsed} aria-controls={controls}
    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500">
    <Icon className="h-4 w-4" aria-hidden="true" />
  </button>;
}
