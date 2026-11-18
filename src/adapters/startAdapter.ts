import { asBoolean, asNumber, asRecord, asString, asStringList } from "./record";

/**
 * Start · typed transport of the server orientation projection (GET /api/start).
 * The server classifies every entry and counts every stage; this adapter only checks the shape.
 * A malformed payload is refused as a whole so the page never renders half a contract.
 */
export type StartAttentionLevel = "ACTION" | "ATTENTION" | "WATCH";
export const START_ATTENTION_LEVELS: readonly StartAttentionLevel[] = ["ACTION", "ATTENTION", "WATCH"];

export type StartSourceId = "REQUESTS" | "QUOTES" | "JOBS" | "PRICE_APPROVALS" | "SETUP";

export type StartTargetTransport =
  | { kind: "PRICE_APPROVALS" }
  | { kind: "REQUEST"; requestId: string }
  | { kind: "REQUEST_PRODUCT"; requestId: string }
  | { kind: "ASSEMBLY"; assemblyId: string }
  | { kind: "QUOTE"; quoteKind: "PRODUCT" | "ASSEMBLY"; productCode: string; quoteSnapshotId: string }
  | { kind: "JOB"; jobId: string; section: "OPERATIONS" | null }
  | { kind: "REQUESTS_REGISTER" }
  | { kind: "QUOTES_REGISTER" }
  | { kind: "JOBS_REGISTER" };

export type StartAttentionEntryTransport = {
  key: string;
  level: StartAttentionLevel;
  objectKind: "PRICE_APPROVAL" | "QUOTE" | "JOB";
  objectKindLabel: string;
  reference: string | null;
  reasonLabel: string;
  title: string;
  detail: string;
  since: string;
  actionLabel: string;
  actionNote: string | null;
  target: StartTargetTransport;
};

export type StartContinueItemTransport = {
  requestId: string;
  reference: string;
  title: string;
  statusLabel: string;
  contextLabel: string;
  nextActionLabel: string;
  target: StartTargetTransport;
};

export type StartFlowTone = "neutral" | "progress" | "pending" | "rest";

export type StartFlowStageTransport = {
  id: "REQUESTS" | "QUOTES" | "JOBS" | "EXECUTION";
  label: string;
  status: "READY" | "UNAVAILABLE";
  total: number | null;
  unitLabel: string;
  segments: { id: string; label: string; count: number; tone: StartFlowTone }[];
  highlight: { label: string; tone: "attention" | "neutral" | "quiet" } | null;
  emptyLabel: string;
  emptyHint: string;
  target: StartTargetTransport;
};

export type StartOverviewTransport = {
  readAt: string;
  sources: { id: StartSourceId; label: string; status: "READY" | "UNAVAILABLE" }[];
  attention: {
    entries: StartAttentionEntryTransport[];
    counts: Record<StartAttentionLevel, number>;
    incompleteLevels: StartAttentionLevel[];
  };
  continueWork: { status: "READY" | "UNAVAILABLE"; total: number; items: StartContinueItemTransport[] } | null;
  flow: StartFlowStageTransport[];
  activity: "NONE" | "PRESENT" | "UNKNOWN";
  setup: { enabledProductCount: number | null; canManage: boolean; optionalNotes: string[] } | null;
  canCreateRequest: boolean;
};

export class StartContractError extends Error {
  constructor(detail: string) {
    super(`start_contract_invalid: ${detail}`);
    this.name = "StartContractError";
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function required<T>(value: T | null, detail: string): T {
  if (value === null) {
    throw new StartContractError(detail);
  }
  return value;
}

function presentTarget(value: unknown): StartTargetTransport {
  const row = required(asRecord(value), "target");
  const kind = asString(row.kind);
  switch (kind) {
    case "PRICE_APPROVALS":
    case "REQUESTS_REGISTER":
    case "QUOTES_REGISTER":
    case "JOBS_REGISTER":
      return { kind };
    case "REQUEST":
    case "REQUEST_PRODUCT":
      return { kind, requestId: required(asString(row.requestId), "target.requestId") };
    case "ASSEMBLY":
      return { kind, assemblyId: required(asString(row.assemblyId), "target.assemblyId") };
    case "QUOTE":
      return {
        kind,
        quoteKind: required(oneOf(row.quoteKind, ["PRODUCT", "ASSEMBLY"] as const), "target.quoteKind"),
        productCode: asString(row.productCode) ?? "",
        quoteSnapshotId: required(asString(row.quoteSnapshotId), "target.quoteSnapshotId"),
      };
    case "JOB":
      return {
        kind,
        jobId: required(asString(row.jobId), "target.jobId"),
        section: row.section === "OPERATIONS" ? "OPERATIONS" : null,
      };
    default:
      throw new StartContractError("target.kind");
  }
}

function presentEntry(value: unknown): StartAttentionEntryTransport {
  const row = required(asRecord(value), "attention.entry");
  return {
    key: required(asString(row.key), "entry.key"),
    level: required(oneOf(row.level, START_ATTENTION_LEVELS), "entry.level"),
    objectKind: required(oneOf(row.objectKind, ["PRICE_APPROVAL", "QUOTE", "JOB"] as const), "entry.objectKind"),
    objectKindLabel: required(asString(row.objectKindLabel), "entry.objectKindLabel"),
    reference: asString(row.reference),
    reasonLabel: required(asString(row.reasonLabel), "entry.reasonLabel"),
    title: required(asString(row.title), "entry.title"),
    detail: asString(row.detail) ?? "",
    since: required(asString(row.since), "entry.since"),
    actionLabel: required(asString(row.actionLabel), "entry.actionLabel"),
    actionNote: asString(row.actionNote),
    target: presentTarget(row.target),
  };
}

function presentContinueItem(value: unknown): StartContinueItemTransport {
  const row = required(asRecord(value), "continue.item");
  return {
    requestId: required(asString(row.requestId), "continue.requestId"),
    reference: asString(row.reference) ?? "",
    title: required(asString(row.title), "continue.title"),
    statusLabel: asString(row.statusLabel) ?? "",
    contextLabel: asString(row.contextLabel) ?? "",
    nextActionLabel: required(asString(row.nextActionLabel), "continue.nextActionLabel"),
    target: presentTarget(row.target),
  };
}

function presentStage(value: unknown): StartFlowStageTransport {
  const row = required(asRecord(value), "flow.stage");
  const status = required(oneOf(row.status, ["READY", "UNAVAILABLE"] as const), "stage.status");
  const highlight = asRecord(row.highlight);
  const total = asNumber(row.total);
  if (status === "READY" && total === null) {
    throw new StartContractError("stage.total");
  }
  return {
    id: required(oneOf(row.id, ["REQUESTS", "QUOTES", "JOBS", "EXECUTION"] as const), "stage.id"),
    label: required(asString(row.label), "stage.label"),
    status,
    // An unavailable stage never carries a number, whatever the payload says.
    total: status === "READY" ? total : null,
    unitLabel: asString(row.unitLabel) ?? "",
    segments: (Array.isArray(row.segments) ? row.segments : []).map((item) => {
      const segment = required(asRecord(item), "stage.segment");
      return {
        id: required(asString(segment.id), "segment.id"),
        label: required(asString(segment.label), "segment.label"),
        count: required(asNumber(segment.count), "segment.count"),
        tone: required(oneOf(segment.tone, ["neutral", "progress", "pending", "rest"] as const), "segment.tone"),
      };
    }),
    highlight: highlight
      ? {
          label: required(asString(highlight.label), "highlight.label"),
          tone: required(oneOf(highlight.tone, ["attention", "neutral", "quiet"] as const), "highlight.tone"),
        }
      : null,
    emptyLabel: asString(row.emptyLabel) ?? "",
    emptyHint: asString(row.emptyHint) ?? "",
    target: presentTarget(row.target),
  };
}

export function presentStartOverview(payload: unknown): StartOverviewTransport {
  const start = required(asRecord(asRecord(payload)?.start), "start");
  const attention = required(asRecord(start.attention), "attention");
  const counts = required(asRecord(attention.counts), "attention.counts");
  const entries = (Array.isArray(attention.entries) ? attention.entries : []).map(presentEntry);
  const continueWork = asRecord(start.continueWork);
  const setup = asRecord(start.setup);
  return {
    readAt: required(asString(start.readAt), "readAt"),
    sources: (Array.isArray(start.sources) ? start.sources : []).map((item) => {
      const source = required(asRecord(item), "source");
      return {
        id: required(
          oneOf(source.id, ["REQUESTS", "QUOTES", "JOBS", "PRICE_APPROVALS", "SETUP"] as const),
          "source.id",
        ),
        label: required(asString(source.label), "source.label"),
        status: required(oneOf(source.status, ["READY", "UNAVAILABLE"] as const), "source.status"),
      };
    }),
    attention: {
      entries,
      counts: {
        ACTION: required(asNumber(counts.ACTION), "counts.ACTION"),
        ATTENTION: required(asNumber(counts.ATTENTION), "counts.ATTENTION"),
        WATCH: required(asNumber(counts.WATCH), "counts.WATCH"),
      },
      incompleteLevels: asStringList(attention.incompleteLevels).flatMap((level) => {
        const known = oneOf(level, START_ATTENTION_LEVELS);
        return known ? [known] : [];
      }),
    },
    continueWork: continueWork
      ? {
          status: required(oneOf(continueWork.status, ["READY", "UNAVAILABLE"] as const), "continue.status"),
          total: asNumber(continueWork.total) ?? 0,
          items: (Array.isArray(continueWork.items) ? continueWork.items : []).map(presentContinueItem),
        }
      : null,
    flow: (Array.isArray(start.flow) ? start.flow : []).map(presentStage),
    activity: required(oneOf(start.activity, ["NONE", "PRESENT", "UNKNOWN"] as const), "activity"),
    setup: setup
      ? {
          enabledProductCount: asNumber(setup.enabledProductCount),
          canManage: asBoolean(setup.canManage) ?? false,
          optionalNotes: asStringList(setup.optionalNotes),
        }
      : null,
    canCreateRequest: asBoolean(start.canCreateRequest) ?? false,
  };
}
