function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type OperationCostOption = { value: string; label: string };

export type OperationCostRateState = "MISSING" | "UNCONFIRMED" | "CONFIRMED";

export type OperationCostRate = {
  resourceId: string;
  label: string;
  status: OperationCostRateState;
  statusLabel: string;
  evidenceRowId: string | null;
  amount: number | null;
  currency: string | null;
};

export type AssemblyOperationCostAdmin = {
  canEdit: boolean;
  version: number | null;
  updatedAt: string | null;
  finalInspectionMode: string;
  finalPackagingMode: string;
  inspectionOptions: OperationCostOption[];
  packagingOptions: OperationCostOption[];
  history: { version: number; updatedAt: string; finalInspectionLabel: string; finalPackagingLabel: string }[];
  rates: OperationCostRate[];
  futureOnlyNotice: string;
};

function presentOptions(value: unknown): OperationCostOption[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const options = value.flatMap((item) => {
    const record = asRecord(item);
    return record && typeof record.value === "string" && typeof record.label === "string"
      ? [{ value: record.value, label: record.label }]
      : [];
  });
  return options.length === value.length && options.length > 0 ? options : null;
}

function presentRateState(value: unknown): OperationCostRateState | null {
  return value === "MISSING" || value === "UNCONFIRMED" || value === "CONFIRMED" ? value : null;
}

function presentRate(value: unknown): OperationCostRate | null {
  const record = asRecord(value);
  const status = presentRateState(record?.status);
  if (!record || !status || typeof record.resourceId !== "string" || typeof record.label !== "string") {
    return null;
  }
  return {
    resourceId: record.resourceId,
    label: record.label,
    status,
    statusLabel: stringOrNull(record.statusLabel) ?? "",
    evidenceRowId: stringOrNull(record.evidenceRowId),
    amount: numberOrNull(record.amount),
    currency: stringOrNull(record.currency),
  };
}

export function presentAssemblyOperationCostAdmin(payload: unknown): AssemblyOperationCostAdmin | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const inspectionOptions = presentOptions(record.inspectionOptions);
  const packagingOptions = presentOptions(record.packagingOptions);
  if (
    !inspectionOptions ||
    !packagingOptions ||
    typeof record.finalInspectionMode !== "string" ||
    typeof record.finalPackagingMode !== "string" ||
    !Array.isArray(record.rates) ||
    !Array.isArray(record.history)
  ) {
    return null;
  }
  const rates = record.rates.flatMap((item) => {
    const rate = presentRate(item);
    return rate ? [rate] : [];
  });
  const history = record.history.flatMap((item) => {
    const entry = asRecord(item);
    return entry &&
      typeof entry.version === "number" &&
      typeof entry.updatedAt === "string" &&
      typeof entry.finalInspectionLabel === "string" &&
      typeof entry.finalPackagingLabel === "string"
      ? [
          {
            version: entry.version,
            updatedAt: entry.updatedAt,
            finalInspectionLabel: entry.finalInspectionLabel,
            finalPackagingLabel: entry.finalPackagingLabel,
          },
        ]
      : [];
  });
  return {
    canEdit: record.canEdit === true,
    version: numberOrNull(record.version),
    updatedAt: stringOrNull(record.updatedAt),
    finalInspectionMode: record.finalInspectionMode,
    finalPackagingMode: record.finalPackagingMode,
    inspectionOptions,
    packagingOptions,
    history,
    rates,
    futureOnlyNotice: stringOrNull(record.futureOnlyNotice) ?? "",
  };
}

export type AssemblyOperationCostLine = {
  processId: string;
  label: string;
  outcome: string;
  statusLabel: string;
  basisLabel: string | null;
  quantity: number | null;
  unitLabel: string | null;
  rate: number | null;
  cost: number | null;
  currency: string;
  reason: string | null;
};

export type AssemblyOperationCost = {
  source: string;
  sourceLabel: string;
  editable: boolean;
  policyLabel: string;
  estimates: { processId: string; label: string; personHours: number | null }[];
  lines: AssemblyOperationCostLine[];
  knownTotal: number | null;
  currency: string;
  completeness: "COMPLETE" | "PARTIAL";
  completenessLabel: string;
  verificationLabel: string | null;
  notice: string;
};

function presentLine(value: unknown): AssemblyOperationCostLine | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.processId !== "string" ||
    typeof record.label !== "string" ||
    typeof record.outcome !== "string" ||
    typeof record.statusLabel !== "string"
  ) {
    return null;
  }
  return {
    processId: record.processId,
    label: record.label,
    outcome: record.outcome,
    statusLabel: record.statusLabel,
    basisLabel: stringOrNull(record.basisLabel),
    quantity: numberOrNull(record.quantity),
    unitLabel: stringOrNull(record.unitLabel),
    rate: numberOrNull(record.rate),
    cost: numberOrNull(record.cost),
    currency: stringOrNull(record.currency) ?? "EUR",
    reason: stringOrNull(record.reason),
  };
}

/** Returns null for viewers without financial access: the server sends no internal cost to them. */
export function presentAssemblyOperationCost(payload: unknown): AssemblyOperationCost | null {
  const record = asRecord(payload);
  if (
    !record ||
    typeof record.source !== "string" ||
    typeof record.sourceLabel !== "string" ||
    typeof record.policyLabel !== "string" ||
    !Array.isArray(record.lines) ||
    !Array.isArray(record.estimates) ||
    (record.completeness !== "COMPLETE" && record.completeness !== "PARTIAL")
  ) {
    return null;
  }
  const lines = record.lines.flatMap((item) => {
    const line = presentLine(item);
    return line ? [line] : [];
  });
  const estimates = record.estimates.flatMap((item) => {
    const estimate = asRecord(item);
    return estimate && typeof estimate.processId === "string" && typeof estimate.label === "string"
      ? [{ processId: estimate.processId, label: estimate.label, personHours: numberOrNull(estimate.personHours) }]
      : [];
  });
  return {
    source: record.source,
    sourceLabel: record.sourceLabel,
    editable: record.editable === true,
    policyLabel: record.policyLabel,
    estimates,
    lines,
    knownTotal: numberOrNull(record.knownTotal),
    currency: stringOrNull(record.currency) ?? "EUR",
    completeness: record.completeness,
    completenessLabel: stringOrNull(record.completenessLabel) ?? "",
    verificationLabel: stringOrNull(record.verificationLabel),
    notice: stringOrNull(record.notice) ?? "",
  };
}

/** Reads an operator-typed number; range and precision stay with the server. */
export function readDecimalDraft(draft: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = draft.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

export function decimalDraft(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}
