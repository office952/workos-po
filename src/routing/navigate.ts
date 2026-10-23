import { canonicalLocation } from "./appRoute";
import { prepareNavigation } from "./navigationMemory";

export type AppLocation = {
  pathname: string;
  search: string;
};

export function readAppLocation(): AppLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

export function resolveAppHref(href: string): string {
  const url = new URL(href, window.location.origin);
  const rewritten = canonicalLocation(url.pathname, url.search);
  return rewritten ? `${rewritten}${url.hash}` : `${url.pathname}${url.search}${url.hash}`;
}

/**
 * A page with unsaved changes can hold navigation: the guard receives the destination and a
 * `proceed` callback, and returns true when it holds (for example to ask for confirmation).
 */
export type NavigationGuard = (destination: string, proceed: () => void) => boolean;

let guard: NavigationGuard | null = null;

export function setNavigationGuard(next: NavigationGuard): () => void {
  guard = next;
  return () => {
    if (guard === next) guard = null;
  };
}

export function activeNavigationGuard(): NavigationGuard | null {
  return guard;
}

export function navigate(href: string, mode: "push" | "replace" = "push", options: { bypassGuard?: boolean } = {}): void {
  const next = resolveAppHref(href);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) {
    return;
  }
  if (guard && !options.bypassGuard && guard(next, () => navigate(next, mode, { bypassGuard: true }))) {
    return;
  }
  const state = prepareNavigation(next, mode);
  if (mode === "replace") {
    window.history.replaceState(state, "", next);
  } else {
    window.history.pushState(state, "", next);
  }
  const event = new PopStateEvent("popstate", { state });
  (event as PopStateEvent & { workosNavigate?: boolean }).workosNavigate = true;
  window.dispatchEvent(event);
}

export function sameOriginNavigation(
  anchor: HTMLAnchorElement,
  event: MouseEvent,
): string | null {
  if (event.defaultPrevented || event.button !== 0) {
    return null;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  if (anchor.target && anchor.target !== "_self") {
    return null;
  }
  if (anchor.hasAttribute("download") || anchor.hasAttribute("data-authenticated-download")) {
    return null;
  }
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) {
    return null;
  }
  const url = new URL(anchor.href, window.location.origin);
  if (url.origin !== window.location.origin) {
    return null;
  }
  if (url.pathname.startsWith("/api/") && url.pathname.endsWith("/download")) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
