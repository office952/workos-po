import {
  getOperationalProcess,
  getProductionCapability,
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
  processProviderRequirement,
} from "../processes/catalog.js";
import type { FrozenProductionOperation } from "../production/snapshot.js";
import { contentHash } from "./canonical.js";
import {
  ASSEMBLY_OFFERING_LABEL,
  ASSEMBLY_QC_LABEL,
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  assemblyRoleLabel,
  type AssemblyMemberRole,
} from "./contract.js";
import type { AssemblyOrderSnapshot, AssemblyProductionSnapshot } from "./snapshots.js";
import type { AssemblyRuleFailure } from "./model.js";

export { INSPECT_FINISHED_ASSEMBLY_ID, MOUNT_LETTERS_ON_PANEL_ID, MOUNT_LOGO_ON_PANEL_ID };

const DROPPED_TERMINAL_PROCESSES = new Set<string>([
  PACK_PRODUCT_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
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
  const assemblyOperations =
    order.assemblyKind === SIGN_ASSEMBLY_ACM_SIGNAGE_V2
      ? v2AssemblyOperations(members)
      : v1AssemblyOperations(sinks);
  if (!assemblyOperations) {
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
  const label =
    order.assemblyKind === SIGN_ASSEMBLY_ACM_LETTERS_V1 ? ASSEMBLY_OFFERING_LABEL : order.label;
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
    label,
    members,
    assemblyOperations,
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

function v1AssemblyOperations(
  sinks: readonly string[],
): FrozenProductionOperation[] | null {
  const mount = assemblyOperation(
    `ANSAMBLARE:${MOUNT_LETTERS_ON_PANEL_ID}`,
    MOUNT_LETTERS_ON_PANEL_ID,
    sinks,
  );
  if (!mount) {
    return null;
  }
  const qc = assemblyOperation(
    `ANSAMBLARE:${INSPECT_FINISHED_ASSEMBLY_ID}`,
    INSPECT_FINISHED_ASSEMBLY_ID,
    [mount.id],
  );
  if (!qc) {
    return null;
  }
  const pack = assemblyOperation(`ANSAMBLARE:${PACK_PRODUCT_ID}`, PACK_PRODUCT_ID, [qc.id]);
  if (!pack) {
    return null;
  }
  return [mount, qc, pack];
}

function v2AssemblyOperations(
  members: readonly { role: AssemblyMemberRole; operations: readonly FrozenProductionOperation[] }[],
): FrozenProductionOperation[] | null {
  const support = members.find((member) => member.role === "SUPPORT_PANEL");
  const logo = members.find((member) => member.role === "SIGNAGE_LOGO");
  const letters = members.find((member) => member.role === "SIGNAGE_LETTERS");
  if (!support || !logo) {
    return null;
  }
  const operations: FrozenProductionOperation[] = [];
  if (letters) {
    const lettersMount = assemblyOperation(
      `ANSAMBLARE:${MOUNT_LETTERS_ON_PANEL_ID}`,
      MOUNT_LETTERS_ON_PANEL_ID,
      [...sinkIds(support.operations), ...sinkIds(letters.operations)],
    );
    if (!lettersMount) {
      return null;
    }
    operations.push(lettersMount);
  }
  const logoMount = assemblyOperation(
    `ANSAMBLARE:${MOUNT_LOGO_ON_PANEL_ID}`,
    MOUNT_LOGO_ON_PANEL_ID,
    [...sinkIds(support.operations), ...sinkIds(logo.operations)],
  );
  if (!logoMount) {
    return null;
  }
  operations.push(logoMount);
  const qc = assemblyOperation(
    `ANSAMBLARE:${INSPECT_FINISHED_ASSEMBLY_ID}`,
    INSPECT_FINISHED_ASSEMBLY_ID,
    operations.map((item) => item.id),
  );
  if (!qc) {
    return null;
  }
  const pack = assemblyOperation(`ANSAMBLARE:${PACK_PRODUCT_ID}`, PACK_PRODUCT_ID, [qc.id]);
  if (!pack) {
    return null;
  }
  return [...operations, qc, pack];
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
