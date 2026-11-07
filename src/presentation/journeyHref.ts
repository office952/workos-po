import type { CommercialJourneyItemTransport, CommercialJourneyTransport } from "../api/types";
import {
  assemblyHref,
  jobHref,
  registryQuoteHref,
  requestHref,
  requestProductHref,
} from "../routing/appRoute";
import { quoteHrefFromSnapshotIdentity } from "./operatorHref";

/**
 * Frontend route of a server journey target. The server names the target (request, offer with its
 * kind and product, assembly, job); this only translates that identity into this app's paths.
 */
export function journeyItemHref(item: CommercialJourneyItemTransport, requestId: string): string {
  if (item.quoteSnapshotId) {
    if (item.quoteKind === "ASSEMBLY" || item.quoteKind === "PRODUCT") {
      return registryQuoteHref({
        kind: item.quoteKind,
        productCode: item.productCode ?? "",
        quoteSnapshotId: item.quoteSnapshotId,
      });
    }
    return quoteHrefFromSnapshotIdentity(item.quoteSnapshotId, item.productCode) ?? requestHref(requestId);
  }
  if (item.action === "OPEN_ASSEMBLY" && item.assemblyId) return assemblyHref(item.assemblyId);
  if (item.action === "CHOOSE_PRODUCT") return requestProductHref(requestId);
  return requestHref(requestId);
}

function enginePath(href: string | null): { kind: string; id: string } | null {
  const match = (href ?? "").split("?")[0]?.match(/^\/(requests|quotes|assemblies|jobs)\/([^/]+)$/);
  return match?.[1] && match[2] ? { kind: match[1], id: decodeURIComponent(match[2]) } : null;
}

/** The request-level next action, the same target in Cereri, the request page and the dossier. */
export function journeyNextHref(journey: CommercialJourneyTransport, requestId: string): string {
  const items = [...journey.actionable, ...journey.waiting];
  const path = enginePath(journey.nextActionHref);
  switch (journey.nextAction) {
    case "CHOOSE_PRODUCT":
      return requestProductHref(requestId);
    case "OPEN_QUOTE": {
      const item = path ? items.find((candidate) => candidate.quoteSnapshotId === path.id) : undefined;
      return item ? journeyItemHref(item, requestId) : requestHref(requestId);
    }
    case "OPEN_ASSEMBLY":
      return path?.kind === "assemblies" ? assemblyHref(path.id) : requestHref(requestId);
    case "OPEN_ORDER":
      return path?.kind === "jobs" ? jobHref(path.id) : requestHref(requestId);
    default:
      return requestHref(requestId);
  }
}
