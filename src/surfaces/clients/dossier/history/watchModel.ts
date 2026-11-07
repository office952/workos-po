import type { CustomerDossierModel } from "../../../../adapters/customerDossierAdapter";
import type { CustomerWorkspaceTransport, JobListItemTransport, QuoteListItemTransport } from "../../../../api/types";
import { jobHref, requestHref } from "../../../../routing/appRoute";
import { clientRequestsHref } from "../../clientRequestsRoute";
import { countLabel } from "../historyModel";

export type WatchTone = "attention" | "neutral";

export type WatchSituation = {
  key: string;
  tone: WatchTone;
  title: string;
  details: string[];
  action: { href: string; label: string };
};

export type WatchModel = {
  tone: WatchTone;
  summary: string;
  /** What the server flags, in its words ("2 oferte urmează acceptarea · Lit: comanda așteaptă…"). */
  attentionSummary: string | null;
  /** Normal activity ("1 lucrare în execuție"): said, never presented as a problem. */
  ongoingSummary: string | null;
  situations: WatchSituation[];
};

const IN_EXECUTION = "EXECUTION_IN_PROGRESS";
const COMPLETED = "EXECUTION_COMPLETED";

type Sites = Pick<CustomerDossierModel, "sites" | "siteAssignments"> | null;

function siteName(sites: Sites, subjectKind: "REQUEST" | "JOB", subjectId: string | null): string | null {
  if (!sites || !subjectId) return null;
  const assignment = sites.siteAssignments.find((item) => item.subjectKind === subjectKind && item.subjectId === subjectId);
  return assignment ? sites.sites.find((site) => site.siteId === assignment.siteId)?.name ?? null : null;
}

function actionable(quote: QuoteListItemTransport): boolean {
  return quote.obligationKind === "ACTIONABLE";
}

/** The server's words for an offer: what we owe when actionable, otherwise its commercial status. */
function offerReason(quote: QuoteListItemTransport): string {
  return (actionable(quote) ? quote.attentionLabel : null) ?? quote.commercialStatusLabel ?? "";
}

/** The reason every offer shares, lowercased for a running sentence. */
function sharedStatus(quotes: readonly QuoteListItemTransport[]): string | null {
  const labels = [...new Set(quotes.map(offerReason))];
  return labels.length === 1 && labels[0] ? labels[0].toLocaleLowerCase("ro") : null;
}

function amount(quote: QuoteListItemTransport): string {
  return quote.grossDisplay ? `${quote.reference} · ${quote.grossDisplay}${quote.currency ? ` ${quote.currency}` : ""}` : quote.reference;
}

/**
 * N-020 · „De urmărit” (Figma 604:8132 / 649:14128 / 604:8728): what is open for this client, said
 * from the server rows only. Offers we must act on, requests and works the server marks as needing
 * attention are warm; offers waiting for the customer, works in execution and works not finished
 * yet are neutral (their existence is not an alarm). A work counts as "în curs" only in its execution stage: "nefinalizată" never means
 * started. Nothing → null, and the control is not shown at all.
 */
export function watchModel(customerId: string, workspace: Pick<CustomerWorkspaceTransport, "requests" | "quotes" | "jobs">, sites: Sites): WatchModel | null {
  const requestTitle = (requestId: string | null) => workspace.requests.find((item) => item.requestId === requestId)?.title ?? null;
  const situations: WatchSituation[] = [];

  // Offers the server still follows up, grouped by their request (one situation per request); only
  // an obligation of the organization is warm, an offer waiting for the customer is not an alarm.
  const followed = workspace.quotes.filter((quote) => quote.followUp && !quote.superseded);
  const ownOffers = followed.filter(actionable);
  const customerOffers = followed.filter((quote) => !actionable(quote));
  const groups = new Map<string, QuoteListItemTransport[]>();
  for (const quote of followed) {
    const key = quote.requestId ?? quote.quoteSnapshotId;
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  }
  for (const [key, quotes] of groups) {
    const reason = sharedStatus(quotes);
    const title = requestTitle(quotes[0]?.requestId ?? null);
    const what = quotes.length === 1 ? `Oferta ${quotes[0]?.reference}` : countLabel(quotes.length, "ofertă", "oferte");
    situations.push({
      key: `offers:${key}`,
      tone: quotes.some(actionable) ? "attention" : "neutral",
      title: [title ? `${what} pentru ${title}` : what, reason].filter(Boolean).join(": "),
      details: [...quotes.map(amount), siteName(sites, "REQUEST", quotes[0]?.requestId ?? null)].filter((value): value is string => Boolean(value)),
      action: { href: clientRequestsHref(customerId, "", "", { atentie: "1" }), label: quotes.length === 1 ? "Vezi oferta în Cereri și oferte" : "Vezi ofertele în Cereri și oferte" },
    });
  }

  // A request flagged only because of an offer of its own already said above is not said twice.
  const saidFor = (requestId: string) => ownOffers.filter((quote) => quote.requestId === requestId).length;
  const attentionRequests = workspace.requests.filter(
    (item) => item.needsAttention && !(item.journey && item.journey.actionableCount <= saidFor(item.requestId)),
  );
  for (const request of attentionRequests) {
    situations.push({
      key: `request:${request.requestId}`,
      tone: "attention",
      title: [`Cererea ${request.title}`, request.attentionLabel?.toLocaleLowerCase("ro")].filter(Boolean).join(": "),
      details: [request.reference, siteName(sites, "REQUEST", request.requestId)].filter((value): value is string => Boolean(value)),
      action: { href: requestHref(request.requestId), label: "Deschide cererea" },
    });
  }

  const jobTitle = (job: JobListItemTransport) => requestTitle(job.requestId) ?? job.productLabel;
  const jobDetails = (job: JobListItemTransport) => [job.progressLabel, siteName(sites, "JOB", job.jobId) ?? siteName(sites, "REQUEST", job.requestId)].filter((value): value is string => Boolean(value));
  const attentionJobs = workspace.jobs.filter((job) => job.needsAttention);
  for (const job of attentionJobs) {
    situations.push({
      key: `job:${job.jobId}`,
      tone: "attention",
      title: [jobTitle(job), job.attentionLabel?.toLocaleLowerCase("ro") ?? job.stageLabel.toLocaleLowerCase("ro")].join(": "),
      details: jobDetails(job),
      action: { href: jobHref(job.jobId), label: "Deschide fișa lucrării" },
    });
  }
  const quiet = workspace.jobs.filter((job) => !job.needsAttention && job.stage !== COMPLETED);
  const running = quiet.filter((job) => job.stage === IN_EXECUTION);
  const notStarted = quiet.filter((job) => job.stage !== IN_EXECUTION);
  for (const job of running) {
    situations.push({ key: `job:${job.jobId}`, tone: "neutral", title: `${jobTitle(job)} este în execuție`, details: jobDetails(job), action: { href: jobHref(job.jobId), label: "Deschide fișa lucrării" } });
  }
  for (const job of notStarted) {
    situations.push({ key: `job:${job.jobId}`, tone: "neutral", title: `${jobTitle(job)}: ${job.stageLabel.toLocaleLowerCase("ro")}`, details: jobDetails(job), action: { href: jobHref(job.jobId), label: "Deschide fișa lucrării" } });
  }
  if (!situations.length) return null;

  // R1 (904:37515): the compact line says concretely what the server flags, with its own words,
  // apart from the normal activity — never a vague "N de urmărit".
  const attentionParts = [
    ownOffers.length ? `${countLabel(ownOffers.length, "ofertă", "oferte")} ${sharedStatus(ownOffers) ?? "de rezolvat"}` : null,
    ...attentionRequests.map((request) => [`Cererea ${request.title}`, request.attentionLabel?.toLocaleLowerCase("ro")].filter(Boolean).join(": ")),
    ...attentionJobs.map((job) => [jobTitle(job), job.attentionLabel?.toLocaleLowerCase("ro") ?? job.stageLabel.toLocaleLowerCase("ro")].join(": ")),
  ].filter((part): part is string => Boolean(part));
  const ongoingParts = [
    customerOffers.length ? `${countLabel(customerOffers.length, "ofertă", "oferte")} ${sharedStatus(customerOffers) ?? "de urmărit"}` : null,
    running.length ? `${countLabel(running.length, "lucrare", "lucrări")} în execuție` : null,
    notStarted.length ? countLabel(notStarted.length, "lucrare nefinalizată", "lucrări nefinalizate") : null,
  ].filter((part): part is string => Boolean(part));
  const attentionSummary = attentionParts.length ? attentionParts.join(" · ") : null;
  const ongoingSummary = ongoingParts.length ? ongoingParts.join(" · ") : null;
  const summary = [attentionSummary, ongoingSummary].filter(Boolean).join(" · ");
  return { tone: situations.some((item) => item.tone === "attention") ? "attention" : "neutral", summary, attentionSummary, ongoingSummary, situations };
}
