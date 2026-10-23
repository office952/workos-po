import type {
  CustomerWorkspaceTransport,
  JobListItemTransport,
  QuoteListItemTransport,
  RequestListItemTransport,
} from "../../api/types";
import { formatTimestamp } from "../../presentation/format";
import { presentQuoteHistoryState } from "../../presentation/quoteHistory";
import { presentRequestRegistryStatus } from "../../presentation/requestListStatus";
import {
  presentJobWorklistAction,
  presentQuoteWorklistAction,
  presentRequestWorklistAction,
} from "../../presentation/worklistAction";
import { jobHref, registryQuoteHref, requestHref } from "../../routing/appRoute";

export type HubRow = {
  key: string;
  kind: "Cerere" | "Ofertă" | "Lucrare";
  href: string;
  title: string;
  detail?: string;
  state: string;
  actionHref: string;
  actionLabel: string;
  needsAttention: boolean;
  attentionLabel: string | null;
};

export function requestRow(item: RequestListItemTransport): HubRow {
  const action = presentRequestWorklistAction(item);
  const registry = presentRequestRegistryStatus({
    statusLabel: item.statusLabel,
    contextLabel: item.contextLabel,
  });
  return {
    key: item.requestId,
    kind: "Cerere",
    href: requestHref(item.requestId),
    title: item.title,
    detail: [item.reference && item.reference !== item.title ? item.reference : null, formatTimestamp(item.createdAt)]
      .filter(Boolean)
      .join(" · "),
    state: registry.stateLabel,
    actionHref: action.actionHref,
    actionLabel: action.actionLabel,
    needsAttention: item.needsAttention,
    attentionLabel: item.attentionLabel,
  };
}

export function quoteRow(item: QuoteListItemTransport): HubRow {
  const action = presentQuoteWorklistAction(item);
  return {
    key: item.quoteSnapshotId,
    kind: "Ofertă",
    href: registryQuoteHref(item),
    title: item.reference,
    detail: [item.kindLabel, item.productLabel, item.requestReference].filter(Boolean).join(" · "),
    state: presentQuoteHistoryState(item),
    actionHref: action.actionHref,
    actionLabel: action.actionLabel,
    needsAttention: item.needsAttention,
    attentionLabel: item.attentionLabel,
  };
}

/** Next steps the frontend names itself for jobs; any other label is the server's own text. */
const FRONTEND_JOB_ACTIONS = new Set(["RELEASE_TO_PRODUCTION", "CREATE_EXECUTION_PLAN", "OPEN_EXECUTION", "CONTINUE_EXECUTION"]);

/**
 * N-018 · on the client page a frontend label that leads to the job sheet says so ("Fișa
 * lucrării"); the Operații section keeps "Vezi operațiile". Server labels pass unchanged.
 */
function jobActionLabel(job: JobListItemTransport, action: { actionLabel: string; actionHref: string }): string {
  const frontendLabel = FRONTEND_JOB_ACTIONS.has(job.nextAction) || !job.nextActionLabel;
  return frontendLabel && action.actionHref === jobHref(job.jobId) ? "Fișa lucrării" : action.actionLabel;
}

export function jobRow(job: JobListItemTransport): HubRow {
  const action = presentJobWorklistAction(job);
  return {
    key: job.jobId,
    kind: "Lucrare",
    href: jobHref(job.jobId),
    title: job.kind === "ASSEMBLY" ? job.productLabel : job.inscription || job.productLabel,
    detail: [job.priorityLabel, job.targetDateLabel].filter(Boolean).join(" · "),
    state: job.stageLabel,
    actionHref: action.actionHref,
    actionLabel: jobActionLabel(job, action),
    needsAttention: job.needsAttention,
    attentionLabel: job.attentionLabel,
  };
}

/** A request and what came out of it: its offers and its jobs, in server order. */
export type RelationThread = {
  key: string;
  request: RequestListItemTransport | null;
  documents: HubRow[];
};

/**
 * Groups the workspace by request using only the links the server sends (requestId on offers
 * and jobs). Offers and jobs without a known request end in one last group.
 */
export function relationThreads(workspace: Pick<CustomerWorkspaceTransport, "requests" | "quotes" | "jobs">): RelationThread[] {
  const known = new Set(workspace.requests.map((item) => item.requestId));
  const threads: RelationThread[] = workspace.requests.map((request) => ({
    key: request.requestId,
    request,
    documents: [
      ...workspace.quotes.filter((quote) => quote.requestId === request.requestId).map(quoteRow),
      ...workspace.jobs.filter((job) => job.requestId === request.requestId).map(jobRow),
    ],
  }));
  const loose = [
    ...workspace.quotes.filter((quote) => !quote.requestId || !known.has(quote.requestId)).map(quoteRow),
    ...workspace.jobs.filter((job) => !job.requestId || !known.has(job.requestId)).map(jobRow),
  ];
  if (loose.length) threads.push({ key: "fara-cerere", request: null, documents: loose });
  return threads;
}

/** "Acum": what the server marks as needing action, with the server's next step. */
export function relationNow(workspace: Pick<CustomerWorkspaceTransport, "requests" | "quotes" | "jobs">): HubRow[] {
  return [
    ...workspace.requests.map(requestRow),
    ...workspace.quotes.map(quoteRow),
    ...workspace.jobs.map(jobRow),
  ].filter((row) => row.needsAttention);
}
