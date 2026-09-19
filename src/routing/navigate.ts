import { canonicalLocation } from "./appRoute";

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

export function navigate(href: string, mode: "push" | "replace" = "push"): void {
  const next = resolveAppHref(href);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) {
    return;
  }
  if (mode === "replace") {
    window.history.replaceState({}, "", next);
  } else {
    window.history.pushState({}, "", next);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
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
  if (anchor.hasAttribute("download")) {
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
  return `${url.pathname}${url.search}${url.hash}`;
}
