import { calendarDateCoversAsOf } from "../calendarDate.js";
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  isValidCostAmount,
  type CostEvidence,
} from "../resources/catalog.js";

export function isOwnerConfirmedCostEvidence(
  evidence: CostEvidence | null | undefined,
): evidence is CostEvidence {
  return (
    evidence !== null &&
    evidence !== undefined &&
    evidence.classification === "OWNER_CONFIRMED" &&
    isValidCostAmount(evidence.amount) &&
    evidence.currency === "EUR"
  );
}

export function costEvidenceCoversInstant(
  evidence: CostEvidence,
  asOf: string,
): boolean {
  return calendarDateCoversAsOf({
    validFrom: evidence.validFrom,
    validUntil: evidence.validUntil,
    asOf,
  });
}

export function isCompleteInternalInstallLaborEvidence(
  evidence: CostEvidence | null | undefined,
): evidence is CostEvidence {
  return (
    isOwnerConfirmedCostEvidence(evidence) &&
    evidence.resourceId === LAB_SITE_INSTALL_ID &&
    evidence.perUnit === "person_hour"
  );
}

export function isCompleteSubcontractInstallEvidence(
  evidence: CostEvidence | null | undefined,
  asOf: string,
): evidence is CostEvidence {
  if (
    !isOwnerConfirmedCostEvidence(evidence) ||
    evidence.resourceId !== SVC_SITE_INSTALL_SUBCONTRACT_ID ||
    evidence.perUnit !== "job"
  ) {
    return false;
  }
  const supplier = evidence.supplierLabel?.trim() ?? "";
  if (supplier.length === 0) {
    return false;
  }
  if (!evidence.validUntil) {
    return false;
  }
  return costEvidenceCoversInstant(evidence, asOf);
}

export function siteInstallationEvidenceFromRows(
  rows: readonly CostEvidence[],
): { internalLabor: CostEvidence | null; subcontract: CostEvidence | null } {
  return {
    internalLabor:
      rows.find((row) => row.resourceId === LAB_SITE_INSTALL_ID) ?? null,
    subcontract:
      rows.find((row) => row.resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID) ?? null,
  };
}
