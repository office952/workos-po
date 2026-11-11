import { useEffect, useState } from "react";

/** docked: inspector in the existing În produs column; overlay: 360px side panel; full: phone page. */
export type CatalogInspectorLayout = "docked" | "overlay" | "full";

const OVERLAY_QUERY = "(max-width: 1023px)";
const FULL_QUERY = "(max-width: 767px)";

function resolveLayout(): CatalogInspectorLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "docked";
  if (window.matchMedia(FULL_QUERY).matches) return "full";
  if (window.matchMedia(OVERLAY_QUERY).matches) return "overlay";
  return "docked";
}

export function catalogInspectorCloseLabel(layout: CatalogInspectorLayout, componentLabel: string): string {
  return layout === "full" ? `‹ ${componentLabel}` : "Închide ×";
}

export function useCatalogInspectorLayout(): CatalogInspectorLayout {
  const [layout, setLayout] = useState<CatalogInspectorLayout>(resolveLayout);
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
