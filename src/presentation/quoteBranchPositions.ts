import type { QuoteListItemTransport, RequestLinkedOfferTransport } from "../api/types";
import { presentCommercialBranches, type CommercialBranch } from "./requestCommercialBranches";
import { presentRequestCommercialProgress } from "./requestCommercialProgress";

/**
 * Where a quote of the Oferte register sits on its request: the same branch key and the same
 * registration index as the request page, built by the same branch presenter from the rows the
 * register already holds. Requests whose branches have no offer yet are not in this list, so the
 * count is "offers of the request", which is what the register shows.
 */
export type QuoteBranchPosition = {
  requestId: string;
  requestReference: string | null;
  customerDisplayName: string | null;
  branchKey: string;
  indexLabel: string;
  total: number;
};

export type QuoteRequestGroup = {
  requestId: string | null;
  requestReference: string | null;
  customerDisplayName: string | null;
  total: number;
  headline: string;
};

function asLinkedOffer(item: QuoteListItemTransport): RequestLinkedOfferTransport {
  return {
    quoteSnapshotId: item.quoteSnapshotId,
    kind: item.kind,
    kindLabel: item.kindLabel,
    assemblyId: item.assemblyId,
    productCode: item.productCode,
    productLabel: item.productLabel,
    inscription: item.inscription?.trim() || null,
    reference: item.reference,
    stage: item.stage,
    stageLabel: item.stageLabel,
    createdAt: item.createdAt,
    superseded: item.superseded,
    needsAttention: item.needsAttention,
    attentionLabel: item.attentionLabel,
    nextAction: item.nextAction,
    grossDisplay: item.grossDisplay,
    currency: item.currency,
    orderSnapshotId: item.orderSnapshotId,
  };
}

function branchesByRequest(items: readonly QuoteListItemTransport[]): Map<string, { rows: QuoteListItemTransport[]; branches: CommercialBranch[] }> {
  const rowsByRequest = new Map<string, QuoteListItemTransport[]>();
  for (const item of items) {
    if (!item.requestId) continue;
    const rows = rowsByRequest.get(item.requestId) ?? [];
    rows.push(item);
    rowsByRequest.set(item.requestId, rows);
  }
  const result = new Map<string, { rows: QuoteListItemTransport[]; branches: CommercialBranch[] }>();
  for (const [requestId, rows] of rowsByRequest) {
    const model = presentCommercialBranches({ offers: rows.map(asLinkedOffer), assemblies: [], jobs: [], jobsStatus: "ready" });
    result.set(requestId, { rows, branches: model.branches });
  }
  return result;
}

/** The branches of one request, from the quote rows of that request only. */
export function presentQuoteRequestBranches(items: readonly QuoteListItemTransport[], requestId: string): CommercialBranch[] {
  return branchesByRequest(items.filter((item) => item.requestId === requestId)).get(requestId)?.branches ?? [];
}

export function presentQuoteBranchPositions(items: readonly QuoteListItemTransport[]): Map<string, QuoteBranchPosition> {
  const positions = new Map<string, QuoteBranchPosition>();
  for (const [requestId, { rows, branches }] of branchesByRequest(items)) {
    for (const branch of branches) {
      for (const quote of branch.quotes) {
        const row = rows.find((item) => item.quoteSnapshotId === quote.quoteSnapshotId);
        positions.set(quote.quoteSnapshotId, {
          requestId,
          requestReference: row?.requestReference ?? null,
          customerDisplayName: row?.customerDisplayName ?? null,
          branchKey: branch.key,
          indexLabel: branch.indexLabel,
          total: branches.length,
        });
      }
    }
  }
  return positions;
}

/** One header per request in the grouped register: the request's own aggregate, never a total across requests. */
export function presentQuoteRequestGroups(items: readonly QuoteListItemTransport[]): Map<string, QuoteRequestGroup> {
  const groups = new Map<string, QuoteRequestGroup>();
  for (const [requestId, { rows, branches }] of branchesByRequest(items)) {
    const first = rows[0];
    groups.set(requestId, {
      requestId,
      requestReference: first?.requestReference ?? null,
      customerDisplayName: first?.customerDisplayName ?? null,
      total: branches.length,
      headline: presentRequestCommercialProgress({ branches, commercialProgress: null, commercialProgressLabel: null }).headline,
    });
  }
  return groups;
}
