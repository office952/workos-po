import type { CustomerWorkspaceTransport, JobListItemTransport, QuoteListItemTransport, RequestListItemTransport } from "../../../api/types";
import { countLabel } from "../dossier/historyModel";

/**
 * N-020 · Cereri și oferte (Figma 640:11188 / 640:11601 / 640:12261 / 640:11942). Everything here is
 * grouping, filtering and counting of the workspace the server sent: "De urmărit" is the server's
 * `followUp` on an offer (customer answer or order confirmation still open), the job of an offer is
 * the job with the offer's order, the site of a request is its site assignment in the dossier. No
 * state is computed and no commercial rule is added.
 */

export type RequestsMode = "cereri" | "oferte";

/** `year` is the request's year in Pe cereri and the offer's year in Toate ofertele; the same number travels across modes. */
export type RequestsFilters = { q: string; site: string; year: string; attention: boolean; mode: RequestsMode };

export type SiteRef = { siteId: string; name: string };

export type OfferItem = {
  quote: QuoteListItemTransport;
  request: RequestListItemTransport | null;
  job: JobListItemTransport | null;
  site: SiteRef | null;
};

export type RequestGroup = {
  request: RequestListItemTransport;
  site: SiteRef | null;
  offers: OfferItem[];
  jobs: JobListItemTransport[];
};

export type FilterChoice = { value: string; label: string; count: number };

export type RequestsView = {
  totals: { requests: number; offers: number; followUp: number };
  /** Pe cereri: the requests the filters let through, each whole (all its offers). */
  groups: RequestGroup[];
  /** Pe cereri: offers without a known request, after the same filters. */
  loose: OfferItem[];
  /** Toate ofertele: every offer the filters let through, in server order. */
  offers: OfferItem[];
  /** Pe cereri + De urmărit: requests left out only because none of their offers is followed up. */
  withoutFollowUp: RequestListItemTransport[];
  /** Pe cereri + an: offers without a request, which have no request year (they are in Toate ofertele). */
  looseWithoutYear: number;
  /** Offers to follow up among what is shown (Pe cereri). */
  followUpShown: number;
  sites: FilterChoice[];
  /** The mode's years — of the requests, or of every offer — counted alike; an active year stays, even at 0. */
  years: FilterChoice[];
};

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const yearOf = (iso: string | null) => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : null);

export function jobOfQuote(quote: QuoteListItemTransport, jobs: readonly JobListItemTransport[]): JobListItemTransport | null {
  return quote.orderSnapshotId ? jobs.find((job) => job.orderSnapshotId === quote.orderSnapshotId) ?? null : null;
}

export function buildRequestsView(
  workspace: Pick<CustomerWorkspaceTransport, "requests" | "quotes" | "jobs">,
  siteOf: (requestId: string) => SiteRef | null,
  filters: RequestsFilters,
): RequestsView {
  const needle = plain(filters.q.trim());
  const text = (parts: Array<string | null | undefined>) => !needle || plain(parts.filter(Boolean).join(" ")).includes(needle);
  const requestById = new Map(workspace.requests.map((request) => [request.requestId, request]));
  const item = (quote: QuoteListItemTransport): OfferItem => {
    const request = quote.requestId ? requestById.get(quote.requestId) ?? null : null;
    return { quote, request, job: jobOfQuote(quote, workspace.jobs), site: request ? siteOf(request.requestId) : null };
  };
  const items = workspace.quotes.map(item);
  const offerText = (offer: OfferItem) => text([offer.quote.reference, offer.quote.productLabel, offer.quote.inscription, offer.quote.kindLabel]);
  const requestText = (request: RequestListItemTransport) => text([request.title, request.reference]);

  const siteOk = (site: SiteRef | null) => !filters.site || site?.siteId === filters.site;
  const groupsAll: RequestGroup[] = workspace.requests.map((request) => ({
    request,
    site: siteOf(request.requestId),
    offers: items.filter((offer) => offer.request?.requestId === request.requestId),
    jobs: workspace.jobs.filter((job) => job.requestId === request.requestId),
  }));
  // Every filter but the follow-up one: what "De urmărit" then narrows (and names what it hides).
  const passesBase = (group: RequestGroup) =>
    siteOk(group.site) && (!filters.year || yearOf(group.request.createdAt) === filters.year) && (requestText(group.request) || group.offers.some(offerText));
  const follows = (group: RequestGroup) => group.offers.some((offer) => offer.quote.followUp);
  const base = groupsAll.filter(passesBase);
  const groups = filters.attention ? base.filter(follows) : base;
  const withoutFollowUp = filters.attention ? base.filter((group) => !follows(group)).map((group) => group.request) : [];

  const offerBase = (offer: OfferItem) =>
    siteOk(offer.site) && (offerText(offer) || (offer.request ? requestText(offer.request) : false)) && (!filters.attention || offer.quote.followUp);
  const offers = items.filter((offer) => offerBase(offer) && (!filters.year || yearOf(offer.quote.createdAt) === filters.year));
  // Pe cereri reads the request's year: an offer without a request has none, so a year leaves it out (named).
  const looseBase = items.filter((offer) => !offer.request && offerBase(offer));
  const loose = filters.year ? [] : looseBase;

  const siteMap = new Map<string, FilterChoice>();
  for (const group of groupsAll) {
    if (!group.site) continue;
    const entry = siteMap.get(group.site.siteId) ?? { value: group.site.siteId, label: group.site.name, count: 0 };
    entry.count += 1;
    siteMap.set(group.site.siteId, entry);
  }
  const yearMap = new Map<string, number>();
  for (const createdAt of filters.mode === "oferte" ? workspace.quotes.map((quote) => quote.createdAt) : workspace.requests.map((request) => request.createdAt)) {
    const year = yearOf(createdAt);
    if (year) yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
  }
  if (filters.year && !yearMap.has(filters.year)) yearMap.set(filters.year, 0);
  return {
    totals: { requests: workspace.requests.length, offers: workspace.quotes.length, followUp: workspace.quotes.filter((quote) => quote.followUp).length },
    groups,
    loose,
    offers,
    withoutFollowUp,
    looseWithoutYear: filters.year && filters.mode === "cereri" ? looseBase.length : 0,
    followUpShown: groups.reduce((sum, group) => sum + group.offers.filter((offer) => offer.quote.followUp).length, 0),
    sites: [...siteMap.values()],
    years: [...yearMap].sort(([left], [right]) => right.localeCompare(left)).map(([year, count]) => ({ value: year, label: year, count })),
  };
}

/**
 * "Progres comercial" of a request: the server journey's offer summary, then its works by their
 * own stage. Without a journey only the offer count is said, never a status rebuilt here.
 */
export function commercialProgress(group: Pick<RequestGroup, "request" | "offers" | "jobs">): string {
  if (!group.offers.length && !group.jobs.length) return "Fără ofertă încă";
  const summary = group.request.journey?.offerSummary.summaryLabel;
  const parts: string[] = [summary || (group.offers.length ? countLabel(group.offers.length, "ofertă", "oferte") : "fără ofertă")];
  if (group.jobs.length === 0) parts.push("fără lucrare");
  else if (group.jobs.length === 1) parts.push(`lucrarea e ${group.jobs[0]!.stageLabel.toLocaleLowerCase("ro")}`);
  else parts.push(countLabel(group.jobs.length, "lucrare", "lucrări"));
  return parts.join(" · ");
}
