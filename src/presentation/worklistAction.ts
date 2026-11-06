import type {
  JobListItemTransport,
  QuoteListItemTransport,
  RequestDetailTransport,
  RequestListItemTransport,
} from "../api/types";
import {
  assemblyHref,
  requestProductHref,
  jobHref,
  registryQuoteHref,
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
        actionHref: requestProductHref(item.requestId),
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
    case "OPEN_ASSEMBLY":
      return item.linkedAssemblyId
        ? {
            actionLabel: item.nextActionLabel || "Deschide ansamblul",
            actionHref: assemblyHref(item.linkedAssemblyId),
          }
        : { actionLabel: "Deschide", actionHref: requestHref(item.requestId) };
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

/**
 * The request-level next action: the server's nextAction and its own target (the same one the
 * request register links to). A selected branch never changes it, and the UI never picks a quote.
 */
export type RequestNextStep =
  | { status: "none" }
  | {
      status: "ready";
      label: string;
      href: string;
      targetQuoteSnapshotId: string | null;
      targetAssemblyId: string | null;
    }
  | { status: "target-missing"; label: string };

export function presentRequestNextStep(detail: RequestDetailTransport): RequestNextStep {
  switch (detail.nextAction) {
    case "CHOOSE_PRODUCT":
      return {
        status: "ready",
        label: detail.nextActionLabel || "Alege produs",
        href: requestProductHref(detail.requestId),
        targetQuoteSnapshotId: null,
        targetAssemblyId: null,
      };
    case "OPEN_QUOTE": {
      const label = detail.nextActionLabel || "Deschide oferta";
      const target = detail.linkedQuoteSnapshotId;
      const offer = target ? detail.linkedOffers.find((item) => item.quoteSnapshotId === target) : null;
      if (offer) {
        return { status: "ready", label, href: registryQuoteHref(offer), targetQuoteSnapshotId: offer.quoteSnapshotId, targetAssemblyId: null };
      }
      const fromServer = target ? null : quoteHrefFromEngineHref(detail.nextActionHref);
      return fromServer
        ? { status: "ready", label, href: fromServer, targetQuoteSnapshotId: null, targetAssemblyId: null }
        : { status: "target-missing", label };
    }
    case "OPEN_ASSEMBLY": {
      const label = detail.nextActionLabel || "Deschide ansamblul";
      const target = detail.linkedAssemblyId;
      return target && detail.assemblies.some((item) => item.assemblyId === target)
        ? { status: "ready", label, href: assemblyHref(target), targetQuoteSnapshotId: null, targetAssemblyId: target }
        : { status: "target-missing", label };
    }
    case "OPEN_REQUEST":
      return { status: "none" };
    default:
      return { status: "none" };
  }
}

export function presentQuoteWorklistAction(
  item: QuoteListItemTransport,
): PresentedWorklistAction {
  const detailHref = registryQuoteHref(item);
  switch (item.nextAction) {
    case "OPEN_ASSEMBLY":
      return item.assemblyId
        ? { actionLabel: item.nextActionLabel || "Deschide ansamblul", actionHref: assemblyHref(item.assemblyId) }
        : { actionLabel: "Deschide oferta", actionHref: detailHref };
    case "OPEN_ORDER":
      if (item.orderSnapshotId) {
        return { actionLabel: "Fișa lucrării", actionHref: jobHref(item.orderSnapshotId) };
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
