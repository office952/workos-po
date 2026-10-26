import type { MouseEvent } from "react";
import { navigate } from "../../../../routing/navigate";

/** In-app link: a plain click is a navigation of this tab (Back returns here); modified clicks stay the browser's. */
export function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href);
}
