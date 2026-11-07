import type {
  JobListItemTransport,
  QuoteListItemTransport,
  RequestListItemTransport,
} from "../api/types";
import { assemblyHref, jobHref, registryQuoteHref, requestHref } from "../routing/appRoute";
import { journeyNextHref } from "./journeyHref";
import { presentOfferStatus } from "./offerCommercialStatus";

export type PresentedWorklistAction = {
  actionLabel: string;
  actionHref: string;
};

/**
 * The request's next action: the server journey's label and target, identical in Cereri, the
 * request page and the customer dossier. Without a journey the row only opens the request.
 */
export function presentRequestWorklistAction(
  item: Pick<RequestListItemTransport, "requestId" | "journey">,
): PresentedWorklistAction {
  if (!item.journey) {
    return { actionLabel: "Deschide cererea", actionHref: requestHref(item.requestId) };
  }
  return {
    actionLabel: item.journey.nextActionLabel || "Deschide cererea",
    actionHref: journeyNextHref(item.journey, item.requestId),
  };
}

export function presentQuoteWorklistAction(
  item: QuoteListItemTransport,
): PresentedWorklistAction {
  const detailHref = registryQuoteHref(item);
  if (item.nextAction === "OPEN_ASSEMBLY" && item.assemblyId) {
    return { actionLabel: item.nextActionLabel || "Deschide ansamblul", actionHref: assemblyHref(item.assemblyId) };
  }
  const status = presentOfferStatus(item);
  if (status.stepToJob && item.orderSnapshotId) {
    return { actionLabel: status.stepLabel, actionHref: jobHref(item.orderSnapshotId) };
  }
  return { actionLabel: status.stepToJob ? "Deschide oferta" : status.stepLabel, actionHref: detailHref };
}

export function presentJobWorklistAction(item: JobListItemTransport): PresentedWorklistAction {
  const detailHref = jobHref(item.jobId);
  switch (item.nextAction) {
    case "OPEN_EXECUTION":
    case "CONTINUE_EXECUTION":
      if (item.planId) {
        return {
          actionLabel: "Vezi operațiile",
          actionHref: jobHref(item.jobId, { section: "operatii" }),
        };
      }
      return { actionLabel: "Deschide lucrarea", actionHref: detailHref };
    case "RELEASE_TO_PRODUCTION":
    case "CREATE_EXECUTION_PLAN":
      return { actionLabel: "Deschide lucrarea", actionHref: detailHref };
    case "VIEW_COMPLETED":
      return {
        actionLabel: item.nextActionLabel || "Lucrare finalizată",
        actionHref: detailHref,
      };
    default:
      return {
        actionLabel: item.nextActionLabel || "Deschide lucrarea",
        actionHref: detailHref,
      };
  }
}

export function presentCreatedColumn(value: string | null, formatted: string | null): string {
  return formatted ?? value ?? "";
}
