import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { navigate } from "../../../routing/navigate";

export type BandMode = "desktop" | "tablet" | "phone";

const TABLET_QUERY = "(min-width: 768px) and (max-width: 1099px)";
const PHONE_QUERY = "(max-width: 767px)";

function readMode(): BandMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  if (window.matchMedia(PHONE_QUERY).matches) return "phone";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

/** The layout of the client page (Figma page 10): desktop ≥ 1100, tablet 768–1099, phone < 768. */
export function useBandMode(): BandMode {
  const [mode, setMode] = useState<BandMode>(readMode);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TABLET_QUERY)];
    const update = () => setMode(readMode());
    queries.forEach((query) => query.addEventListener?.("change", update));
    return () => queries.forEach((query) => query.removeEventListener?.("change", update));
  }, []);
  return mode;
}

/** A section of this page replaces the history entry: Back leaves the page instead of replaying tabs. */
export function replaceSection(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href, "replace");
}


/**
 * A small disclosure (contacts, more actions): the button says whether it is open, Escape and a
 * click elsewhere close it, and closing with Escape puts the focus back on the button.
 */
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };
  return { open, setOpen, rootRef, buttonRef, onKeyDown };
}
