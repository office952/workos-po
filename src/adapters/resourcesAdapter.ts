import type {
  CostEvidenceQualifierTransport,
  CostEvidenceRowTransport,
  ResourcesAdminTransport,
  ResourcesWriteState,
} from "../api/types";
import {
  presentOperatorFacingCopy,
  presentOperatorFacingCopyOrNull,
} from "../presentation/operatorFacingCopy";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function presentWriteState(value: unknown): ResourcesWriteState {
  return value === "READY" ? "READY" : "NOT_IMPLEMENTED";
}

function presentQualifier(value: unknown): CostEvidenceQualifierTransport | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.kind !== "string" ||
    typeof record.label !== "string" ||
    typeof record.unitLabel !== "string" ||
    typeof record.value !== "number"
  ) {
    return null;
  }
  return {
    kind: record.kind,
    label: record.label,
    unitLabel: record.unitLabel,
    value: record.value,
  };
}

function presentRow(value: unknown): CostEvidenceRowTransport | null {
  const record = asRecord(value);
  if (!record || typeof record.resourceId !== "string") {
    return null;
  }
  return {
    evidenceRowId:
      typeof record.evidenceRowId === "string" ? record.evidenceRowId : null,
    resourceId: record.resourceId,
    resourceLabel:
      typeof record.resourceLabel === "string"
        ? record.resourceLabel
        : record.resourceId,
    qualifierIdentity:
      typeof record.qualifierIdentity === "string"
        ? record.qualifierIdentity
        : null,
    qualifierLabel:
      typeof record.qualifierLabel === "string" ? record.qualifierLabel : null,
    qualifier: presentQualifier(record.qualifier),
    amount: typeof record.amount === "number" ? record.amount : null,
    currency: typeof record.currency === "string" ? record.currency : null,
    unitLabel: typeof record.unitLabel === "string" ? record.unitLabel : null,
    amountDisplay:
      typeof record.amountDisplay === "string" ? record.amountDisplay : null,
    note:
      typeof record.note === "string"
        ? presentOperatorFacingCopyOrNull(record.note)
        : null,
    lastChangedAt:
      typeof record.lastChangedAt === "string" ? record.lastChangedAt : null,
    kindLabel: typeof record.kindLabel === "string" ? record.kindLabel : null,
    classificationLabel:
      typeof record.classificationLabel === "string"
        ? presentOperatorFacingCopy(record.classificationLabel)
        : null,
    sourceLabel:
      typeof record.sourceLabel === "string"
        ? presentOperatorFacingCopy(record.sourceLabel)
        : null,
  };
}

function presentCatalogGap(
  value: unknown,
  existingResourceIds: ReadonlySet<string>,
): CostEvidenceRowTransport | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.label !== "string") {
    return null;
  }
  if (existingResourceIds.has(record.id)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(record, "cost") || record.cost !== null) {
    return null;
  }
  return {
    evidenceRowId: null,
    resourceId: record.id,
    resourceLabel: record.label,
    qualifierIdentity: null,
    qualifierLabel: null,
    qualifier: null,
    amount: null,
    currency: null,
    unitLabel: typeof record.unitLabel === "string" ? record.unitLabel : null,
    amountDisplay: null,
    note: null,
    lastChangedAt: null,
    kindLabel: typeof record.kindLabel === "string" ? record.kindLabel : null,
    classificationLabel: null,
    sourceLabel: null,
  };
}

function presentCatalogGaps(
  record: Record<string, unknown>,
  existingResourceIds: ReadonlySet<string>,
): CostEvidenceRowTransport[] {
  return (["materials", "labor", "services"] as const).flatMap((key) => {
    const list = record[key];
    if (!Array.isArray(list)) {
      return [];
    }
    return list.flatMap((item) => {
      const gap = presentCatalogGap(item, existingResourceIds);
      return gap ? [gap] : [];
    });
  });
}

export function presentResourcesAdmin(
  payload: unknown,
): ResourcesAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const writeState = presentWriteState(record.writeState);
  const evidenceRows = Array.isArray(record.costEvidence)
    ? record.costEvidence.flatMap((item) => {
        const row = presentRow(item);
        return row ? [row] : [];
      })
    : [];
  const rows = [
    ...evidenceRows,
    ...presentCatalogGaps(
      record,
      new Set(evidenceRows.map((row) => row.resourceId)),
    ),
  ];
  const canEdit =
    writeState === "READY" &&
    rows.some((row) => row.evidenceRowId !== null && row.amount !== null);
  return { writeState, canEdit, rows };
}

export function presentCostEvidenceMutation(payload: unknown): {
  admin: ResourcesAdminTransport;
  evidenceRowId: string | null;
} | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const admin = presentResourcesAdmin(record.admin);
  if (!admin) {
    return null;
  }
  const evidence = asRecord(record.evidence);
  return {
    admin,
    evidenceRowId:
      typeof evidence?.evidenceRowId === "string" ? evidence.evidenceRowId : null,
  };
}

export function findCostEvidenceRow(
  rows: readonly CostEvidenceRowTransport[],
  resourceId: string,
  qualifierKind: string,
  qualifierValue: number,
): CostEvidenceRowTransport | null {
  return (
    rows.find(
      (row) =>
        row.resourceId === resourceId &&
        row.qualifier?.kind === qualifierKind &&
        row.qualifier.value === qualifierValue &&
        row.amount !== null,
    ) ??
    rows.find(
      (row) =>
        row.resourceId === resourceId &&
        row.qualifierIdentity === `${qualifierKind}=${qualifierValue}`,
    ) ??
    null
  );
}
