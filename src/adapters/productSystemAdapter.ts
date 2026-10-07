import { asNumber, asRecord, asString } from "./record";
import type { CatalogProductTransport } from "../api/types";

export type ProductSystemProduct = CatalogProductTransport & {
  displayRevision: number;
  composition: { role: string; roleLabel: string; typeId: string; typeLabel: string }[];
};
export type ProductSystemType = {
  typeId: string; label: string; description: string; measurement: string; quantity: string;
  configurations: { productCode: string; attributes: { label: string; valueDisplay: string; ownershipLabel: string }[] }[];
  calculationInputs: { label: string; value: string }[];
  calculationResults: { label: string; value: string }[];
  resourceReferences: { id: string; label: string }[];
  processReferences: { id: string; label: string }[];
  gaps: string[];
};
export type ProductSystemModel = { canEdit: boolean; products: ProductSystemProduct[]; types: ProductSystemType[] };

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.flatMap(item => { const row = asRecord(item); return row ? [row] : []; }) : [];
}
function lines(value: unknown): { label: string; value: string }[] {
  return records(value).map(row => ({ label: asString(row.label) ?? "", value: asString(row.value) ?? "" }));
}
function references(value: unknown): { id: string; label: string }[] {
  return records(value).map(row => ({ id: asString(row.id) ?? "", label: asString(row.label) ?? "" }));
}
export function presentProductSystem(payload: unknown): ProductSystemModel | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.products) || !Array.isArray(record.types)) return null;
  return {
    canEdit: record.canEdit === true,
    products: records(record.products).flatMap(row => typeof row.code === "string" && typeof row.label === "string" ? [{
      code: row.code, label: row.label, description: asString(row.description) ?? "",
      familyLabel: asString(row.familyLabel), categoryLabel: asString(row.categoryLabel),
      displayRevision: asNumber(row.displayRevision) ?? 0,
      composition: records(row.composition).map(line => ({ role: asString(line.role) ?? "", roleLabel: asString(line.roleLabel) ?? "", typeId: asString(line.typeId) ?? "", typeLabel: asString(line.typeLabel) ?? "" })),
    }] : []),
    types: records(record.types).flatMap(row => typeof row.typeId === "string" && typeof row.label === "string" ? [{
      typeId: row.typeId, label: row.label, description: asString(row.description) ?? "",
      measurement: asString(row.measurement) ?? "", quantity: asString(row.quantity) ?? "",
      configurations: records(row.configurations).map(config => ({ productCode: asString(config.productCode) ?? "", attributes: records(config.attributes).map(attr => ({ label: asString(attr.label) ?? "", valueDisplay: asString(attr.valueDisplay) ?? "", ownershipLabel: asString(attr.ownershipLabel) ?? "" })) })),
      calculationInputs: lines(row.calculationInputs), calculationResults: lines(row.calculationResults),
      resourceReferences: references(row.resourceReferences), processReferences: references(row.processReferences),
      gaps: Array.isArray(row.gaps) ? row.gaps.filter((gap): gap is string => typeof gap === "string") : [],
    }] : []),
  };
}
