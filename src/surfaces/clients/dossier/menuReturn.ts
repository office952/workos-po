import { useEffect, useRef } from "react";

/**
 * A dialog opened from an item of a "⋯" menu: the item is gone once the menu closes, so the dialog
 * cannot give the focus back to it. `remember()` (called when the item is chosen) keeps the menu's
 * own button; when the dialog closes the focus goes back there instead of to the page.
 */
export function useMenuReturn(open: boolean, menu: string, toggle: string): () => void {
  const target = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open || !target.current) return;
    if (target.current.isConnected) target.current.focus({ preventScroll: true });
    target.current = null;
  }, [open]);
  return () => {
    const active = document.activeElement;
    target.current = active instanceof HTMLElement ? (active.closest(menu)?.querySelector<HTMLElement>(toggle) ?? null) : null;
  };
}
