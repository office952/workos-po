import { useRef } from "react";
import { navigate } from "./navigate";
import { currentEntryKey } from "./navigationMemory";

/**
 * N-018 · the preview history rule: the first open pushes one entry, opening another document in
 * the same preview replaces it, and closing goes back to the entry before the preview — only when
 * the reader is still on the entry the preview pushed; after a direct link, a refresh or other
 * navigation, closing replaces the entry instead, so the reader never leaves the page of origin.
 */
export function usePreviewHistory(href: (id: string | null) => string, openId: string | null) {
  const entry = useRef<string | null>(null);
  return {
    open(id: string): void {
      const first = !openId;
      navigate(href(id), first ? "push" : "replace");
      if (first) entry.current = currentEntryKey();
    },
    close(): void {
      if (entry.current && entry.current === currentEntryKey()) {
        entry.current = null;
        window.history.back();
        return;
      }
      entry.current = null;
      navigate(href(null), "replace");
    },
  };
}
