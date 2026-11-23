import { calendarDateCoversAsOf } from "../calendarDate.js";
import type { SiteInstallationElectricalState } from "./facts.js";
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_ELECTRICAL_INCLUDED_ID,
  SVC_SITE_ELECTRICAL_SUBCONTRACT_ID,
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
): {
  internalLabor: CostEvidence | null;
  subcontract: CostEvidence | null;
  includedElectrical: CostEvidence | null;
  subcontractedElectrical: CostEvidence | null;
} {
  return {
    internalLabor:
      rows.find((row) => row.resourceId === LAB_SITE_INSTALL_ID) ?? null,
    subcontract:
      rows.find((row) => row.resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID) ?? null,
    includedElectrical:
      rows.find((row) => row.resourceId === SVC_SITE_ELECTRICAL_INCLUDED_ID) ?? null,
    subcontractedElectrical:
      rows.find((row) => row.resourceId === SVC_SITE_ELECTRICAL_SUBCONTRACT_ID) ?? null,
  };
}

function isDeliberateElectricalAmount(evidence: CostEvidence): boolean {
  if (evidence.amount > 0) {
    return true;
  }
  return evidence.amount === 0 && evidence.note.trim().length > 0;
}

function isOwnerConfirmedElectricalEvidence(
  evidence: CostEvidence | null | undefined,
  resourceId: string,
): evidence is CostEvidence {
  return (
    evidence !== null &&
    evidence !== undefined &&
    evidence.classification === "OWNER_CONFIRMED" &&
    evidence.currency === "EUR" &&
    evidence.resourceId === resourceId &&
    evidence.perUnit === "job" &&
    Number.isFinite(evidence.amount) &&
    evidence.amount >= 0 &&
    isDeliberateElectricalAmount(evidence)
  );
}

export function isCompleteIncludedSiteElectricalEvidence(
  evidence: CostEvidence | null | undefined,
): evidence is CostEvidence {
  return isOwnerConfirmedElectricalEvidence(evidence, SVC_SITE_ELECTRICAL_INCLUDED_ID);
}

export function isCompleteSubcontractedSiteElectricalEvidence(
  evidence: CostEvidence | null | undefined,
  asOf: string,
): evidence is CostEvidence {
  if (!isOwnerConfirmedElectricalEvidence(evidence, SVC_SITE_ELECTRICAL_SUBCONTRACT_ID)) {
    return false;
  }
  const supplier = evidence.supplierLabel?.trim() ?? "";
  if (supplier.length === 0 || !evidence.validUntil) {
    return false;
  }
  return costEvidenceCoversInstant(evidence, asOf);
}

export function siteElectricalEvidenceForState(
  state: SiteInstallationElectricalState | string | null | undefined,
  evidence:
    | {
        includedElectrical?: CostEvidence | null;
        subcontractedElectrical?: CostEvidence | null;
      }
    | null
    | undefined,
): CostEvidence | null {
  if (state === "INCLUDED") {
    return evidence?.includedElectrical ?? null;
  }
  if (state === "SUBCONTRACTED") {
    return evidence?.subcontractedElectrical ?? null;
  }
  return null;
}
