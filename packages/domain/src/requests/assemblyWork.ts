import { assemblyOfferingLabelFor } from "../assembly/contract.js";
import type { AssemblyDefinition } from "../assembly/model.js";
import type {
  AssemblyOrderSnapshot,
  AssemblyProductionSnapshot,
  AssemblyQuoteSnapshot,
} from "../assembly/snapshots.js";

export const REQUEST_ASSEMBLY_WORK_STAGES = [
  "IN_CONFIGURATION",
  "NEEDS_REVIEW",
  "READY_FOR_QUOTE",
  "QUOTE_CREATED",
  "ORDER_CREATED",
  "PRODUCTION_RELEASED",
] as const;
export type RequestAssemblyWorkStage = (typeof REQUEST_ASSEMBLY_WORK_STAGES)[number];

/** Read-only view of one assembly started inside a request, derived from its frozen snapshots. */
export type RequestAssemblyWork = {
  assemblyId: string;
  label: string;
  stage: RequestAssemblyWorkStage;
  stageLabel: string;
  quoteSnapshotId: string | null;
  quoteGrossPrice: number | null;
  currency: "EUR" | null;
  orderSnapshotId: string | null;
  productionSnapshotId: string | null;
  executionPlanId: string | null;
  /** A frozen quote exists but the assembly changed after it; the quote no longer matches. */
  revisionPending: boolean;
  /** Members can still change without orphaning an accepted order. */
  membersEditable: boolean;
  memberProductCodes: readonly string[];
  updatedAt: string;
};

/** Explicit operator intent required to open another assembly on a request that already has one. */
export const REQUEST_COMMERCIAL_ALTERNATIVE_INTENT = "COMMERCIAL_ALTERNATIVE";
/** Explicit operator intent required to freeze a standalone quote for a product already in a request assembly. */
export const REQUEST_SEPARATE_QUOTE_INTENT = "SEPARATE_QUOTE";

export type RequestContinuationRefusal = {
  error: "assembly_exists" | "request_assembly_overlap";
  reasons: readonly string[];
  assemblyId: string;
};

export function requestAssemblyWorkStageLabel(stage: RequestAssemblyWorkStage): string {
  switch (stage) {
    case "IN_CONFIGURATION":
      return "În configurare";
    case "NEEDS_REVIEW":
      return "Necesită revizuire";
    case "READY_FOR_QUOTE":
      return "Gata de ofertă";
    case "QUOTE_CREATED":
      return "Ofertă creată";
    case "ORDER_CREATED":
      return "Comandă creată";
    case "PRODUCTION_RELEASED":
      return "Eliberat în producție";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function projectRequestAssemblyWork(input: {
  definition: AssemblyDefinition;
  quote: AssemblyQuoteSnapshot | null;
  order: AssemblyOrderSnapshot | null;
  production: AssemblyProductionSnapshot | null;
  executionPlanId: string | null;
}): RequestAssemblyWork {
  const { definition, quote, order, production } = input;
  const quoteMatchesTruth =
    quote !== null &&
    definition.status === "CONFIRMED" &&
    quote.assemblyTruthId === definition.confirmedTruthId;
  const stage = deriveStage(definition, quoteMatchesTruth, order, production);
  return {
    assemblyId: definition.assemblyId,
    label: assemblyOfferingLabelFor(
      definition.kind,
      definition.members.map((member) => member.role),
    ),
    stage,
    stageLabel: requestAssemblyWorkStageLabel(stage),
    quoteSnapshotId: quote?.quoteSnapshotId ?? null,
    quoteGrossPrice: quote?.totals.grossPrice ?? null,
    currency: quote ? "EUR" : null,
    orderSnapshotId: order?.orderSnapshotId ?? null,
    productionSnapshotId: production?.snapshotId ?? null,
    executionPlanId: input.executionPlanId,
    revisionPending: quote !== null && order === null && !quoteMatchesTruth,
    membersEditable: order === null,
    memberProductCodes: definition.members.map((member) => member.productCode),
    updatedAt: definition.updatedAt,
  };
}

export function requestAssemblyCreationRefusal(input: {
  assemblies: readonly RequestAssemblyWork[];
  intent: string | null;
}): RequestContinuationRefusal | null {
  const existing = furthestRequestAssembly(input.assemblies);
  if (!existing || input.intent === REQUEST_COMMERCIAL_ALTERNATIVE_INTENT) {
    return null;
  }
  return {
    error: "assembly_exists",
    reasons: [
      `Cererea are deja ansamblul „${existing.label}” (${existing.stageLabel.toLocaleLowerCase("ro")}). Continuă ansamblul existent sau creează explicit o variantă comercială nouă.`,
    ],
    assemblyId: existing.assemblyId,
  };
}

export function assemblyMemberChangeRefusal(
  work: Pick<RequestAssemblyWork, "membersEditable">,
): { error: "assembly_order_frozen"; reasons: readonly string[] } | null {
  if (work.membersEditable) {
    return null;
  }
  return {
    error: "assembly_order_frozen",
    reasons: [
      "Ansamblul are o comandă acceptată. Configurațiile membrilor pot fi doar consultate; pentru modificări creează o variantă comercială nouă din cerere.",
    ],
  };
}

export function requestStandaloneQuoteRefusal(input: {
  productCode: string;
  assemblies: readonly RequestAssemblyWork[];
  intent: string | null;
}): RequestContinuationRefusal | null {
  if (input.intent === REQUEST_SEPARATE_QUOTE_INTENT) {
    return null;
  }
  const overlapping = furthestRequestAssembly(
    input.assemblies.filter((work) => work.memberProductCodes.includes(input.productCode)),
  );
  if (!overlapping) {
    return null;
  }
  return {
    error: "request_assembly_overlap",
    reasons: [
      `Produsul face deja parte din ansamblul „${overlapping.label}” al acestei cereri. Confirmă explicit dacă vrei o ofertă separată.`,
    ],
    assemblyId: overlapping.assemblyId,
  };
}

function deriveStage(
  definition: AssemblyDefinition,
  quoteMatchesTruth: boolean,
  order: AssemblyOrderSnapshot | null,
  production: AssemblyProductionSnapshot | null,
): RequestAssemblyWorkStage {
  if (production) {
    return "PRODUCTION_RELEASED";
  }
  if (order) {
    return "ORDER_CREATED";
  }
  switch (definition.status) {
    case "STALE":
      return "NEEDS_REVIEW";
    case "CONFIRMED":
      return quoteMatchesTruth ? "QUOTE_CREATED" : "READY_FOR_QUOTE";
    case "DRAFT":
      return "IN_CONFIGURATION";
    default: {
      const _exhaustive: never = definition.status;
      return _exhaustive;
    }
  }
}

/** Commercial weight used to pick the furthest work on a request: 0 none, 1 quote, 3 order. */
export function requestAssemblyCommercialRank(work: RequestAssemblyWork): number {
  if (work.orderSnapshotId) {
    return 3;
  }
  return work.quoteSnapshotId ? 1 : 0;
}

export function furthestRequestAssembly(
  assemblies: readonly RequestAssemblyWork[],
): RequestAssemblyWork | null {
  return [...assemblies].sort((left, right) => {
    const delta = requestAssemblyCommercialRank(right) - requestAssemblyCommercialRank(left);
    if (delta !== 0) {
      return delta;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}
