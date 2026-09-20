import { asNumber, asRecord, asString } from "./record";

export type CommercialPolicyHistoryItem = {
  version: number;
  status: string;
  source: string;
  createdAt: string | null;
  effectiveFrom: string | null;
  markupPercent: number | null;
  vatPercent: number | null;
  defaultDiscountPercent: number | null;
  defaultAdjustment: number | null;
};

export type CommercialPolicyAdminTransport = {
  canEdit: boolean;
  resolutionOk: boolean;
  source: string | null;
  sourceLabel: string | null;
  guidance: string | null;
  policyId: string | null;
  activeVersion: number | null;
  editable: {
    markupPercent: string;
    vatPercent: string;
    defaultDiscountPercent: string;
    defaultAdjustment: string;
  };
  readOnly: {
    currency: string;
    rounding: string;
  };
  history: CommercialPolicyHistoryItem[];
};

function numberDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

export function presentCommercialPolicyAdmin(
  payload: unknown,
): CommercialPolicyAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const editable = asRecord(record.editable);
  const readOnly = asRecord(record.readOnly);
  const history = Array.isArray(record.history)
    ? record.history.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.version !== "number") {
          return [];
        }
        return [
          {
            version: row.version,
            status: asString(row.status) ?? "",
            source: asString(row.source) ?? "",
            createdAt: asString(row.createdAt),
            effectiveFrom: asString(row.effectiveFrom),
            markupPercent: asNumber(row.markupPercent),
            vatPercent: asNumber(row.vatPercent),
            defaultDiscountPercent: asNumber(row.defaultDiscountPercent),
            defaultAdjustment: asNumber(row.defaultAdjustment),
          },
        ];
      })
    : [];
  return {
    canEdit: record.canEdit === true,
    resolutionOk: record.resolutionOk !== false,
    source: asString(record.source),
    sourceLabel: asString(record.sourceLabel),
    guidance: asString(record.guidance),
    policyId: asString(record.policyId),
    activeVersion: asNumber(record.activeVersion),
    editable: {
      markupPercent: numberDraft(asNumber(editable?.markupPercent)),
      vatPercent: numberDraft(asNumber(editable?.vatPercent)),
      defaultDiscountPercent: numberDraft(asNumber(editable?.defaultDiscountPercent)),
      defaultAdjustment: numberDraft(asNumber(editable?.defaultAdjustment)),
    },
    readOnly: {
      currency: asString(readOnly?.currency) ?? "EUR",
      rounding:
        typeof readOnly?.rounding === "number"
          ? String(readOnly.rounding)
          : (asString(readOnly?.rounding) ?? "0,01"),
    },
    history,
  };
}
