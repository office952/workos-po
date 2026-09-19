import type { CatalogProductTransport } from "../api/types";
import { asRecord, asString } from "./record";

type CatalogWalkNode = {
  kind?: unknown;
  code?: unknown;
  label?: unknown;
  description?: unknown;
  children?: unknown;
};

export function presentCatalogProducts(payload: unknown): CatalogProductTransport[] {
  const record = asRecord(payload);
  const tree = record?.tree;
  if (!Array.isArray(tree)) {
    return [];
  }
  return walkCatalog(tree, null);
}

function walkCatalog(nodes: unknown[], familyLabel: string | null): CatalogProductTransport[] {
  return nodes.flatMap((node) => {
    const record = asRecord(node) as CatalogWalkNode | null;
    if (!record) {
      return [];
    }
    if (record.kind === "product" && typeof record.code === "string" && typeof record.label === "string") {
      return [
        {
          code: record.code,
          label: record.label,
          description: asString(record.description) ?? "",
          familyLabel,
        },
      ];
    }
    const nextFamily =
      record.kind === "family" && typeof record.label === "string" ? record.label : familyLabel;
    return Array.isArray(record.children) ? walkCatalog(record.children, nextFamily) : [];
  });
}
