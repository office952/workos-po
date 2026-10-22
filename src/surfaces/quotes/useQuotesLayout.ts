import { useEffect, useState } from "react";

/** docked: dossier beside the register; overlay: slides over it; full: takes the whole screen. */
export type QuotesLayout = "docked" | "overlay" | "full";

const OVERLAY_QUERY = "(max-width: 1151px)";
const FULL_QUERY = "(max-width: 767px)";

function resolveLayout(): QuotesLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "docked";
  if (window.matchMedia(FULL_QUERY).matches) return "full";
  if (window.matchMedia(OVERLAY_QUERY).matches) return "overlay";
  return "docked";
}

export function useQuotesLayout(): QuotesLayout {
  const [layout, setLayout] = useState<QuotesLayout>(resolveLayout);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const overlay = window.matchMedia(OVERLAY_QUERY);
    const full = window.matchMedia(FULL_QUERY);
    const sync = () => setLayout(resolveLayout());
    overlay.addEventListener("change", sync);
    full.addEventListener("change", sync);
    return () => {
      overlay.removeEventListener("change", sync);
      full.removeEventListener("change", sync);
    };
  }, []);
  return layout;
}
