import {
  getOperationalProcess,
  getProductionCapability,
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  PACK_PRODUCT_ID,
  processProviderRequirement,
} from "../processes/catalog.js";
import type { FrozenProductionOperation } from "../production/snapshot.js";
import { contentHash } from "./canonical.js";
import {
  ASSEMBLY_OFFERING_LABEL,
  ASSEMBLY_QC_LABEL,
  assemblyRoleLabel,
  type AssemblyMemberRole,
} from "./contract.js";
import type { AssemblyOrderSnapshot, AssemblyProductionSnapshot } from "./snapshots.js";
import type { AssemblyRuleFailure } from "./model.js";

export { INSPECT_FINISHED_ASSEMBLY_ID, MOUNT_LETTERS_ON_PANEL_ID };

const DROPPED_TERMINAL_PROCESSES = new Set<string>([
  PACK_PRODUCT_ID,
  INSPECT_FINISHED_LETTER_ID,
]);

export function projectAssemblyProduction(
  order: AssemblyOrderSnapshot,
  input: { snapshotId: string; createdAt: string },
): { ok: true; snapshot: AssemblyProductionSnapshot } | AssemblyRuleFailure {
  const members = order.children.map((child) => {
    const operations = projectMemberOperations(child.memberId, child.role, child.productionInput.operations);
    return {
      memberId: child.memberId,
      role: child.role,
      productCode: child.productCode,
      templateCode: child.templateCode,
      templateVersion: child.templateVersion,
      truthHash: child.truthHash,
      productionInputHash: child.productionInput.contentHash,
      operations,
    };
  });
  if (members.some((member) => member.operations.length === 0)) {
    return {
      ok: false,
      error: "missing_member",
      reasons: ["Producția înghețată a unui produs nu poate fi proiectată."],
    };
  }
  const sinks = members.flatMap((member) => sinkIds(member.operations));
  const mount = assemblyOperation(
    `ANSAMBLARE:${MOUNT_LETTERS_ON_PANEL_ID}`,
    MOUNT_LETTERS_ON_PANEL_ID,
    sinks,
  );
  if (!mount) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Procesele de ansamblare nu sunt disponibile."],
    };
  }
  const qc = assemblyOperation(
    `ANSAMBLARE:${INSPECT_FINISHED_ASSEMBLY_ID}`,
    INSPECT_FINISHED_ASSEMBLY_ID,
    [mount.id],
  );
  if (!qc) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Procesele de ansamblare nu sunt disponibile."],
    };
  }
  const pack = assemblyOperation(
    `ANSAMBLARE:${PACK_PRODUCT_ID}`,
    PACK_PRODUCT_ID,
    [qc.id],
  );
  if (!pack) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Procesele de ansamblare nu sunt disponibile."],
    };
  }
  const eicTotal = roundMoney(order.children.reduce((sum, child) => sum + child.eicTotal, 0));
  const eicCompleteness: "COMPLETE" | "PARTIAL" = order.children.every(
    (child) => child.eicCompleteness === "COMPLETE",
  )
    ? "COMPLETE"
    : "PARTIAL";
  const body = {
    schemaVersion: 1 as const,
    status: "ACCEPTED" as const,
    organizationId: order.organizationId,
    sourceOrderSnapshotId: order.orderSnapshotId,
    sourceOrderContentHash: order.contentHash,
    assemblyId: order.assemblyId,
    assemblyTruthId: order.assemblyTruthId,
    assemblyTruthHash: order.assemblyTruthHash,
    assemblyKind: order.assemblyKind,
    label: ASSEMBLY_OFFERING_LABEL,
    members,
    assemblyOperations: [mount, qc, pack],
    eicTotal,
    eicCurrency: "EUR" as const,
    eicCompleteness,
  };
  return {
    ok: true,
    snapshot: {
      snapshotId: input.snapshotId,
      ...body,
      createdAt: input.createdAt,
      contentHash: contentHash(body),
    },
  };
}

function projectMemberOperations(
  memberId: string,
  role: AssemblyMemberRole,
  operations: readonly FrozenProductionOperation[],
): FrozenProductionOperation[] {
  const kept = operations.filter((operation) => !DROPPED_TERMINAL_PROCESSES.has(operation.processId));
  const idMap = new Map(kept.map((operation) => [operation.id, `${memberId}:${operation.id}`]));
  return kept.map((operation) => ({
    ...operation,
    id: idMap.get(operation.id) ?? operation.id,
    scope: role,
    scopeLabel: assemblyRoleLabel(role),
    dependsOn: operation.dependsOn.flatMap((dependency) => {
      const next = idMap.get(dependency);
      return next ? [next] : [];
    }),
    quantities: operation.quantities.map((item) => ({ ...item })),
    resourceDemands: operation.resourceDemands.map((item) => ({ ...item })),
  }));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sinkIds(operations: readonly FrozenProductionOperation[]): string[] {
  const depended = new Set(operations.flatMap((operation) => operation.dependsOn));
  return operations.filter((operation) => !depended.has(operation.id)).map((operation) => operation.id);
}

function assemblyOperation(
  id: string,
  processId: string,
  dependsOn: readonly string[],
): FrozenProductionOperation | null {
  const process = getOperationalProcess(processId);
  if (!process) {
    return null;
  }
  const capability = getProductionCapability(process.requiredCapabilityId);
  return {
    id,
    processId,
    processLabel: process.id === INSPECT_FINISHED_ASSEMBLY_ID ? ASSEMBLY_QC_LABEL : process.label,
    scope: "ANSAMBLARE",
    scopeLabel: "Ansamblare",
    typeId: null,
    dependsOn: [...dependsOn],
    requiredCapabilityId: process.requiredCapabilityId,
    requiredCapabilityLabel: capability?.label ?? process.requiredCapabilityId,
    providerRequirement: processProviderRequirement(process),
    quantities: [],
    resourceDemands: [],
  };
}
