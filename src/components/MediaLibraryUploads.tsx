"use client";
import { useState } from "react";
import { PostMediaPicker } from "./PostMediaPicker";
export function MediaLibraryUploads({ canManage }: { canManage: boolean }) {
  const [selected, setSelected] = useState<number[]>([]);
  return <PostMediaPicker libraryOnly canDelete={canManage} selected={selected} onChange={setSelected} />;
}
