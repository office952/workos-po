import type { MouseEvent } from "react";
import { describeDestination } from "./destination";
import { entryOrigin } from "./navigationMemory";

export type OriginBack = {
  href: string;
  text: string;
  /** Present when the origin is an entry of this tab: going back restores its tab, scroll and focus. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function capitalize(label: string): string {
  return `${label.charAt(0).toLocaleUpperCase("ro")}${label.slice(1)}`;
}

/**
 * N-018 · the way back names the page the reader came from and returns to that exact history
 * entry. After a direct link, a refresh in a new tab or an origin the page does not accept, it is
 * a plain link to the fallback. Origins are internal paths only (see `entryOrigin`).
 */
export function originBack(
  fallback: { href: string; label: string },
  accept: (originHref: string) => boolean = () => true,
): OriginBack {
  const origin = entryOrigin();
  if (!origin || !accept(origin.href)) {
    return { href: fallback.href, text: `← ${capitalize(fallback.label)}` };
  }
  return {
    href: origin.href,
    text: `← ${capitalize(describeDestination(origin.href))}`,
    onClick: (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.history.go(-origin.steps);
    },
  };
}

/** The path of an internal href, without its query. */
export function hrefPath(href: string): string {
  return new URL(href, window.location.origin).pathname;
}
