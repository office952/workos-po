import type { CatalogComponentView, CatalogWorkspaceProduct } from "../../adapters/catalogCapabilitiesAdapter";
import type { ProductSystemType } from "../../adapters/productSystemAdapter";

/** Presentation counts only. Every number is a count of entries the server already sent. */
export type CatalogComponentCounts = {
  fixed: number;
  request: number;
  settings: number;
  formulas: number;
  resources: number;
};

export type CatalogStructureRow = {
  component: CatalogComponentView;
  index: number;
  counts: CatalogComponentCounts;
};

export function componentCounts(component: CatalogComponentView, type: ProductSystemType | null): CatalogComponentCounts {
  return {
    fixed: component.properties.filter((item) => item.group === "platform" && item.origin !== "identity").length,
    request: component.properties.filter((item) => item.group === "request").length,
    settings: component.properties.filter((item) => item.group === "setting").length,
    formulas: component.properties.filter((item) => item.group === "formula").length,
    resources: type?.resourceReferences.length ?? 0,
  };
}

export function structureRows(product: CatalogWorkspaceProduct, types: readonly ProductSystemType[]): CatalogStructureRow[] {
  return product.components.map((component, position) => ({
    component,
    index: position + 1,
    counts: componentCounts(component, types.find((type) => type.typeId === component.typeId) ?? null),
  }));
}

/** Romanian count phrase: 1 produs, 3 produse, 30 de produse. */
export function countNoun(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const tail = count % 100;
  const needsDe = count === 0 || tail === 0 || tail >= 20;
  return `${count} ${needsDe ? "de " : ""}${many}`;
}

export function componentIndexLabel(index: number): string {
  return String(index).padStart(2, "0");
}

export function componentCountsText(counts: CatalogComponentCounts): string {
  const parts: string[] = [];
  if (counts.fixed > 0) parts.push(counts.fixed === 1 ? "1 fixă" : `${counts.fixed} fixe`);
  if (counts.request > 0) parts.push(`${counts.request} la cerere`);
  if (counts.settings > 0) parts.push(countNoun(counts.settings, "setare", "setări"));
  if (counts.formulas > 0) parts.push(countNoun(counts.formulas, "formulă", "formule"));
  if (counts.resources > 0) parts.push(countNoun(counts.resources, "resursă", "resurse"));
  return parts.length > 0 ? parts.join(" · ") : "fără conținut propriu";
}

export function structureTotalsText(rows: readonly CatalogStructureRow[]): string {
  const required = rows.filter((row) => row.component.required).length;
  const optional = rows.length - required;
  const settings = rows.reduce((sum, row) => sum + row.counts.settings, 0);
  const formulas = rows.reduce((sum, row) => sum + row.counts.formulas, 0);
  const resources = rows.reduce((sum, row) => sum + row.counts.resources, 0);
  const parts: string[] = [];
  if (rows.length > 0) {
    parts.push(optional === 0 ? "toate obligatorii" : `${required} obligatorii · ${optional} opționale`);
  }
  if (settings > 0) parts.push(countNoun(settings, "setare", "setări"));
  if (formulas > 0) parts.push(countNoun(formulas, "formulă", "formule"));
  if (resources > 0) parts.push(countNoun(resources, "resursă", "resurse"));
  return parts.join(" · ");
}

/** Search and filters of the library. The page owns them, so they survive opening a product and coming back. */
export type CatalogLibraryFilters = {
  query: string;
  availability: "all" | "offered" | "not-offered";
  family: string;
};

export const EMPTY_LIBRARY_FILTERS: CatalogLibraryFilters = { query: "", availability: "all", family: "" };

/** Case- and diacritics-insensitive text match used by the library and the product switcher. */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("ro");
}

export function matchesFolded(query: string, parts: ReadonlyArray<string | null | undefined>): boolean {
  const needle = foldText(query.trim());
  if (needle === "") return true;
  return parts.some((part) => foldText(part ?? "").includes(needle));
}
