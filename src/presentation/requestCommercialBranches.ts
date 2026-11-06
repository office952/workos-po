import type {
  JobListItemTransport,
  RequestAssemblyWorkTransport,
  RequestLinkedOfferTransport,
} from "../api/types";
import type { ConfiguratorSession } from "../session/configuratorSession";
import { configuratorContextKey } from "../session/configuratorSession";
import {
  assemblyHref,
  assemblyQuoteHref,
  configuratorHref,
  executionHref,
  jobHref,
  quoteHref,
} from "../routing/appRoute";

/**
 * Presentation of a request's commercial work.
 * A product offer is one object per quoteSnapshotId.
 * An assembly is one object per assemblyId, and keeps every quote the server
 * already tied to that assembly. The job stays on the orderSnapshotId that
 * created it. Nothing here is a new persisted entity.
 */

export type BranchJobsStatus = "pending" | "ready" | "error";

export type BranchStageTone = "done" | "current" | "waiting" | "empty" | "attention";

export type BranchStageCell = {
  label: string;
  detail: string | null;
  tone: BranchStageTone;
  href: string | null;
};

export type BranchQuoteView = {
  quoteSnapshotId: string;
  kind: "PRODUCT" | "ASSEMBLY";
  reference: string | null;
  productLabel: string | null;
  stageLabel: string | null;
  superseded: boolean;
  attentionLabel: string | null;
  orderSnapshotId: string | null;
  grossDisplay: string | null;
  currency: string | null;
  href: string;
  holdsJob: boolean;
  resumable: boolean;
};

export type BranchAction = {
  label: string;
  href: string;
};

export type CommercialBranchKind = "product" | "assembly" | "unlinked";

/** Where the branch's current offer stands, read from the server stage of that offer. */
export type BranchCommercialState = "ordered" | "accepted" | "quoted" | "no-offer" | "unclear";

export type BranchFilter = "all" | "action" | "ordered";

export type BranchChainStep = {
  key: "offer" | "order" | "job";
  name: string;
  value: string;
  detail: string | null;
  tone: BranchStageTone;
};

export type BranchJobCell = {
  label: string;
  href: string | null;
  tone: BranchStageTone;
};

export type CommercialBranch = {
  key: string;
  kind: CommercialBranchKind;
  /** Registration index, kept when a filter hides other rows. */
  index: number;
  indexLabel: string;
  /** The inscription when the server has one, else the product or assembly name. */
  title: string;
  /** The product under an inscription title; null when the title already is the product. */
  subtitle: string | null;
  inscription: string | null;
  offerReference: string | null;
  kindLabel: string;
  state: BranchCommercialState;
  stateLabel: string;
  /** The server marks the current offer as waiting for acceptance or for its order. */
  needsAction: boolean;
  /** Something about the branch cannot be shown as fact (job read error, ambiguous links, revision). */
  needsAttention: boolean;
  jobCell: BranchJobCell;
  chain: BranchChainStep[];
  registeredAt: string | null;
  stages: {
    configuration: BranchStageCell;
    offer: BranchStageCell;
    work: BranchStageCell;
    production: BranchStageCell;
  };
  quotes: BranchQuoteView[];
  note: string | null;
  primaryAction: BranchAction | null;
  assemblyHref: string | null;
  orderHref: string | null;
  executionHref: string | null;
  priceLabel: string | null;
  consultOnly: boolean;
  revisionPending: boolean;
};

export type LocalConfigurationNotice = {
  /** Session key only. Not a server id and not a branch. */
  sessionKey: string;
  persisted: false;
  title: string;
  detail: string;
  href: string;
};

export type CommercialBranchModel = {
  branches: CommercialBranch[];
  local: LocalConfigurationNotice[];
};

type JobLink =
  | { status: "none" }
  | { status: "pending"; orderSnapshotId: string }
  | { status: "error"; orderSnapshotId: string }
  | { status: "missing"; orderSnapshotId: string }
  | { status: "ambiguous" }
  | { status: "matched"; orderSnapshotId: string; job: JobListItemTransport };

const EMPTY: BranchStageCell = { label: "—", detail: null, tone: "empty", href: null };

export function presentCommercialBranches(input: {
  offers: readonly RequestLinkedOfferTransport[];
  assemblies: readonly RequestAssemblyWorkTransport[];
  jobs: readonly JobListItemTransport[];
  jobsStatus: BranchJobsStatus;
  session?: ConfiguratorSession | null;
  requestId?: string | null;
  customerId?: string | null;
}): CommercialBranchModel {
  const consumed = new Set<string>();
  const drafts: CommercialBranch[] = [];

  for (const assembly of input.assemblies) {
    const quotes = quotesForAssembly(assembly, input.offers, consumed);
    drafts.push(assemblyBranch(assembly, quotes, input.jobs, input.jobsStatus));
  }

  for (const offer of input.offers) {
    if (consumed.has(offer.quoteSnapshotId) || offer.kind !== "PRODUCT") continue;
    consumed.add(offer.quoteSnapshotId);
    drafts.push(productBranch(offer, input.jobs, input.jobsStatus));
  }

  const unlinkedGroups = new Map<string, RequestLinkedOfferTransport[]>();
  for (const offer of input.offers) {
    if (consumed.has(offer.quoteSnapshotId) || offer.kind !== "ASSEMBLY") continue;
    const groupKey = offer.assemblyId ? `assembly:${offer.assemblyId}` : `quote:${offer.quoteSnapshotId}`;
    const group = unlinkedGroups.get(groupKey) ?? [];
    group.push(offer);
    unlinkedGroups.set(groupKey, group);
  }
  for (const [groupKey, quotes] of unlinkedGroups) {
    for (const quote of quotes) consumed.add(quote.quoteSnapshotId);
    if (groupKey.startsWith("assembly:")) {
      const assemblyId = groupKey.slice("assembly:".length);
      const orderIds = [...new Set(quotes.flatMap((quote) => (quote.orderSnapshotId ? [quote.orderSnapshotId] : [])))];
      drafts.push(
        assemblyBranch(
          {
            assemblyId,
            label: quotes[0]?.productLabel?.trim() || "Ansamblu",
            stage: "",
            stageLabel: quotes.find((quote) => !quote.superseded)?.stageLabel || "Ofertă",
            quoteGrossPrice: null,
            currency: null,
            quoteSnapshotId: quotes.find((quote) => !quote.superseded)?.quoteSnapshotId ?? null,
            orderSnapshotId: orderIds.length === 1 ? orderIds[0] : null,
            hasProduction: false,
            executionPlanId: null,
            revisionPending: false,
            membersEditable: true,
          },
          quotes,
          input.jobs,
          input.jobsStatus,
        ),
      );
    } else {
      const quote = quotes[0];
      if (quote) drafts.push(unlinkedBranch(quote, input.jobs, input.jobsStatus));
    }
  }

  const ordered = orderBranches(drafts).map((branch, index) => ({
    ...branch,
    index,
    indexLabel: String(index + 1).padStart(2, "0"),
  }));

  return {
    branches: ordered,
    local: input.requestId
      ? localConfigurations({
          requestId: input.requestId,
          customerId: input.customerId ?? null,
          session: input.session ?? null,
          offers: input.offers,
        })
      : [],
  };
}

export function filterBranches(
  branches: readonly CommercialBranch[],
  filter: BranchFilter,
): CommercialBranch[] {
  switch (filter) {
    case "all":
      return [...branches];
    case "action":
      return branches.filter((branch) => branch.needsAction);
    case "ordered":
      return branches.filter((branch) => branch.state === "ordered");
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/** The address keeps the filter as ?filtru=; the earlier "atentie" value still opens the action filter. */
export function parseBranchFilter(value: string | null): BranchFilter {
  if (value === "actiune" || value === "atentie") return "action";
  if (value === "comanda") return "ordered";
  return "all";
}

export function branchFilterParam(filter: BranchFilter): string | null {
  switch (filter) {
    case "all":
      return null;
    case "action":
      return "actiune";
    case "ordered":
      return "comanda";
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/** The branch holding a quote, matched by the server's quote identity. */
export function branchForQuote(
  branches: readonly CommercialBranch[],
  quoteSnapshotId: string | null,
): CommercialBranch | null {
  if (!quoteSnapshotId) return null;
  return branches.find((branch) => branch.quotes.some((quote) => quote.quoteSnapshotId === quoteSnapshotId)) ?? null;
}

function quotesForAssembly(
  assembly: RequestAssemblyWorkTransport,
  offers: readonly RequestLinkedOfferTransport[],
  consumed: Set<string>,
): RequestLinkedOfferTransport[] {
  const matched: RequestLinkedOfferTransport[] = [];
  for (const offer of offers) {
    if (consumed.has(offer.quoteSnapshotId) || offer.kind !== "ASSEMBLY") continue;
    const sameAssembly = Boolean(offer.assemblyId) && offer.assemblyId === assembly.assemblyId;
    const sameQuote = offer.quoteSnapshotId === assembly.quoteSnapshotId;
    if (sameQuote && offer.assemblyId && offer.assemblyId !== assembly.assemblyId) continue;
    if (!sameAssembly && !sameQuote) continue;
    consumed.add(offer.quoteSnapshotId);
    matched.push(offer);
  }
  return matched;
}

function assemblyBranch(
  assembly: RequestAssemblyWorkTransport,
  quotes: readonly RequestLinkedOfferTransport[],
  jobs: readonly JobListItemTransport[],
  jobsStatus: BranchJobsStatus,
): CommercialBranch {
  const order = demonstratedOrder(assembly.orderSnapshotId, quotes);
  const link = order.ambiguous ? { status: "ambiguous" as const } : linkJob(jobs, jobsStatus, order.orderSnapshotId);
  const views = quoteViews(quotes, link);
  const current = quotes.filter((quote) => !quote.superseded);
  const previousOrdered = quotes.filter((quote) => quote.superseded && quote.orderSnapshotId);
  const note = assemblyNote(assembly, current, previousOrdered, link);
  const needsAttention =
    assembly.revisionPending ||
    assembly.stage === "NEEDS_REVIEW" ||
    current.length > 1 ||
    link.status === "ambiguous" ||
    link.status === "error";
  const shown = current.length === 1 ? (current[0] ?? null) : null;
  const ordered = previousOrdered[0] ?? quotes.find((quote) => quote.orderSnapshotId) ?? null;
  const state: { state: BranchCommercialState; label: string } = order.ambiguous || current.length > 1
    ? { state: "unclear", label: current.length > 1 ? "Mai multe oferte curente" : "Asociere neclară" }
    : order.orderSnapshotId
      ? { state: "ordered", label: ordered?.stageLabel?.trim() || assembly.stageLabel }
      : shown
        ? offerState(shown)
        : { state: "no-offer", label: assembly.stageLabel || "Fără ofertă" };
  const reference = (shown ?? ordered)?.reference ?? null;
  return {
    key: `assembly:${assembly.assemblyId}`,
    kind: "assembly",
    index: 0,
    indexLabel: "",
    title: assembly.label,
    subtitle: "Ansamblu",
    inscription: null,
    offerReference: reference,
    kindLabel: "Ansamblu",
    state: state.state,
    stateLabel: state.label,
    needsAction: Boolean(shown?.needsAttention) && !order.orderSnapshotId,
    needsAttention,
    jobCell: jobCell(link),
    chain: branchChain({
      offer: shown ?? ordered,
      offerPrice: priceLabel(assembly.quoteGrossPrice, assembly.currency),
      orderSnapshotId: order.orderSnapshotId,
      link,
    }),
    registeredAt: earliest(quotes.map((quote) => quote.createdAt ?? null)),
    stages: {
      configuration: configurationCell(assembly, quotes.length > 0),
      offer: offerCell(quotes),
      work: workCell(link, order.orderSnapshotId),
      production: productionCell(link),
    },
    quotes: views,
    note,
    primaryAction: assemblyPrimary(assembly, current, link),
    assemblyHref: assemblyHref(assembly.assemblyId),
    orderHref: order.orderSnapshotId ? jobHref(order.orderSnapshotId) : null,
    executionHref: assembly.executionPlanId ? executionHref(assembly.executionPlanId) : null,
    priceLabel: priceLabel(assembly.quoteGrossPrice, assembly.currency),
    consultOnly: !assembly.membersEditable,
    revisionPending: assembly.revisionPending,
  };
}

function productBranch(
  offer: RequestLinkedOfferTransport,
  jobs: readonly JobListItemTransport[],
  jobsStatus: BranchJobsStatus,
): CommercialBranch {
  const link = linkJob(jobs, jobsStatus, offer.orderSnapshotId);
  const needsAttention = link.status === "ambiguous" || link.status === "error";
  const product = offer.productLabel?.trim() || null;
  const state = offerState(offer);
  return {
    key: `quote:${offer.quoteSnapshotId}`,
    kind: "product",
    index: 0,
    indexLabel: "",
    title: offer.inscription ?? product ?? offer.kindLabel,
    subtitle: offer.inscription ? product : null,
    inscription: offer.inscription,
    offerReference: offer.reference,
    kindLabel: "Produs",
    state: state.state,
    stateLabel: state.label,
    needsAction: Boolean(offer.needsAttention),
    needsAttention,
    jobCell: jobCell(link),
    chain: branchChain({
      offer,
      offerPrice: moneyLabel(offer.grossDisplay ?? null, offer.currency ?? null),
      orderSnapshotId: offer.orderSnapshotId,
      link,
    }),
    registeredAt: offer.createdAt ?? null,
    stages: {
      configuration: configurationCell(null, true),
      offer: offerCell([offer]),
      work: workCell(link, offer.orderSnapshotId),
      production: productionCell(link),
    },
    quotes: quoteViews([offer], link),
    note: productNote(link),
    primaryAction: productPrimary(offer, link),
    assemblyHref: null,
    orderHref: offer.orderSnapshotId ? jobHref(offer.orderSnapshotId) : null,
    executionHref: link.status === "matched" && link.job.planId ? executionHref(link.job.planId) : null,
    priceLabel: moneyLabel(offer.grossDisplay ?? null, offer.currency ?? null),
    consultOnly: false,
    revisionPending: false,
  };
}

function unlinkedBranch(
  offer: RequestLinkedOfferTransport,
  jobs: readonly JobListItemTransport[],
  jobsStatus: BranchJobsStatus,
): CommercialBranch {
  const branch = productBranch(offer, jobs, jobsStatus);
  return {
    ...branch,
    key: `quote:${offer.quoteSnapshotId}`,
    kind: "unlinked",
    kindLabel: "Ofertă",
    title: offer.inscription ?? (offer.reference?.trim() || offer.productLabel?.trim() || "Ofertă"),
    subtitle: offer.productLabel?.trim() || "Ansamblu",
    needsAttention: true,
    note: "Asocierea cu ansamblul nu poate fi demonstrată. Oferta rămâne vizibilă, fără o ramură de ansamblu inventată.",
    stages: {
      ...branch.stages,
      configuration: { label: "—", detail: "Legătura cu ansamblul lipsește.", tone: "attention", href: null },
    },
  };
}

function demonstratedOrder(
  assemblyOrderId: string | null,
  quotes: readonly RequestLinkedOfferTransport[],
): { orderSnapshotId: string | null; ambiguous: boolean } {
  if (assemblyOrderId) return { orderSnapshotId: assemblyOrderId, ambiguous: false };
  const ids = [...new Set(quotes.flatMap((quote) => (quote.orderSnapshotId ? [quote.orderSnapshotId] : [])))];
  if (ids.length === 1) return { orderSnapshotId: ids[0] ?? null, ambiguous: false };
  if (ids.length > 1) return { orderSnapshotId: null, ambiguous: true };
  return { orderSnapshotId: null, ambiguous: false };
}

function linkJob(
  jobs: readonly JobListItemTransport[],
  jobsStatus: BranchJobsStatus,
  orderSnapshotId: string | null,
): JobLink {
  if (!orderSnapshotId) return { status: "none" };
  if (jobsStatus === "pending") return { status: "pending", orderSnapshotId };
  if (jobsStatus === "error") return { status: "error", orderSnapshotId };
  const matches = jobs.filter((job) => job.orderSnapshotId === orderSnapshotId);
  if (matches.length === 0) return { status: "missing", orderSnapshotId };
  if (matches.length > 1) return { status: "ambiguous" };
  const job = matches[0];
  return job ? { status: "matched", orderSnapshotId, job } : { status: "missing", orderSnapshotId };
}

function configurationCell(
  assembly: RequestAssemblyWorkTransport | null,
  quoted: boolean,
): BranchStageCell {
  if (assembly?.revisionPending) {
    return {
      label: assembly.stageLabel,
      detail: "Ansamblul a fost modificat după ofertă",
      tone: "attention",
      href: assemblyHref(assembly.assemblyId),
    };
  }
  if (quoted) return { label: "Înghețată în ofertă", detail: null, tone: "done", href: null };
  if (assembly) {
    return {
      label: assembly.stageLabel,
      detail: null,
      tone: assembly.stage === "NEEDS_REVIEW" ? "attention" : "current",
      href: assemblyHref(assembly.assemblyId),
    };
  }
  return EMPTY;
}

function offerCell(quotes: readonly RequestLinkedOfferTransport[]): BranchStageCell {
  if (quotes.length === 0) return EMPTY;
  const current = quotes.filter((quote) => !quote.superseded);
  if (current.length > 1) {
    return {
      label: "Mai multe oferte curente",
      detail: "Identitatea ofertei curente nu este unică.",
      tone: "attention",
      href: null,
    };
  }
  const active = current[0] ?? null;
  const previous = quotes.filter((quote) => quote.superseded && quote.orderSnapshotId);
  if (active && previous.length > 0) {
    return {
      label: `Curentă · ${active.stageLabel ?? "—"}`,
      detail: `Ofertă anterioară · ${previous[0]?.stageLabel ?? "—"}`,
      tone: active.needsAttention || active.attentionLabel ? "attention" : "current",
      href: quoteHrefFor(active),
    };
  }
  const shown = active ?? quotes[0];
  if (!shown) return EMPTY;
  const label = [shown.reference, shown.stageLabel].filter((part): part is string => Boolean(part)).join(" · ");
  return {
    label: label || "Ofertă",
    detail: moneyLabel(shown.grossDisplay ?? null, shown.currency ?? null),
    tone: shown.orderSnapshotId ? "done" : shown.needsAttention || shown.attentionLabel ? "attention" : "current",
    href: quoteHrefFor(shown),
  };
}

function workCell(link: JobLink, orderSnapshotId: string | null): BranchStageCell {
  switch (link.status) {
    case "none":
      return { label: "—", detail: orderSnapshotId ? null : "apare după acceptare", tone: "empty", href: null };
    case "pending":
      return { label: "—", detail: "Se citește lucrarea.", tone: "waiting", href: jobHref(link.orderSnapshotId) };
    case "error":
      return {
        label: "—",
        detail: "Starea lucrării nu a putut fi citită.",
        tone: "attention",
        href: jobHref(link.orderSnapshotId),
      };
    case "missing":
      return {
        label: "Comandă creată",
        detail: "Lucrarea acestei comenzi nu este în lista citită.",
        tone: "attention",
        href: jobHref(link.orderSnapshotId),
      };
    case "ambiguous":
      return {
        label: "—",
        detail: "Asocierea lucrării nu poate fi demonstrată.",
        tone: "attention",
        href: null,
      };
    case "matched": {
      const released = link.job.stage !== "ORDER_CREATED";
      const detail = released && link.job.stageLabel !== "Eliberată pentru producție" ? link.job.stageLabel : null;
      return {
        label: released ? "Eliberată pentru producție" : link.job.stageLabel,
        detail,
        tone: link.job.needsAttention ? "attention" : "done",
        href: jobHref(link.job.orderSnapshotId),
      };
    }
    default: {
      const exhaustive: never = link;
      return exhaustive;
    }
  }
}

function productionCell(link: JobLink): BranchStageCell {
  switch (link.status) {
    case "none":
    case "pending":
    case "error":
    case "ambiguous":
      return EMPTY;
    case "missing":
      return { label: "—", detail: "după trimiterea în producție", tone: "empty", href: jobHref(link.orderSnapshotId) };
    case "matched":
      return productionFromJob(link.job);
    default: {
      const exhaustive: never = link;
      return exhaustive;
    }
  }
}

function productionFromJob(job: JobListItemTransport): BranchStageCell {
  const href = job.planId ? executionHref(job.planId) : jobHref(job.orderSnapshotId);
  switch (job.stage) {
    case "ORDER_CREATED":
      return { label: "—", detail: "după trimiterea în producție", tone: "empty", href: jobHref(job.orderSnapshotId) };
    case "RELEASED":
      return { label: "—", detail: "fără plan de execuție", tone: "waiting", href };
    case "EXECUTION_PLANNED":
      return { label: job.stageLabel, detail: job.progressLabel, tone: "current", href };
    case "EXECUTION_IN_PROGRESS":
      return { label: job.progressLabel || job.stageLabel, detail: null, tone: "current", href };
    case "EXECUTION_COMPLETED":
      return { label: job.progressLabel || job.stageLabel, detail: null, tone: "done", href };
    default:
      return { label: job.stageLabel, detail: job.progressLabel, tone: "current", href };
  }
}

function assemblyNote(
  assembly: RequestAssemblyWorkTransport,
  current: readonly RequestLinkedOfferTransport[],
  previousOrdered: readonly RequestLinkedOfferTransport[],
  link: JobLink,
): string | null {
  if (current.length === 1 && previousOrdered.length > 0 && !current[0]?.orderSnapshotId) {
    const progress = link.status === "matched" ? link.job.progressLabel : null;
    return progress
      ? `Comanda și progresul (${progress}) rămân pe oferta care a generat comanda, nu pe oferta curentă.`
      : "Comanda și progresul rămân pe oferta care a generat comanda, nu pe oferta curentă.";
  }
  if (assembly.revisionPending) return "Ansamblul a fost modificat după ofertă.";
  if (link.status === "matched" && link.job.stage === "EXECUTION_COMPLETED") {
    return "Producția este finalizată. Această stare nu confirmă livrarea sau montajul.";
  }
  if (link.status === "matched" && link.job.stage === "ORDER_CREATED") {
    return "Comanda este creată. Producția nu a pornit.";
  }
  if (link.status === "matched" && link.job.stage === "RELEASED") {
    return "Lucrarea este eliberată pentru producție și nu are încă un plan.";
  }
  return null;
}

function productNote(link: JobLink): string | null {
  if (link.status === "matched" && link.job.stage === "ORDER_CREATED") return "Comanda este creată. Producția nu a pornit.";
  if (link.status === "matched" && link.job.stage === "RELEASED") {
    return "Lucrarea este eliberată pentru producție și nu are încă un plan.";
  }
  if (link.status === "matched" && link.job.stage === "EXECUTION_COMPLETED") {
    return "Producția este finalizată. Această stare nu confirmă livrarea sau montajul.";
  }
  return null;
}

function assemblyPrimary(
  assembly: RequestAssemblyWorkTransport,
  current: readonly RequestLinkedOfferTransport[],
  link: JobLink,
): BranchAction | null {
  if (current.length === 1 && current[0] && !current[0].orderSnapshotId) {
    return { label: offerActionLabel(current[0]), href: quoteHrefFor(current[0]) };
  }
  if (current.length > 1) return null;
  if (link.status === "matched") {
    return { label: "Deschide fișa lucrării", href: jobHref(link.job.orderSnapshotId) };
  }
  if (assembly.orderSnapshotId) return { label: "Deschide fișa lucrării", href: jobHref(assembly.orderSnapshotId) };
  if (assembly.quoteSnapshotId) {
    return { label: "Deschide oferta comună", href: assemblyQuoteHref(assembly.quoteSnapshotId) };
  }
  return {
    label: assembly.membersEditable ? "Continuă ansamblul" : "Deschide ansamblul",
    href: assemblyHref(assembly.assemblyId),
  };
}

function productPrimary(offer: RequestLinkedOfferTransport, link: JobLink): BranchAction | null {
  if (!offer.orderSnapshotId) return { label: offerActionLabel(offer), href: quoteHrefFor(offer) };
  if (link.status === "matched") return { label: "Deschide fișa lucrării", href: jobHref(link.job.orderSnapshotId) };
  return { label: "Deschide fișa lucrării", href: jobHref(offer.orderSnapshotId) };
}

function offerActionLabel(offer: RequestLinkedOfferTransport): string {
  return offer.reference ? `Deschide oferta ${offer.reference}` : "Deschide oferta";
}

function offerState(offer: RequestLinkedOfferTransport): { state: BranchCommercialState; label: string } {
  if (offer.orderSnapshotId || offer.stage === "ORDER_CREATED") {
    return { state: "ordered", label: offer.attentionLabel?.trim() || offer.stageLabel?.trim() || "—" };
  }
  if (offer.stage === "QUOTE_ACCEPTED") {
    return { state: "accepted", label: offer.attentionLabel?.trim() || offer.stageLabel?.trim() || "—" };
  }
  if (offer.dispositionLabel) {
    return { state: "quoted", label: offer.dispositionLabel };
  }
  const label = offer.attentionLabel?.trim() || offer.stageLabel?.trim() || "—";
  if (offer.stage === "QUOTE_CREATED") return { state: "quoted", label };
  return { state: "unclear", label };
}

function jobCell(link: JobLink): BranchJobCell {
  switch (link.status) {
    case "none":
      return { label: "—", href: null, tone: "empty" };
    case "pending":
      return { label: "Se citește…", href: null, tone: "waiting" };
    case "error":
      return { label: "Necitită", href: null, tone: "attention" };
    case "ambiguous":
      return { label: "Asociere neclară", href: null, tone: "attention" };
    case "missing":
      return { label: "Fișa lucrării", href: jobHref(link.orderSnapshotId), tone: "current" };
    case "matched":
      return { label: "Fișa lucrării", href: jobHref(link.job.orderSnapshotId), tone: link.job.needsAttention ? "attention" : "done" };
    default: {
      const exhaustive: never = link;
      return exhaustive;
    }
  }
}

const dayLabel = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });

function createdDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dayLabel.format(date);
}

/** Offer → order → job sheet, each from its own record; an empty step says what it waits for. */
function branchChain(input: {
  offer: RequestLinkedOfferTransport | null;
  offerPrice: string | null;
  orderSnapshotId: string | null;
  link: JobLink;
}): BranchChainStep[] {
  const { offer, orderSnapshotId, link } = input;
  const accepted = offer?.stage === "QUOTE_ACCEPTED" || offer?.stage === "ORDER_CREATED" || Boolean(orderSnapshotId);
  const offerStep: BranchChainStep = offer
    ? {
        key: "offer",
        name: accepted ? "Ofertă acceptată" : "Ofertă",
        value: [offer.reference, input.offerPrice].filter(Boolean).join(" · ") || "Ofertă",
        detail: accepted
          ? offer.stageLabel?.trim() || null
          : [createdDay(offer.createdAt) ? `Creată ${createdDay(offer.createdAt)}` : null, offer.attentionLabel?.toLocaleLowerCase("ro")]
              .filter(Boolean)
              .join(" · ") || null,
        tone: accepted ? "done" : offer.needsAttention ? "attention" : "current",
      }
    : { key: "offer", name: "Ofertă", value: "—", detail: "Apare după înghețarea configurației", tone: "empty" };
  const orderStep: BranchChainStep = orderSnapshotId
    ? { key: "order", name: "Comandă", value: "Comandă creată", detail: "Păstrează sumele acestei oferte", tone: "done" }
    : {
        key: "order",
        name: "Comandă",
        value: "—",
        detail: offer?.stage === "QUOTE_ACCEPTED" ? offer.attentionLabel?.trim() || "Urmează comanda" : "Apare după acceptarea acestei oferte",
        tone: offer?.stage === "QUOTE_ACCEPTED" ? "attention" : "empty",
      };
  return [offerStep, orderStep, jobStep(link)];
}

function jobStep(link: JobLink): BranchChainStep {
  const name = "Fișa lucrării";
  switch (link.status) {
    case "none":
      return { key: "job", name, value: "—", detail: "Apare după comandă", tone: "empty" };
    case "pending":
      return { key: "job", name, value: "Se citește…", detail: null, tone: "waiting" };
    case "error":
      return {
        key: "job",
        name,
        value: "Fișa lucrării nu a putut fi citită",
        detail: "Oferta și comanda sunt afișate din cerere. Fișa se poate deschide în continuare.",
        tone: "attention",
      };
    case "missing":
      return { key: "job", name, value: "Comandă creată", detail: "Lucrarea acestei comenzi nu este în lista citită.", tone: "attention" };
    case "ambiguous":
      return { key: "job", name, value: "—", detail: "Asocierea lucrării nu poate fi demonstrată.", tone: "attention" };
    case "matched":
      return {
        key: "job",
        name,
        value: link.job.stageLabel,
        detail: link.job.progressLabel ?? (link.job.stage === "ORDER_CREATED" ? "Trimiterea în producție se face din fișa lucrării" : null),
        tone: link.job.needsAttention ? "attention" : "done",
      };
    default: {
      const exhaustive: never = link;
      return exhaustive;
    }
  }
}

function quoteViews(quotes: readonly RequestLinkedOfferTransport[], link: JobLink): BranchQuoteView[] {
  const jobOrder = link.status === "matched" ? link.orderSnapshotId : null;
  return [...quotes]
    .sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.quoteSnapshotId.localeCompare(right.quoteSnapshotId))
    .map((quote) => ({
      quoteSnapshotId: quote.quoteSnapshotId,
      kind: quote.kind,
      reference: quote.reference,
      productLabel: quote.productLabel,
      stageLabel: quote.stageLabel,
      superseded: quote.superseded,
      attentionLabel: quote.attentionLabel,
      orderSnapshotId: quote.orderSnapshotId,
      grossDisplay: quote.grossDisplay ?? null,
      currency: quote.currency ?? null,
      href: quoteHrefFor(quote),
      holdsJob: Boolean(jobOrder && quote.orderSnapshotId === jobOrder),
      resumable: Boolean(quote.resumable),
    }));
}

function quoteHrefFor(offer: RequestLinkedOfferTransport): string {
  return offer.kind === "ASSEMBLY" ? assemblyQuoteHref(offer.quoteSnapshotId) : quoteHref(offer.productCode, offer.quoteSnapshotId);
}

function orderBranches(branches: CommercialBranch[]): CommercialBranch[] {
  return branches
    .map((branch, encounter) => ({ branch, encounter }))
    .sort((left, right) => {
      const leftAt = left.branch.registeredAt;
      const rightAt = right.branch.registeredAt;
      if (leftAt && rightAt && leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
      if (leftAt && !rightAt) return -1;
      if (!leftAt && rightAt) return 1;
      return left.encounter - right.encounter;
    })
    .map((item) => item.branch);
}

function earliest(values: readonly (string | null)[]): string | null {
  const present = values.filter((value): value is string => Boolean(value)).sort();
  return present[0] ?? null;
}

function priceLabel(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

function moneyLabel(display: string | null, currency: string | null): string | null {
  if (!display) return null;
  if (!currency || display.includes(currency)) return display;
  return `${display} ${currency}`;
}

function localConfigurations(input: {
  requestId: string;
  customerId: string | null;
  session: ConfiguratorSession | null;
  offers: readonly RequestLinkedOfferTransport[];
}): LocalConfigurationNotice[] {
  if (!input.session) return [];
  const found = new Map<string, { productCode: string; customerId: string | null; assemblyId: string | null; hasValues: boolean }>();
  const consider = (
    context: { productCode: string | null; requestId: string | null; customerId: string | null; assemblyId?: string | null },
    drafts: Record<string, string>,
  ) => {
    if (context.requestId !== input.requestId || !context.productCode) return;
    if (Object.keys(drafts).length === 0) return;
    const sessionKey = configuratorContextKey({
      productCode: context.productCode,
      requestId: context.requestId,
      customerId: context.customerId,
      ...(context.assemblyId ? { assemblyId: context.assemblyId } : {}),
    });
    found.set(sessionKey, {
      productCode: context.productCode,
      customerId: context.customerId,
      assemblyId: context.assemblyId ?? null,
      hasValues: true,
    });
  };
  consider(input.session.draftContext, input.session.drafts);
  for (const entry of Object.values(input.session.draftRecovery ?? {})) consider(entry.context, entry.drafts);
  return [...found.entries()].map(([sessionKey, draft]) => {
    const href = configuratorHref({
      customerId: draft.customerId ?? input.customerId,
      requestId: input.requestId,
      productCode: draft.productCode,
    });
    const withAssembly = draft.assemblyId ? `${href}${href.includes("?") ? "&" : "?"}assembly=${encodeURIComponent(draft.assemblyId)}` : href;
    const frozen = input.offers.find((offer) => offer.productCode === draft.productCode && !offer.superseded);
    const named = frozen?.productLabel?.trim()
      || input.offers.find((offer) => offer.productCode === draft.productCode)?.productLabel?.trim();
    const frozenReference = frozen?.reference?.trim();
    return {
      sessionKey,
      persisted: false as const,
      title: named ? `Configurare locală · ${named}` : "Configurare locală",
      detail: frozen
        ? `Ciornă în acest tab, separată de oferta înghețată${frozenReference ? ` ${frozenReference}` : ""}. Nu înlocuiește oferta și nu e o ramură salvată.`
        : "Nu e o ramură salvată. Reîmprospătarea acestui tab poate păstra valorile; închiderea tabului le poate pierde.",
      href: withAssembly,
    };
  });
}
