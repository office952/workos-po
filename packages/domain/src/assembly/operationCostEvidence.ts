import {
  INSPECT_FINISHED_ASSEMBLY_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import type { CostEvidence } from "../resources/catalog.js";
import { contentHash } from "./canonical.js";
import {
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  type AssemblyKind,
  type AssemblyMemberRole,
} from "./contract.js";

export const ASSEMBLY_OPERATION_COST_SCHEMA = "assembly-operation-cost-v1" as const;

export const FINAL_INSPECTION_MODES = [
  "NOT_CONFIGURED",
  "INCLUDED_IN_OTHER_OPERATIONS",
  "SEPARATE_LABOR",
] as const;
export type FinalInspectionMode = (typeof FINAL_INSPECTION_MODES)[number];

export const FINAL_PACKAGING_MODES = ["NOT_CONFIGURED", "PANEL_FACE_AREA"] as const;
export type FinalPackagingMode = (typeof FINAL_PACKAGING_MODES)[number];

/** One append-only organization policy version. */
export type AssemblyOperationCostPolicyVersion = {
  version: number;
  finalInspectionMode: FinalInspectionMode;
  finalPackagingMode: FinalPackagingMode;
  updatedAt: string;
  updatedBy: string;
};

/** The policy as frozen in a quote; `version: null` means the organization never configured it. */
export type FrozenAssemblyOperationCostPolicy = {
  version: number | null;
  finalInspectionMode: FinalInspectionMode;
  finalPackagingMode: FinalPackagingMode;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const ASSEMBLY_ESTIMABLE_PROCESS_IDS = [
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  INSPECT_FINISHED_ASSEMBLY_ID,
] as const;
export type AssemblyEstimableProcessId = (typeof ASSEMBLY_ESTIMABLE_PROCESS_IDS)[number];

export const ASSEMBLY_COSTED_PROCESS_IDS = [
  ...ASSEMBLY_ESTIMABLE_PROCESS_IDS,
  PACK_PRODUCT_ID,
] as const;
export type AssemblyCostedProcessId = (typeof ASSEMBLY_COSTED_PROCESS_IDS)[number];

export const MAX_ESTIMATED_PERSON_HOURS = 1000;

/** The assembly-level operations a frozen assembly carries, in production order (site work excluded). */
export function assemblyCostedProcessIds(
  kind: AssemblyKind,
  roles: readonly AssemblyMemberRole[],
): AssemblyCostedProcessId[] {
  switch (kind) {
    case SIGN_ASSEMBLY_ACM_LETTERS_V1:
      return [MOUNT_LETTERS_ON_PANEL_ID, INSPECT_FINISHED_ASSEMBLY_ID, PACK_PRODUCT_ID];
    case SIGN_ASSEMBLY_ACM_SIGNAGE_V2:
      return [
        ...(roles.includes("SIGNAGE_LETTERS")
          ? [MOUNT_LETTERS_ON_PANEL_ID as AssemblyCostedProcessId]
          : []),
        MOUNT_LOGO_ON_PANEL_ID,
        INSPECT_FINISHED_ASSEMBLY_ID,
        PACK_PRODUCT_ID,
      ];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Mutable pre-quotation person-hour estimate kept on the AssemblyDefinition. Only the value read
 * when a quote is frozen becomes evidence; earlier edits are not kept as history.
 */
export type AssemblyOperationEstimate = {
  processId: AssemblyEstimableProcessId;
  personHours: number;
  authorUserId: string;
  recordedAt: string;
};

export type AssemblyOperationQuantityProvenance =
  | { kind: "OPERATOR_ESTIMATE"; authorUserId: string; recordedAt: string }
  | {
      kind: "SUPPORT_PANEL_FACE_AREA";
      memberId: string;
      productionInputHash: string;
      recipeId: string;
    };

export const ASSEMBLY_OPERATION_GAP_OUTCOMES = [
  "MISSING_POLICY",
  "MISSING_QUANTITY",
  "MISSING_RATE",
  "INCOMPATIBLE_UNIT",
] as const;
export type AssemblyOperationGapOutcome = (typeof ASSEMBLY_OPERATION_GAP_OUTCOMES)[number];

export type AssemblyOperationRateVerification = "CONFIRMED" | "NEEDS_VERIFICATION";

/**
 * COSTED uses a confirmed rate. UNCONFIRMED_RATE is equally calculable, but its rate still needs
 * verification and is disclosed through the existing rate acknowledgement.
 */
export type FrozenAssemblyOperationCostedLine = {
  operationId: string;
  processId: AssemblyCostedProcessId;
  outcome: "COSTED" | "UNCONFIRMED_RATE";
  resourceId: string;
  resourceLabel: string;
  recipeId: string | null;
  quantity: number;
  unit: "person_hour" | "m2";
  rate: number;
  currency: "EUR";
  cost: number;
  evidenceRowId: string | null;
  evidenceSource: CostEvidence["source"];
  evidenceClassification: CostEvidence["classification"];
  quantityProvenance: AssemblyOperationQuantityProvenance;
};

export type FrozenAssemblyOperationCostLine =
  | FrozenAssemblyOperationCostedLine
  | {
      operationId: string;
      processId: typeof INSPECT_FINISHED_ASSEMBLY_ID;
      outcome: "INCLUDED";
      policyMode: "INCLUDED_IN_OTHER_OPERATIONS";
    }
  | {
      operationId: string;
      processId: AssemblyCostedProcessId;
      outcome: AssemblyOperationGapOutcome;
      reason: string;
    };

/** Operation ids match the assembly operations projected into production. */
export function assemblyOperationId(processId: string): string {
  return `ANSAMBLARE:${processId}`;
}

export function isCostedOperationLine(
  line: FrozenAssemblyOperationCostLine,
): line is FrozenAssemblyOperationCostedLine {
  return line.outcome === "COSTED" || line.outcome === "UNCONFIRMED_RATE";
}

export type FrozenAssemblyOperationCost = {
  schema: typeof ASSEMBLY_OPERATION_COST_SCHEMA;
  policy: FrozenAssemblyOperationCostPolicy;
  lines: readonly FrozenAssemblyOperationCostLine[];
  knownTotal: number;
  currency: "EUR";
  completeness: "COMPLETE" | "PARTIAL";
  verification: AssemblyOperationRateVerification;
  evidenceHash: string;
};

export function isFinalInspectionMode(value: unknown): value is FinalInspectionMode {
  return typeof value === "string" && (FINAL_INSPECTION_MODES as readonly string[]).includes(value);
}

export function isFinalPackagingMode(value: unknown): value is FinalPackagingMode {
  return typeof value === "string" && (FINAL_PACKAGING_MODES as readonly string[]).includes(value);
}

export function isAssemblyEstimableProcessId(value: unknown): value is AssemblyEstimableProcessId {
  return (
    typeof value === "string" &&
    (ASSEMBLY_ESTIMABLE_PROCESS_IDS as readonly string[]).includes(value)
  );
}

export function isValidEstimatedPersonHours(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_ESTIMATED_PERSON_HOURS &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-9
  );
}

export function frozenPolicyFrom(
  policy: AssemblyOperationCostPolicyVersion | null,
): FrozenAssemblyOperationCostPolicy {
  if (!policy) {
    return {
      version: null,
      finalInspectionMode: "NOT_CONFIGURED",
      finalPackagingMode: "NOT_CONFIGURED",
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    version: policy.version,
    finalInspectionMode: policy.finalInspectionMode,
    finalPackagingMode: policy.finalPackagingMode,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

export function operationCostEvidenceHash(
  policy: FrozenAssemblyOperationCostPolicy,
  lines: readonly FrozenAssemblyOperationCostLine[],
): string {
  return contentHash({ schema: ASSEMBLY_OPERATION_COST_SCHEMA, policy, lines });
}

export function sealAssemblyOperationCost(
  policy: FrozenAssemblyOperationCostPolicy,
  lines: readonly FrozenAssemblyOperationCostLine[],
): FrozenAssemblyOperationCost {
  const costed = lines.filter(isCostedOperationLine);
  return {
    schema: ASSEMBLY_OPERATION_COST_SCHEMA,
    policy,
    lines,
    knownTotal: costed.reduce((sum, line) => sum + line.cost, 0),
    currency: "EUR",
    completeness: lines.every((line) => isCostedOperationLine(line) || line.outcome === "INCLUDED")
      ? "COMPLETE"
      : "PARTIAL",
    verification: costed.some((line) => line.outcome === "UNCONFIRMED_RATE")
      ? "NEEDS_VERIFICATION"
      : "CONFIRMED",
    evidenceHash: operationCostEvidenceHash(policy, lines),
  };
}

export function copyFrozenAssemblyOperationCost(
  evidence: FrozenAssemblyOperationCost,
): FrozenAssemblyOperationCost {
  return {
    ...evidence,
    policy: { ...evidence.policy },
    lines: evidence.lines.map((line) =>
      isCostedOperationLine(line)
        ? { ...line, quantityProvenance: { ...line.quantityProvenance } }
        : { ...line },
    ),
  };
}

/**
 * Accepts frozen evidence only when it is internally consistent: known schema, intact hash,
 * one line per process, and every costed line replayable as quantity × rate. Anything else is
 * treated as absent so it can never produce a COMPLETE result.
 */
export function verifiedOperationCostLines(
  evidence: FrozenAssemblyOperationCost | undefined,
): ReadonlyMap<string, FrozenAssemblyOperationCostLine> | null {
  if (!evidence || evidence.schema !== ASSEMBLY_OPERATION_COST_SCHEMA || !Array.isArray(evidence.lines)) {
    return null;
  }
  if (operationCostEvidenceHash(evidence.policy, evidence.lines) !== evidence.evidenceHash) {
    return null;
  }
  const byProcess = new Map<string, FrozenAssemblyOperationCostLine>();
  for (const line of evidence.lines) {
    if (byProcess.has(line.processId) || !lineIsConsistent(line, evidence.policy)) {
      return null;
    }
    byProcess.set(line.processId, line);
  }
  return byProcess;
}

function lineIsConsistent(
  line: FrozenAssemblyOperationCostLine,
  policy: FrozenAssemblyOperationCostPolicy,
): boolean {
  if (
    !(ASSEMBLY_COSTED_PROCESS_IDS as readonly string[]).includes(line.processId) ||
    line.operationId !== assemblyOperationId(line.processId)
  ) {
    return false;
  }
  switch (line.outcome) {
    case "COSTED":
    case "UNCONFIRMED_RATE":
      return (
        line.currency === "EUR" &&
        isPositiveFinite(line.quantity) &&
        isPositiveFinite(line.rate) &&
        line.cost === line.quantity * line.rate &&
        line.unit === (line.processId === PACK_PRODUCT_ID ? "m2" : "person_hour") &&
        (line.quantityProvenance.kind === "SUPPORT_PANEL_FACE_AREA"
          ? line.processId === PACK_PRODUCT_ID &&
            line.recipeId === line.quantityProvenance.recipeId
          : line.processId !== PACK_PRODUCT_ID && line.recipeId === null) &&
        (line.processId !== PACK_PRODUCT_ID || policy.finalPackagingMode === "PANEL_FACE_AREA") &&
        (line.processId !== INSPECT_FINISHED_ASSEMBLY_ID ||
          policy.finalInspectionMode === "SEPARATE_LABOR")
      );
    case "INCLUDED":
      return (
        line.processId === INSPECT_FINISHED_ASSEMBLY_ID &&
        line.policyMode === "INCLUDED_IN_OTHER_OPERATIONS" &&
        policy.finalInspectionMode === "INCLUDED_IN_OTHER_OPERATIONS"
      );
    case "MISSING_POLICY":
    case "MISSING_QUANTITY":
    case "MISSING_RATE":
    case "INCOMPATIBLE_UNIT":
      return typeof line.reason === "string";
    default: {
      const _exhaustive: never = line;
      return _exhaustive;
    }
  }
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
