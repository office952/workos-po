import type { CostEvidenceRowTransport } from "../api/types";
import { presentOperatorFacingCopy } from "./operatorFacingCopy";
import { statusTone, type StatusKind } from "./statusTone";
import type { PresentationTone } from "./foundationProof";

export const COST_REGISTRY_FILTERS = [
  { id: "all", label: "Toate" },
  { id: "materiale", label: "Materiale" },
  { id: "manopera", label: "Manoperă" },
  { id: "servicii", label: "Operații și servicii" },
  { id: "de-confirmat", label: "De confirmat" },
] as const;

export type CostRegistryFilterId = (typeof COST_REGISTRY_FILTERS)[number]["id"];

export type CostCategoryId = "materiale" | "manopera" | "servicii" | "unknown";

export type CostVerificationState = "confirmed" | "verify" | "missing";

export const COST_PRODUCTION_NAV_LABEL = "Costuri de producție";
export const COST_PRODUCTION_OPEN_LABEL = "Deschide costurile de producție";

export function costCategoryFromKindLabel(kindLabel: string | null | undefined): CostCategoryId {
  const normalized = (kindLabel ?? "").trim().toLocaleLowerCase("ro-RO");
  if (normalized === "material") {
    return "materiale";
  }
  if (normalized === "manoperă" || normalized === "manopera") {
    return "manopera";
  }
  if (normalized === "serviciu" || normalized === "servicii") {
    return "servicii";
  }
  return "unknown";
}

export function costCategoryLabel(category: CostCategoryId): string {
  switch (category) {
    case "materiale":
      return "Material";
    case "manopera":
      return "Manoperă";
    case "servicii":
      return "Operație";
    case "unknown":
      return "Cost";
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

export function presentCostVerification(
  row: Pick<
    CostEvidenceRowTransport,
    "amount" | "classificationLabel" | "evidenceRowId"
  >,
): CostVerificationState {
  const classification = presentOperatorFacingCopy(row.classificationLabel ?? "").toLocaleLowerCase(
    "ro-RO",
  );
  if (classification.includes("confirmat de") || classification.includes("decizie ai")) {
    return "confirmed";
  }
  if (row.amount !== null || classification.length > 0) {
    return "verify";
  }
  if (row.evidenceRowId) {
    return "verify";
  }
  return "missing";
}

export function costVerificationLabel(state: CostVerificationState): string {
  switch (state) {
    case "confirmed":
      return "Confirmat";
    case "verify":
      return "De verificat";
    case "missing":
      return "Cost lipsa";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function costVerificationTone(state: CostVerificationState): PresentationTone {
  const kind: StatusKind = (() => {
    switch (state) {
      case "confirmed":
        return "success";
      case "verify":
        return "warning";
      case "missing":
        return "danger";
      default: {
        const exhaustive: never = state;
        return exhaustive;
      }
    }
  })();
  return statusTone(kind);
}

export function costAmountEditLabel(
  category: CostCategoryId,
  unitLabel: string | null | undefined,
  currency: string | null | undefined,
): string {
  const unit = unitLabel && unitLabel.trim() !== "" ? unitLabel : "unitate";
  const curr = currency && currency.trim() !== "" ? currency : "EUR";
  switch (category) {
    case "materiale":
      return `Cost achiziție (${curr}/${unit})`;
    case "manopera":
      return `Cost manoperă (${curr}/${unit})`;
    case "servicii":
      return `Cost operație (${curr}/${unit})`;
    case "unknown":
      return `Cost (${curr}/${unit})`;
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

export function costRelationshipCopy(category: CostCategoryId): string | null {
  return category === "materiale"
    ? "Cantitate material × cost unitar activ = cost intern de material"
    : null;
}

export function parseCostAmountDraft(
  raw: string,
): { ok: true; amount: number } | { ok: false } {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") {
    return { ok: false };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false };
  }
  return { ok: true, amount: parsed };
}

export function costRowSearchText(row: CostEvidenceRowTransport): string {
  return [row.resourceLabel, row.qualifierLabel, row.kindLabel, row.unitLabel]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLocaleLowerCase("ro-RO");
}

export function matchesCostSearch(row: CostEvidenceRowTransport, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("ro-RO");
  if (needle === "") {
    return true;
  }
  return costRowSearchText(row).includes(needle);
}

export function filterCostRegistryRows(
  rows: readonly CostEvidenceRowTransport[],
  filter: CostRegistryFilterId,
  query: string,
): CostEvidenceRowTransport[] {
  return rows.filter((row) => {
    if (!matchesCostSearch(row, query)) {
      return false;
    }
    const verification = presentCostVerification(row);
    switch (filter) {
      case "all":
        return true;
      case "de-confirmat":
        return verification === "verify";
      case "materiale":
      case "manopera":
      case "servicii":
        return costCategoryFromKindLabel(row.kindLabel) === filter;
      default: {
        const exhaustive: never = filter;
        return exhaustive;
      }
    }
  });
}

export function costRowDetail(
  row: CostEvidenceRowTransport,
  canSeeAmounts = true,
): string {
  const category = costCategoryLabel(costCategoryFromKindLabel(row.kindLabel));
  const verification = presentCostVerification(row);
  const parts = [category];
  if (row.qualifierLabel) {
    parts.push(row.qualifierLabel);
  }
  if (verification !== "missing" && canSeeAmounts) {
    parts.push(costVerificationLabel(verification));
  }
  return parts.join(" · ");
}

export function costRowAmountContext(
  row: CostEvidenceRowTransport,
  canSeeAmounts: boolean,
): string {
  const verification = presentCostVerification(row);
  if (verification === "missing") {
    return "Cost lipsa";
  }
  if (row.amountDisplay) {
    const [amountPart] = row.amountDisplay.split(" · ");
    return amountPart ?? row.amountDisplay;
  }
  if (!canSeeAmounts || row.amount === null) {
    return verification === "confirmed" ? "Confirmat" : "De verificat";
  }
  return `${String(row.amount).replace(".", ",")} ${row.currency ?? "EUR"} / ${row.unitLabel ?? "unitate"}`;
}

export function sameCostRegistryRow(
  left: CostEvidenceRowTransport,
  right: CostEvidenceRowTransport,
): boolean {
  return (
    left.resourceId === right.resourceId &&
    (left.qualifierIdentity ?? "unqualified") === (right.qualifierIdentity ?? "unqualified")
  );
}
