import { asNumber, asRecord, asString } from "./record";

export type ProductEnablementHistoryItem = {
  version: number;
  status: string;
  sourceLabel: string;
  createdAt: string | null;
  effectiveFrom: string | null;
  offeredCount: number | null;
};

export type ProductEnablementProductTransport = {
  templateCode: string;
  label: string;
  enabled: boolean;
};

export type ProductEnablementAdminTransport = {
  canEdit: boolean;
  resolutionOk: boolean;
  source: string | null;
  sourceLabel: string | null;
  guidance: string | null;
  activeVersion: number | null;
  products: ProductEnablementProductTransport[];
  history: ProductEnablementHistoryItem[];
};

export function presentProductEnablementAdmin(
  payload: unknown,
): ProductEnablementAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const products = Array.isArray(record.products)
    ? record.products.flatMap((item) => {
        const row = asRecord(item);
        const templateCode = asString(row?.templateCode);
        const label = asString(row?.label);
        if (!row || !templateCode || !label) {
          return [];
        }
        return [
          {
            templateCode,
            label,
            enabled: row.enabled === true,
          },
        ];
      })
    : [];
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
            sourceLabel: asString(row.sourceLabel) ?? "",
            createdAt: asString(row.createdAt),
            effectiveFrom: asString(row.effectiveFrom),
            offeredCount: asNumber(row.offeredCount),
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
    activeVersion: asNumber(record.activeVersion),
    products,
    history,
  };
}
