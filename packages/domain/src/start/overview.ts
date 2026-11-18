import type { OfferingRuleId, PriceApprovalStatus } from "../commercial/offeringPolicy.js";
import { offeringRuleLabel, priceApprovalStatusLabel } from "../commercial/offeringPolicy.js";
import { presentIssueAttention } from "../execution/taskDossier.js";
import {
  ORGANIZATION_ROLE_PRESENTATION,
  capabilityExclusiveRole,
  type OrganizationCapability,
} from "../governance/organizationRoles.js";
import { jobStageLabel, type JobOverviewItem, type JobOverviewProjection, type JobStage } from "../jobs/overview.js";
import { offerCommercialStatusLabel } from "../commercial/journey/offerStatus.js";
import type { QuoteOverviewItem, QuoteOverviewProjection } from "../quotes/overview.js";
import { commercialRequestStatusLabel, type CommercialRequestStatus } from "../requests/commercialRequest.js";
import type { RequestOverviewItem, RequestOverviewProjection } from "../requests/overview.js";

/**
 * Start · one read-only orientation projection over facts owned elsewhere.
 *
 * It classifies nothing new in the business: every entry repeats a state the request journey,
 * the offer status, the job attention or the price approval ledger already decided. The three
 * levels are presentation categories, not lifecycle statuses:
 *
 * - ACTION    a recorded request waits for a decision that only the actor's role may take;
 * - ATTENTION something needs inspection or coordination, with no personal assignment implied;
 * - WATCH     a reported situation to observe; nothing is claimed to be blocked.
 *
 * WorkOS records no personal assignment of commercial work, so a permission is never shown as an
 * assignment, an overdue target date is never shown as a decision, and a reported issue is never
 * shown as a confirmed blocker.
 */
export const START_ATTENTION_LEVELS = ["ACTION", "ATTENTION", "WATCH"] as const;
export type StartAttentionLevel = (typeof START_ATTENTION_LEVELS)[number];

export const START_SOURCE_IDS = ["REQUESTS", "QUOTES", "JOBS", "PRICE_APPROVALS", "SETUP"] as const;
export type StartSourceId = (typeof START_SOURCE_IDS)[number];

/** NOT_PERMITTED sources are omitted from the projection; they are never reported as failures. */
export type StartSourceInput<T> =
  | { status: "READY"; value: T }
  | { status: "UNAVAILABLE" }
  | { status: "NOT_PERMITTED" };

export type StartSourceState = {
  id: StartSourceId;
  label: string;
  status: "READY" | "UNAVAILABLE";
};

/** The identity of a destination. The client translates it into its own canonical route. */
export type StartTarget =
  | { kind: "PRICE_APPROVALS" }
  | { kind: "REQUEST"; requestId: string }
  | { kind: "REQUEST_PRODUCT"; requestId: string }
  | { kind: "ASSEMBLY"; assemblyId: string }
  | { kind: "QUOTE"; quoteKind: "PRODUCT" | "ASSEMBLY"; productCode: string; quoteSnapshotId: string }
  | { kind: "JOB"; jobId: string; section: "OPERATIONS" | null }
  | { kind: "REQUESTS_REGISTER" }
  | { kind: "QUOTES_REGISTER" }
  | { kind: "JOBS_REGISTER" };

export type StartAttentionObjectKind = "PRICE_APPROVAL" | "QUOTE" | "JOB";

export type StartAttentionEntry = {
  key: string;
  level: StartAttentionLevel;
  objectKind: StartAttentionObjectKind;
  objectKindLabel: string;
  reference: string | null;
  reasonLabel: string;
  title: string;
  detail: string;
  /** Instant the declared ordering uses (oldest first inside a level). Not a priority score. */
  since: string;
  actionLabel: string;
  actionNote: string | null;
  target: StartTarget;
};

export type StartContinueItem = {
  requestId: string;
  reference: string;
  title: string;
  statusLabel: string;
  contextLabel: string;
  nextActionLabel: string;
  target: StartTarget;
};

export type StartFlowTone = "neutral" | "progress" | "pending" | "rest";

export type StartFlowSegment = {
  id: string;
  label: string;
  count: number;
  tone: StartFlowTone;
};

export type StartFlowStageId = "REQUESTS" | "QUOTES" | "JOBS" | "EXECUTION";

export type StartFlowStage = {
  id: StartFlowStageId;
  label: string;
  status: "READY" | "UNAVAILABLE";
  /** Null when the source could not be read. Never a substitute zero. */
  total: number | null;
  unitLabel: string;
  segments: readonly StartFlowSegment[];
  highlight: { label: string; tone: "attention" | "neutral" | "quiet" } | null;
  emptyLabel: string;
  emptyHint: string;
  target: StartTarget;
};

export type StartSetup = {
  /** Null when the offered products could not be resolved. */
  enabledProductCount: number | null;
  canManage: boolean;
  /** Optional capabilities that are not in use. They never block work. */
  optionalNotes: readonly string[];
};

export type StartOverviewProjection = {
  readAt: string;
  sources: readonly StartSourceState[];
  attention: {
    entries: readonly StartAttentionEntry[];
    counts: Record<StartAttentionLevel, number>;
    /** Levels that may be incomplete because a source they depend on could not be read. */
    incompleteLevels: readonly StartAttentionLevel[];
  };
  /** Null when the actor may not work on requests. */
  continueWork: {
    status: "READY" | "UNAVAILABLE";
    total: number;
    items: readonly StartContinueItem[];
  } | null;
  flow: readonly StartFlowStage[];
  /** NONE = every permitted source was read and holds nothing. UNKNOWN = a source is missing. */
  activity: "NONE" | "PRESENT" | "UNKNOWN";
  setup: StartSetup | null;
  canCreateRequest: boolean;
};

export type StartPriceApprovalInput = {
  approvalId: string;
  status: PriceApprovalStatus;
  requestId: string;
  requestReference: string | null;
  requestTitle: string | null;
  customerDisplayName: string | null;
  triggeredRules: readonly OfferingRuleId[];
  requestedByLabel: string;
  requestedAt: string;
};

export type StartJobIssueState = { open: number; acknowledged: number };

export type StartSetupInput = {
  enabledProductCount: number | null;
  activePeopleCount: number;
};

export type StartOverviewInput = {
  readAt: string;
  can: (capability: OrganizationCapability) => boolean;
  requests: StartSourceInput<RequestOverviewProjection>;
  quotes: StartSourceInput<QuoteOverviewProjection>;
  jobs: StartSourceInput<{
    overview: JobOverviewProjection;
    issueStates: ReadonlyMap<string, StartJobIssueState>;
  }>;
  priceApprovals: StartSourceInput<readonly StartPriceApprovalInput[]>;
  setup: StartSourceInput<StartSetupInput>;
};

const PRICE_APPROVAL_CAPABILITY: OrganizationCapability = "quotes.price_exception.approve";

const LEVEL_RANK: Record<StartAttentionLevel, number> = { ACTION: 0, ATTENTION: 1, WATCH: 2 };

export function startSourceLabel(id: StartSourceId): string {
  switch (id) {
    case "REQUESTS":
      return "Cererile";
    case "QUOTES":
      return "Ofertele";
    case "JOBS":
      return "Lucrările";
    case "PRICE_APPROVALS":
      return "Aprobările de preț";
    case "SETUP":
      return "Setările organizației";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function startAttentionLevelLabel(level: StartAttentionLevel): string {
  switch (level) {
    case "ACTION":
      return "Cer acțiunea ta";
    case "ATTENTION":
      return "Necesită atenție";
    case "WATCH":
      return "De urmărit";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

function objectTitle(customer: string | null, label: string, inscription: string | null): string {
  const product = inscription && inscription.trim() !== "" ? `${label} „${inscription.trim()}”` : label;
  return customer ? `${customer} — ${product}` : product;
}

function priceApprovalEntry(approval: StartPriceApprovalInput): StartAttentionEntry {
  const exclusiveRole = capabilityExclusiveRole(PRICE_APPROVAL_CAPABILITY);
  const rules = approval.triggeredRules.map(offeringRuleLabel);
  const reason = rules.length > 0 ? `${rules.join(". ")}.` : "Prețul cere aprobare înainte de ofertă.";
  return {
    key: `approval:${approval.approvalId}`,
    level: "ACTION",
    objectKind: "PRICE_APPROVAL",
    objectKindLabel: "Aprobare de preț",
    reference: approval.requestReference,
    reasonLabel: priceApprovalStatusLabel("REQUESTED"),
    title: objectTitle(approval.customerDisplayName, approval.requestTitle ?? "Ofertă în pregătire", null),
    detail: `${reason} Solicitată de ${approval.requestedByLabel}.`,
    since: approval.requestedAt,
    actionLabel: "Deschide solicitarea",
    actionNote: exclusiveRole
      ? `Ofertare · numai rolul ${ORGANIZATION_ROLE_PRESENTATION[exclusiveRole].label}`
      : "Ofertare",
    target: { kind: "PRICE_APPROVALS" },
  };
}

function quoteEntry(
  quote: QuoteOverviewItem,
  can: StartOverviewInput["can"],
): StartAttentionEntry | null {
  if (!quote.needsAttention) {
    return null;
  }
  const accepted = quote.commercialStatus === "ACCEPTED_WITHOUT_ORDER";
  const notes: string[] = [];
  if (can("prices.client.read")) {
    notes.push(`${quote.grossDisplay} ${quote.currency}`);
  }
  if (accepted) {
    notes.push(can("quotes.accept") ? "pas permis rolului tău" : "comanda se confirmă de Proprietar");
  }
  return {
    key: `quote:${quote.quoteSnapshotId}`,
    level: "ATTENTION",
    objectKind: "QUOTE",
    objectKindLabel: "Ofertă",
    reference: quote.reference,
    reasonLabel: quote.commercialStatusLabel,
    title: objectTitle(quote.customerDisplayName, quote.productLabel, quote.inscription),
    detail: accepted
      ? "Oferta este acceptată. Comanda nu este încă confirmată."
      : "Urmărirea comercială este încheiată, iar oferta nu are o decizie înregistrată.",
    since: quote.createdAt,
    actionLabel: "Deschide oferta",
    actionNote: notes.length > 0 ? notes.join(" · ") : null,
    target: {
      kind: "QUOTE",
      quoteKind: quote.kind,
      productCode: quote.productCode,
      quoteSnapshotId: quote.quoteSnapshotId,
    },
  };
}

/** A reported issue is described as reported and, at most, taken over. Never as a blocker. */
export function startIssuePhrase(state: StartJobIssueState): string | null {
  const total = state.open + state.acknowledged;
  if (total <= 0) {
    return null;
  }
  if (total === 1) {
    return state.open === 1 ? "o problemă raportată, încă nepreluată" : "o problemă raportată, preluată";
  }
  if (state.open === 0) {
    return `${total} probleme raportate, toate preluate`;
  }
  return `${total} probleme raportate, ${state.open} nepreluate`;
}

function jobIsIssueOnly(job: JobOverviewItem): boolean {
  return job.activeIssueCount > 0 && job.attentionLabel === presentIssueAttention(job.activeIssueCount);
}

function jobActionLabel(stage: JobStage): string {
  switch (stage) {
    case "ORDER_CREATED":
    case "RELEASED":
      return "Deschide lucrarea";
    case "EXECUTION_PLANNED":
      return "Vezi operațiile";
    case "EXECUTION_IN_PROGRESS":
      return "Urmărește producția";
    case "EXECUTION_COMPLETED":
      return "Deschide lucrarea";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

function jobEntry(job: JobOverviewItem, issue: StartJobIssueState | undefined): StartAttentionEntry | null {
  if (!job.needsAttention || !job.attentionLabel) {
    return null;
  }
  const issueOnly = jobIsIssueOnly(job);
  const issuePhrase = startIssuePhrase(
    issue ?? { open: job.activeIssueCount, acknowledged: 0 },
  );
  const parts = [job.stageLabel];
  if (job.progressLabel && job.stage !== "EXECUTION_PLANNED") {
    parts.push(job.progressLabel);
  }
  if (job.targetDate) {
    parts.push(`termen țintă ${job.targetDateLabel}`);
  }
  if (issuePhrase && job.activeIssueCount > 0) {
    parts.push(issuePhrase);
  }
  return {
    key: `job:${job.jobId}`,
    level: issueOnly ? "WATCH" : "ATTENTION",
    objectKind: "JOB",
    objectKindLabel: "Lucrare",
    reference: null,
    reasonLabel: job.attentionLabel,
    title: objectTitle(job.customerDisplayName, job.productLabel, job.inscription),
    detail: parts.join(" · "),
    since: job.createdAt,
    actionLabel: jobActionLabel(job.stage),
    actionNote: "Fișa lucrării",
    target: { kind: "JOB", jobId: job.jobId, section: job.planId ? "OPERATIONS" : null },
  };
}

function requestIsOpen(request: RequestOverviewItem): boolean {
  return request.commercialState === "OPEN" && request.status !== "CANCELLED";
}

/**
 * A request is continued here when its journey names a step on the request itself. Offer steps
 * (order confirmation, an undecided offer) are already attention entries on the offer, so the
 * same situation is never shown twice.
 */
function requestHasOwnNextStep(request: RequestOverviewItem): boolean {
  if (!requestIsOpen(request)) {
    return false;
  }
  if (request.journey.nextAction === "CHOOSE_PRODUCT") {
    return true;
  }
  return request.journey.actionable.some(
    (item) =>
      item.kind === "PREPARE_OFFER" || item.kind === "CONTINUE_ASSEMBLY" || item.kind === "REQUEST_BLOCKED",
  );
}

function continueTarget(request: RequestOverviewItem): StartTarget {
  const journey = request.journey;
  if (journey.nextAction === "CHOOSE_PRODUCT") {
    return { kind: "REQUEST_PRODUCT", requestId: request.requestId };
  }
  if (journey.nextAction === "OPEN_ASSEMBLY") {
    const assembly = journey.actionable.find(
      (item) => item.href === journey.nextActionHref && item.assemblyId,
    );
    if (assembly?.assemblyId) {
      return { kind: "ASSEMBLY", assemblyId: assembly.assemblyId };
    }
  }
  return { kind: "REQUEST", requestId: request.requestId };
}

function continueItem(request: RequestOverviewItem): StartContinueItem {
  const context = [request.customerDisplayName, request.journey.offerSummary.summaryLabel.toLocaleLowerCase("ro-RO")]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return {
    requestId: request.requestId,
    reference: request.reference,
    title: request.title,
    statusLabel: request.statusLabel,
    contextLabel: context,
    nextActionLabel: request.journey.nextActionLabel,
    target: continueTarget(request),
  };
}

function oldestFirst<T extends { createdAt: string; requestId: string }>(left: T, right: T): number {
  const time = left.createdAt.localeCompare(right.createdAt);
  return time !== 0 ? time : left.requestId.localeCompare(right.requestId);
}

function segment(id: string, label: string, count: number, tone: StartFlowTone): StartFlowSegment[] {
  return count > 0 ? [{ id, label, count, tone }] : [];
}

function unavailableStage(
  id: StartFlowStageId,
  label: string,
  target: StartTarget,
  empty: { label: string; hint: string },
): StartFlowStage {
  return {
    id,
    label,
    status: "UNAVAILABLE",
    total: null,
    unitLabel: "",
    segments: [],
    highlight: null,
    emptyLabel: empty.label,
    emptyHint: empty.hint,
    target,
  };
}

const REQUEST_EMPTY = { label: "Nicio cerere încă", hint: "Prima cerere apare aici, cu starea ei." };
const QUOTE_EMPTY = { label: "Nicio ofertă încă", hint: "Apar după ce pregătești o ofertă dintr-o cerere." };
const JOB_EMPTY = { label: "Nicio lucrare încă", hint: "Apar după confirmarea unei comenzi." };
const EXECUTION_EMPTY = { label: "Nimic în execuție", hint: "Apare când o lucrare intră în lucru." };

const REQUEST_FLOW_STATUSES: readonly { status: CommercialRequestStatus; tone: StartFlowTone }[] = [
  { status: "NEW", tone: "neutral" },
  { status: "IN_REVIEW", tone: "progress" },
  { status: "WAITING_CUSTOMER", tone: "rest" },
  { status: "READY_FOR_QUOTE", tone: "pending" },
  { status: "BLOCKED", tone: "pending" },
];

function requestStage(input: StartSourceInput<RequestOverviewProjection>): StartFlowStage | null {
  const target: StartTarget = { kind: "REQUESTS_REGISTER" };
  if (input.status === "NOT_PERMITTED") {
    return null;
  }
  if (input.status === "UNAVAILABLE") {
    return unavailableStage("REQUESTS", "Cereri", target, REQUEST_EMPTY);
  }
  const open = input.value.requests.filter(requestIsOpen);
  const withStep = open.filter(requestHasOwnNextStep).length;
  return {
    id: "REQUESTS",
    label: "Cereri",
    status: "READY",
    total: open.length,
    unitLabel: open.length === 1 ? "cerere deschisă" : "cereri deschise",
    segments: REQUEST_FLOW_STATUSES.flatMap(({ status, tone }) =>
      segment(
        status,
        commercialRequestStatusLabel(status),
        open.filter((request) => request.status === status).length,
        tone,
      ),
    ),
    highlight:
      withStep > 0
        ? {
            label: withStep === 1 ? "1 are un pas următor valid" : `${withStep} au un pas următor valid`,
            tone: "attention",
          }
        : { label: "Nicio cerere nu așteaptă un pas", tone: "quiet" },
    emptyLabel: REQUEST_EMPTY.label,
    emptyHint: REQUEST_EMPTY.hint,
    target,
  };
}

function quoteStage(
  input: StartSourceInput<QuoteOverviewProjection>,
  approvals: StartSourceInput<readonly StartPriceApprovalInput[]>,
): StartFlowStage | null {
  const target: StartTarget = { kind: "QUOTES_REGISTER" };
  if (input.status === "NOT_PERMITTED") {
    return null;
  }
  if (input.status === "UNAVAILABLE") {
    return unavailableStage("QUOTES", "Oferte", target, QUOTE_EMPTY);
  }
  const active = input.value.quotes.filter((quote) => quote.followUp);
  const count = (status: QuoteOverviewItem["commercialStatus"]) =>
    active.filter((quote) => quote.commercialStatus === status).length;
  const accepted = count("ACCEPTED_WITHOUT_ORDER");
  const pendingApprovals = approvals.status === "READY" ? approvals.value.length : 0;
  const notes: string[] = [];
  if (pendingApprovals > 0) {
    notes.push(
      pendingApprovals === 1 ? "1 cere aprobarea ta" : `${pendingApprovals} cer aprobarea ta`,
    );
  }
  if (accepted > 0) {
    notes.push(accepted === 1 ? "1 fără comandă" : `${accepted} fără comandă`);
  }
  return {
    id: "QUOTES",
    label: "Oferte",
    status: "READY",
    total: active.length,
    unitLabel: active.length === 1 ? "ofertă activă" : "oferte active",
    segments: [
      ...segment("AWAITING_CUSTOMER", offerCommercialStatusLabel("AWAITING_CUSTOMER"), count("AWAITING_CUSTOMER"), "neutral"),
      ...segment("ACCEPTED_WITHOUT_ORDER", offerCommercialStatusLabel("ACCEPTED_WITHOUT_ORDER"), accepted, "pending"),
      ...segment(
        "UNDECIDED_AFTER_CLOSE",
        offerCommercialStatusLabel("UNDECIDED_AFTER_CLOSE"),
        count("UNDECIDED_AFTER_CLOSE"),
        "pending",
      ),
    ],
    highlight:
      notes.length > 0
        ? { label: notes.join(" · "), tone: "attention" }
        : { label: "Nicio ofertă nu așteaptă un pas", tone: "quiet" },
    emptyLabel: QUOTE_EMPTY.label,
    emptyHint: QUOTE_EMPTY.hint,
    target,
  };
}

const JOB_FLOW_STAGES: readonly { stage: JobStage; tone: StartFlowTone }[] = [
  { stage: "ORDER_CREATED", tone: "pending" },
  { stage: "RELEASED", tone: "pending" },
  { stage: "EXECUTION_PLANNED", tone: "neutral" },
  { stage: "EXECUTION_IN_PROGRESS", tone: "progress" },
];

function jobStages(input: StartOverviewInput["jobs"]): StartFlowStage[] {
  const target: StartTarget = { kind: "JOBS_REGISTER" };
  if (input.status === "NOT_PERMITTED") {
    return [];
  }
  if (input.status === "UNAVAILABLE") {
    return [
      unavailableStage("JOBS", "Lucrări", target, JOB_EMPTY),
      unavailableStage("EXECUTION", "Execuție", target, EXECUTION_EMPTY),
    ];
  }
  const active = input.value.overview.jobs.filter((job) => job.stage !== "EXECUTION_COMPLETED");
  const overdue = active.filter((job) => job.overdue).length;
  const running = active.filter((job) => job.stage === "EXECUTION_IN_PROGRESS");
  // Operations are counted from each execution plan's own progress, never inferred from jobs.
  const operations = running.reduce(
    (sum, job) => ({
      total: sum.total + (job.taskCount ?? 0),
      completed: sum.completed + (job.completedCount ?? 0),
      inProgress: sum.inProgress + (job.inProgressCount ?? 0),
    }),
    { total: 0, completed: 0, inProgress: 0 },
  );
  const remaining = Math.max(operations.total - operations.completed - operations.inProgress, 0);
  const withIssues = active.filter((job) => job.activeIssueCount > 0).length;
  return [
    {
      id: "JOBS",
      label: "Lucrări",
      status: "READY",
      total: active.length,
      unitLabel: active.length === 1 ? "lucrare activă" : "lucrări active",
      segments: JOB_FLOW_STAGES.flatMap(({ stage, tone }) =>
        segment(stage, jobStageLabel(stage), active.filter((job) => job.stage === stage).length, tone),
      ),
      highlight:
        overdue > 0
          ? { label: `${overdue} cu termen depășit`, tone: "attention" }
          : { label: "Niciun termen depășit", tone: "quiet" },
      emptyLabel: JOB_EMPTY.label,
      emptyHint: JOB_EMPTY.hint,
      target,
    },
    {
      id: "EXECUTION",
      label: "Execuție",
      status: "READY",
      total: operations.total,
      unitLabel:
        running.length === 1
          ? `${operations.total === 1 ? "operație" : "operații"}, într-o lucrare în lucru`
          : `${operations.total === 1 ? "operație" : "operații"}, în ${running.length} lucrări în lucru`,
      segments: [
        ...segment("COMPLETED", "Finalizate", operations.completed, "neutral"),
        ...segment("IN_PROGRESS", "În lucru acum", operations.inProgress, "progress"),
        ...segment("REMAINING", "Rămase", remaining, "rest"),
      ],
      highlight:
        withIssues > 0
          ? {
              label:
                withIssues === 1
                  ? "1 lucrare cu probleme raportate"
                  : `${withIssues} lucrări cu probleme raportate`,
              tone: "neutral",
            }
          : { label: "Nicio problemă raportată", tone: "quiet" },
      emptyLabel: EXECUTION_EMPTY.label,
      emptyHint: EXECUTION_EMPTY.hint,
      target,
    },
  ];
}

function sourceState<T>(id: StartSourceId, input: StartSourceInput<T>): StartSourceState[] {
  return input.status === "NOT_PERMITTED"
    ? []
    : [{ id, label: startSourceLabel(id), status: input.status }];
}

export function projectStartOverview(input: StartOverviewInput): StartOverviewProjection {
  const entries: StartAttentionEntry[] = [];
  if (input.priceApprovals.status === "READY" && input.can(PRICE_APPROVAL_CAPABILITY)) {
    for (const approval of input.priceApprovals.value) {
      if (approval.status === "REQUESTED") {
        entries.push(priceApprovalEntry(approval));
      }
    }
  }
  if (input.quotes.status === "READY") {
    for (const quote of input.quotes.value.quotes) {
      const entry = quoteEntry(quote, input.can);
      if (entry) entries.push(entry);
    }
  }
  if (input.jobs.status === "READY") {
    for (const job of input.jobs.value.overview.jobs) {
      const entry = jobEntry(job, input.jobs.value.issueStates.get(job.jobId));
      if (entry) entries.push(entry);
    }
  }
  entries.sort((left, right) => {
    const level = LEVEL_RANK[left.level] - LEVEL_RANK[right.level];
    if (level !== 0) return level;
    const time = left.since.localeCompare(right.since);
    return time !== 0 ? time : left.key.localeCompare(right.key);
  });

  const incomplete = new Set<StartAttentionLevel>();
  if (input.priceApprovals.status === "UNAVAILABLE") incomplete.add("ACTION");
  if (input.quotes.status === "UNAVAILABLE") incomplete.add("ATTENTION");
  if (input.jobs.status === "UNAVAILABLE") {
    incomplete.add("ATTENTION");
    incomplete.add("WATCH");
  }

  const continueWork = ((): StartOverviewProjection["continueWork"] => {
    if (input.requests.status === "NOT_PERMITTED" || !input.can("requests.write")) {
      return null;
    }
    if (input.requests.status === "UNAVAILABLE") {
      return { status: "UNAVAILABLE", total: 0, items: [] };
    }
    const items = input.requests.value.requests
      .filter(requestHasOwnNextStep)
      .sort(oldestFirst)
      .map(continueItem);
    return { status: "READY", total: items.length, items };
  })();

  const flow = [
    requestStage(input.requests),
    quoteStage(input.quotes, input.priceApprovals),
    ...jobStages(input.jobs),
  ].filter((stage): stage is StartFlowStage => stage !== null);

  const business = [input.requests, input.quotes, input.jobs] as const;
  const anyUnavailable = business.some((source) => source.status === "UNAVAILABLE");
  const anyRecord =
    (input.requests.status === "READY" && input.requests.value.requests.length > 0) ||
    (input.quotes.status === "READY" && input.quotes.value.quotes.length > 0) ||
    (input.jobs.status === "READY" && input.jobs.value.overview.jobs.length > 0) ||
    entries.length > 0;

  const setup = ((): StartSetup | null => {
    if (input.setup.status !== "READY") {
      return null;
    }
    return {
      enabledProductCount: input.setup.value.enabledProductCount,
      canManage: input.can("org.settings.manage"),
      optionalNotes:
        input.setup.value.activePeopleCount === 0
          ? ["Oameni, zone și utilaje (necesare doar pentru Atelier)"]
          : [],
    };
  })();

  return {
    readAt: input.readAt,
    sources: [
      ...sourceState("REQUESTS", input.requests),
      ...sourceState("QUOTES", input.quotes),
      ...sourceState("JOBS", input.jobs),
      ...sourceState("PRICE_APPROVALS", input.priceApprovals),
      ...sourceState("SETUP", input.setup),
    ],
    attention: {
      entries,
      counts: {
        ACTION: entries.filter((entry) => entry.level === "ACTION").length,
        ATTENTION: entries.filter((entry) => entry.level === "ATTENTION").length,
        WATCH: entries.filter((entry) => entry.level === "WATCH").length,
      },
      incompleteLevels: START_ATTENTION_LEVELS.filter((level) => incomplete.has(level)),
    },
    continueWork,
    flow,
    activity: anyRecord ? "PRESENT" : anyUnavailable ? "UNKNOWN" : "NONE",
    setup,
    canCreateRequest: input.can("requests.write"),
  };
}
