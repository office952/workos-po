import type {
  AssemblyQuoteCostTransport,
  AssemblyQuoteSectionTransport,
  AssemblyQuoteTransport,
} from "../api/types";
import { presentQuoteListItem } from "./quoteListAdapter";
import { asBoolean, asNumber, asRecord, asString, asStringList } from "./record";

type Money = { netPrice: number; vatAmount: number; grossPrice: number; currency: string };

function presentMoney(value: unknown): Money | null {
  const row = asRecord(value);
  const netPrice = asNumber(row?.netPrice);
  const vatAmount = asNumber(row?.vatAmount);
  const grossPrice = asNumber(row?.grossPrice);
  if (netPrice === null || vatAmount === null || grossPrice === null) {
    return null;
  }
  return { netPrice, vatAmount, grossPrice, currency: asString(row?.currency) ?? "EUR" };
}

function presentSection(value: unknown): AssemblyQuoteSectionTransport | null {
  const row = asRecord(value);
  const money = presentMoney(row);
  const memberId = asString(row?.memberId);
  if (!row || !money || !memberId) {
    return null;
  }
  return {
    memberId,
    roleLabel: asString(row.roleLabel) ?? "—",
    productLabel: asString(row.productLabel) ?? "—",
    inscription: asString(row.inscription) ?? "",
    vatPercent: asNumber(row.vatPercent) ?? 0,
    ...money,
  };
}

function presentCost(value: unknown): AssemblyQuoteCostTransport | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.sections)) {
    return null;
  }
  const production = asRecord(row.production);
  return {
    sourceLabel: asString(row.sourceLabel) ?? "",
    sections: row.sections.flatMap((item) => {
      const section = asRecord(item);
      const total = asNumber(section?.total);
      const memberId = asString(section?.memberId);
      return section && total !== null && memberId
        ? [
            {
              memberId,
              roleLabel: asString(section.roleLabel) ?? "—",
              total,
              currency: asString(section.currency) ?? "EUR",
              completeness: asString(section.completeness) ?? "PARTIAL",
              completenessLabel: asString(section.completenessLabel) ?? "",
            },
          ]
        : [];
    }),
    production:
      production && asNumber(production.total) !== null
        ? {
            total: asNumber(production.total) ?? 0,
            currency: asString(production.currency) ?? "EUR",
            completeness: asString(production.completeness) ?? "PARTIAL",
            completenessLabel: asString(production.completenessLabel) ?? "",
            unpricedOperations: Array.isArray(production.unpricedOperations)
              ? production.unpricedOperations.flatMap((item) => {
                  const operation = asRecord(item);
                  const processLabel = asString(operation?.processLabel);
                  return processLabel
                    ? [{ processLabel, missingInputs: asStringList(operation?.missingInputs) }]
                    : [];
                })
              : [],
          }
        : null,
    productionPending: asBoolean(row.productionPending) ?? true,
  };
}

export function presentAssemblyQuoteEnvelope(payload: unknown): AssemblyQuoteTransport | null {
  const record = asRecord(payload);
  const item = presentQuoteListItem(record?.quote);
  const detail = asRecord(record?.assemblyQuote);
  const totals = presentMoney(detail?.totals);
  const assemblyId = asString(detail?.assemblyId);
  if (!record || !item || item.kind !== "ASSEMBLY" || !detail || !totals || !assemblyId) {
    return null;
  }
  const sections = Array.isArray(detail.sections)
    ? detail.sections.flatMap((section) => {
        const presented = presentSection(section);
        return presented ? [presented] : [];
      })
    : [];
  const service = asRecord(detail.serviceSection);
  const serviceMoney = presentMoney(service);
  return {
    item,
    label: asString(detail.label) ?? item.productLabel,
    assemblyId,
    requestId: asString(detail.requestId),
    superseded: asBoolean(detail.superseded) ?? false,
    sections,
    serviceSection:
      service && serviceMoney ? { label: asString(service.label) ?? "Serviciu", ...serviceMoney } : null,
    totals,
    orderSnapshotId: asString(detail.orderSnapshotId),
    internalCost: "internalCost" in record ? presentCost(record.internalCost) : undefined,
  };
}
