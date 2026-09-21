import type {
  JobListItemTransport,
  QuoteListItemTransport,
  RequestDetailTransport,
  RequestListItemTransport,
} from "../api/types";
import {
  catalogHref,
  executionHref,
  jobHref,
  quoteHref,
  requestHref,
} from "../routing/appRoute";
import { quoteHrefFromEngineHref, quoteHrefFromSnapshotIdentity } from "./operatorHref";

export type PresentedWorklistAction = {
  actionLabel: string;
  actionHref: string;
};

export function presentRequestWorklistAction(
  item: RequestListItemTransport,
): PresentedWorklistAction {
  switch (item.nextAction) {
    case "CHOOSE_PRODUCT":
      return {
        actionLabel: item.nextActionLabel || "Alege produs",
        actionHref: catalogHref({
          customerId: item.customerId,
          requestId: item.requestId,
          productCode: null,
        }),
      };
    case "OPEN_QUOTE": {
      const actionHref =
        quoteHrefFromSnapshotIdentity(
          item.linkedQuoteSnapshotId,
          item.linkedQuoteProductCode,
        ) ?? quoteHrefFromEngineHref(item.nextActionHref);
      if (actionHref) {
        return {
          actionLabel: item.nextActionLabel || "Deschide oferta",
          actionHref,
        };
      }
      return {
        actionLabel: "Deschide",
        actionHref: requestHref(item.requestId),
      };
    }
    case "OPEN_REQUEST":
      return {
        actionLabel: item.nextActionLabel || "Deschide",
        actionHref: requestHref(item.requestId),
      };
    default:
      return {
        actionLabel: item.nextActionLabel || "Deschide",
        actionHref: requestHref(item.requestId),
      };
  }
}

export function presentRequestPrimaryAction(
  detail: RequestDetailTransport,
): PresentedWorklistAction | null {
  switch (detail.nextAction) {
    case "CHOOSE_PRODUCT":
      return {
        actionLabel: detail.nextActionLabel || "Alege produs",
        actionHref: catalogHref({
          customerId: detail.customerId,
          requestId: detail.requestId,
          productCode: null,
        }),
      };
    case "OPEN_QUOTE": {
      const offer = detail.linkedOffers[0];
      if (!offer) {
        return null;
      }
      return {
        actionLabel: detail.nextActionLabel || "Deschide oferta",
        actionHref: quoteHref(offer.productCode, offer.quoteSnapshotId),
      };
    }
    case "OPEN_REQUEST":
      return null;
    default:
      return null;
  }
}

export function presentQuoteWorklistAction(
  item: QuoteListItemTransport,
): PresentedWorklistAction {
  const detailHref = quoteHref(item.productCode, item.quoteSnapshotId);
  switch (item.nextAction) {
    case "OPEN_ORDER":
      if (item.orderSnapshotId) {
        return {
          actionLabel: item.nextActionLabel || "Deschide comanda",
          actionHref: jobHref(item.orderSnapshotId),
        };
      }
      return { actionLabel: "Deschide oferta", actionHref: detailHref };
    case "ACCEPT_QUOTE":
    case "CREATE_ORDER":
      return { actionLabel: "Deschide oferta", actionHref: detailHref };
    default:
      return {
        actionLabel: item.nextActionLabel || "Deschide oferta",
        actionHref: detailHref,
      };
  }
}

export function presentJobWorklistAction(item: JobListItemTransport): PresentedWorklistAction {
  const detailHref = jobHref(item.jobId);
  switch (item.nextAction) {
    case "OPEN_EXECUTION":
    case "CONTINUE_EXECUTION":
      if (item.planId) {
        return {
          actionLabel: item.nextActionLabel,
          actionHref: executionHref(item.planId),
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
