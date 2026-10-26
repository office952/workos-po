import { clientHref } from "../../../routing/appRoute";
import { hrefPath, originBack, type OriginBack } from "../../../routing/originBack";

/**
 * N-020 etapa 7 · the way back to Sedii (712:22460 Istoric, 712:22814 Lucrări, 719:75304 Documente,
 * 712:23047 Fotografii). Shown only when the reader really came from the Sedii section of this
 * client (the origin of this history entry, kept across the previews opened on the same page) —
 * never just because a list is filtered on a site. Following it goes back to that exact entry
 * (`history.go`): the same list of sites, position and focus, without a new history entry.
 */
export function fromSitesOrigin(customerId: string): OriginBack | null {
  const sites = clientHref(customerId, "sedii");
  const back = originBack({ href: sites, label: "Sedii" }, (href) => hrefPath(href) === hrefPath(sites) && new URL(href, window.location.origin).searchParams.get("sectiune") === "sedii");
  return back.onClick ? back : null;
}
