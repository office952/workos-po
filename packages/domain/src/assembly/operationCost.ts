import {
  INSPECT_FINISHED_ASSEMBLY_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import type { FrozenProductionInput } from "../production/snapshot.js";
import {
  getResource,
  LAB_WORKSHOP_LABOR_ID,
  lookupCostEvidence,
  SVC_PACK_PRODUCT_ID,
  type CostEvidence,
} from "../resources/catalog.js";
import { costEvidenceNeedsVerification } from "../resources/eic.js";
import { RCP_PACK_PRODUCT_ID } from "../resources/recipes.js";
import type { AssemblyKind, AssemblyMemberRole } from "./contract.js";
import type { AssemblyDefinition } from "./model.js";
import {
  assemblyCostedProcessIds,
  assemblyOperationId,
  frozenPolicyFrom,
  isAssemblyEstimableProcessId,
  isValidEstimatedPersonHours,
  sealAssemblyOperationCost,
  type AssemblyCostedProcessId,
  type AssemblyEstimableProcessId,
  type AssemblyOperationCostPolicyVersion,
  type AssemblyOperationEstimate,
  type AssemblyOperationQuantityProvenance,
  type FrozenAssemblyOperationCost,
  type FrozenAssemblyOperationCostLine,
} from "./operationCostEvidence.js";

export type AssemblyOperationCostMember = {
  memberId: string;
  role: AssemblyMemberRole;
  productionInput: FrozenProductionInput;
};

const PROCESS_LABELS: Record<AssemblyCostedProcessId, string> = {
  [MOUNT_LETTERS_ON_PANEL_ID]: "Montaj litere",
  [MOUNT_LOGO_ON_PANEL_ID]: "Montaj logo",
  [INSPECT_FINISHED_ASSEMBLY_ID]: "Verificare finală",
  [PACK_PRODUCT_ID]: "Ambalare",
};

export function assemblyOperationCostProcessLabel(processId: AssemblyCostedProcessId): string {
  return PROCESS_LABELS[processId];
}

/**
 * Evaluates assembly-level operation cost at quote time from the organization's policy, the
 * operator estimates and the active cost evidence. The result is frozen into the quote; later
 * reconciliation reads only that frozen evidence. Missing inputs stay typed gaps, never zero.
 */
export function evaluateAssemblyOperationCosts(input: {
  kind: AssemblyKind;
  members: readonly AssemblyOperationCostMember[];
  policy: AssemblyOperationCostPolicyVersion | null;
  estimates: readonly AssemblyOperationEstimate[];
  evidenceRows: readonly CostEvidence[];
}): FrozenAssemblyOperationCost {
  const policy = frozenPolicyFrom(input.policy);
  const processIds = assemblyCostedProcessIds(
    input.kind,
    input.members.map((member) => member.role),
  );
  const lines = processIds.map((processId): FrozenAssemblyOperationCostLine => {
    switch (processId) {
      case MOUNT_LETTERS_ON_PANEL_ID:
      case MOUNT_LOGO_ON_PANEL_ID:
        return laborLine(processId, input.estimates, input.evidenceRows);
      case INSPECT_FINISHED_ASSEMBLY_ID:
        switch (policy.finalInspectionMode) {
          case "NOT_CONFIGURED":
            return {
              operationId: assemblyOperationId(processId),
              processId,
              outcome: "MISSING_POLICY",
              reason: "Politica pentru verificarea finală nu este configurată",
            };
          case "INCLUDED_IN_OTHER_OPERATIONS":
            return {
              operationId: assemblyOperationId(processId),
              processId,
              outcome: "INCLUDED",
              policyMode: "INCLUDED_IN_OTHER_OPERATIONS",
            };
          case "SEPARATE_LABOR":
            return laborLine(processId, input.estimates, input.evidenceRows);
          default: {
            const _exhaustive: never = policy.finalInspectionMode;
            return _exhaustive;
          }
        }
      case PACK_PRODUCT_ID:
        switch (policy.finalPackagingMode) {
          case "NOT_CONFIGURED":
            return {
              operationId: assemblyOperationId(processId),
              processId,
              outcome: "MISSING_POLICY",
              reason: "Politica pentru ambalarea finală nu este configurată",
            };
          case "PANEL_FACE_AREA":
            return packagingLine(input.members, input.evidenceRows);
          default: {
            const _exhaustive: never = policy.finalPackagingMode;
            return _exhaustive;
          }
        }
      default: {
        const _exhaustive: never = processId;
        return _exhaustive;
      }
    }
  });
  return sealAssemblyOperationCost(policy, lines);
}

function laborLine(
  processId: AssemblyEstimableProcessId,
  estimates: readonly AssemblyOperationEstimate[],
  evidenceRows: readonly CostEvidence[],
): FrozenAssemblyOperationCostLine {
  const estimate = estimates.find((item) => item.processId === processId);
  if (!estimate || !isValidEstimatedPersonHours(estimate.personHours)) {
    return {
      operationId: assemblyOperationId(processId),
      processId,
      outcome: "MISSING_QUANTITY",
      reason: `Ore estimate lipsă pentru ${PROCESS_LABELS[processId]}`,
    };
  }
  return costedLine(processId, LAB_WORKSHOP_LABOR_ID, "person_hour", estimate.personHours, {
    kind: "OPERATOR_ESTIMATE",
    authorUserId: estimate.authorUserId,
    recordedAt: estimate.recordedAt,
  }, evidenceRows);
}

function packagingLine(
  members: readonly AssemblyOperationCostMember[],
  evidenceRows: readonly CostEvidence[],
): FrozenAssemblyOperationCostLine {
  const support = members.find((member) => member.role === "SUPPORT_PANEL");
  const traces = support
    ? support.productionInput.usedRecipes.filter(
        (trace) => trace.recipeId === RCP_PACK_PRODUCT_ID && trace.unit === "m2",
      )
    : [];
  const areas = new Set(traces.map((trace) => trace.quantity));
  const [area] = [...areas];
  if (!support || areas.size !== 1 || area === undefined || !(area > 0)) {
    return {
      operationId: assemblyOperationId(PACK_PRODUCT_ID),
      processId: PACK_PRODUCT_ID,
      outcome: "MISSING_QUANTITY",
      reason: "Suprafața confirmată a panoului lipsește",
    };
  }
  return costedLine(PACK_PRODUCT_ID, SVC_PACK_PRODUCT_ID, "m2", area, {
    kind: "SUPPORT_PANEL_FACE_AREA",
    memberId: support.memberId,
    productionInputHash: support.productionInput.contentHash,
    recipeId: RCP_PACK_PRODUCT_ID,
  }, evidenceRows);
}

function costedLine(
  processId: AssemblyCostedProcessId,
  resourceId: string,
  unit: "person_hour" | "m2",
  quantity: number,
  quantityProvenance: AssemblyOperationQuantityProvenance,
  evidenceRows: readonly CostEvidence[],
): FrozenAssemblyOperationCostLine {
  const operationId = assemblyOperationId(processId);
  const resource = getResource(resourceId);
  const evidence = lookupCostEvidence(evidenceRows, resourceId);
  if (!resource || !evidence) {
    return {
      operationId,
      processId,
      outcome: "MISSING_RATE",
      reason: `Tarif lipsă pentru ${resource?.label ?? resourceId}`,
    };
  }
  if (resource.unit !== unit || evidence.perUnit !== unit || evidence.currency !== "EUR") {
    return {
      operationId,
      processId,
      outcome: "INCOMPATIBLE_UNIT",
      reason: `Unitatea tarifului pentru ${resource.label} nu corespunde operației`,
    };
  }
  return {
    operationId,
    processId,
    outcome: costEvidenceNeedsVerification(evidence) ? "UNCONFIRMED_RATE" : "COSTED",
    resourceId,
    resourceLabel: resource.label,
    recipeId:
      quantityProvenance.kind === "SUPPORT_PANEL_FACE_AREA" ? quantityProvenance.recipeId : null,
    quantity,
    unit,
    rate: evidence.amount,
    currency: "EUR",
    cost: quantity * evidence.amount,
    evidenceRowId: evidence.evidenceRowId ?? null,
    evidenceSource: evidence.source,
    evidenceClassification: evidence.classification,
    quantityProvenance,
  };
}

export type AssemblyOperationEstimateEdit = {
  processId: string;
  personHours: number | null;
};

/**
 * Replaces the person-hour estimates of an editable assembly. Unchanged entries keep their author
 * and time; `null` removes an estimate. The author is supplied by the server, never the client.
 */
export function setAssemblyOperationEstimates(
  definition: AssemblyDefinition,
  edits: readonly AssemblyOperationEstimateEdit[],
  actor: { userId: string; at: string },
):
  | { ok: true; definition: AssemblyDefinition }
  | { ok: false; error: "invalid_estimate"; reasons: string[] } {
  const seen = new Set<string>();
  const current = new Map(
    (definition.operationEstimates ?? []).map((item) => [item.processId, item]),
  );
  const allowed = new Set<string>(
    assemblyCostedProcessIds(
      definition.kind,
      definition.members.map((member) => member.role),
    ),
  );
  for (const edit of edits) {
    if (
      !isAssemblyEstimableProcessId(edit.processId) ||
      !allowed.has(edit.processId) ||
      seen.has(edit.processId) ||
      (edit.personHours !== null && !isValidEstimatedPersonHours(edit.personHours))
    ) {
      return {
        ok: false,
        error: "invalid_estimate",
        reasons: ["Orele estimate trebuie să fie pozitive, cu cel mult două zecimale."],
      };
    }
    seen.add(edit.processId);
    const existing = current.get(edit.processId);
    if (edit.personHours === null) {
      current.delete(edit.processId);
    } else if (!existing || existing.personHours !== edit.personHours) {
      current.set(edit.processId, {
        processId: edit.processId,
        personHours: edit.personHours,
        authorUserId: actor.userId,
        recordedAt: actor.at,
      });
    }
  }
  const operationEstimates = [...current.values()].sort((left, right) =>
    left.processId.localeCompare(right.processId),
  );
  return {
    ok: true,
    definition: { ...definition, operationEstimates, updatedAt: actor.at },
  };
}
