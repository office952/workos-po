import {
  projectManualFixedServicePrice,
} from "../commercial/servicePrice.js";
import type { CommercialPriceCompleteness } from "../commercial/price.js";
import type { OperationalServiceProviderMode } from "../operationalServices.js";
import type { CostEvidence } from "../resources/catalog.js";
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  getResource,
  resourceUnitLabel,
} from "../resources/catalog.js";
import { roundMoney } from "../commercial/price.js";
import type { EicLine, EicResult } from "../resources/eic.js";
import {
  isCompleteInternalInstallLaborEvidence,
  isCompleteSubcontractInstallEvidence,
} from "./evidence.js";
import type { SiteInstallationFacts } from "./facts.js";

export const SITE_INSTALLATION_SCOPE_ID = "SITE_INSTALLATION";
export const SITE_INSTALLATION_LABEL = "Montaj la locație";
export const SITE_INSTALLATION_FREEZE_REASON =
  "Montajul nu are încă un cost complet.";
export const SITE_INSTALLATION_PRICE_FREEZE_REASON =
  "Prețul de montaj nu este confirmat de owner.";

export const OPTIONAL_COMMERCIAL_SCOPE_IDS = [SITE_INSTALLATION_SCOPE_ID] as const;
export type OptionalCommercialScopeId = (typeof OPTIONAL_COMMERCIAL_SCOPE_IDS)[number];

export const SITE_INSTALLATION_INCOMPLETE_REASON_IDS = [
  "MISSING_COST_EVIDENCE",
  "MISSING_PROVIDER_MODE",
  "MISSING_CREW_SIZE",
  "MISSING_PLANNED_DURATION",
  "MISSING_INTERNAL_LABOR_EVIDENCE",
  "MISSING_SUBCONTRACT_EVIDENCE",
  "SUBCONTRACT_EVIDENCE_INVALID",
  "SITE_ELECTRICAL_COST_REQUIRED",
  "SITE_ADDRESS_INCOMPLETE",
  "SITE_MEASUREMENTS_UNCONFIRMED",
  "FACADE_UNCONFIRMED",
  "FIXING_UNCONFIRMED",
  "SITE_ELECTRICAL_UNCONFIRMED",
] as const;
export type SiteInstallationIncompleteReasonId =
  (typeof SITE_INSTALLATION_INCOMPLETE_REASON_IDS)[number];

export type SiteInstallationIncompleteReason = {
  id: SiteInstallationIncompleteReasonId;
  label: string;
};

export type SiteInstallationEvidenceInput = {
  internalLabor?: CostEvidence | null;
  subcontract?: CostEvidence | null;
};

export type SiteInstallationProjectionInput = {
  selected: boolean;
  facts?: SiteInstallationFacts | null;
  providerMode?: OperationalServiceProviderMode | null;
  evidence?: SiteInstallationEvidenceInput;
  manualNetPrice?: number | null;
  asOf?: string;
};

export type SiteInstallationScopeProjection = {
  scopeId: typeof SITE_INSTALLATION_SCOPE_ID;
  label: typeof SITE_INSTALLATION_LABEL;
  eic: EicResult;
  commercial: ReturnType<typeof projectManualFixedServicePrice>;
  incompleteReasons: readonly SiteInstallationIncompleteReason[];
};

export type SiteInstallationOwnerInternalCost = {
  label: string;
  total: number;
  currency: "EUR";
  quantity: number;
  unitLabel: string;
  rate: number;
};

export type SiteInstallationOperatorView = {
  scopeId: typeof SITE_INSTALLATION_SCOPE_ID;
  label: typeof SITE_INSTALLATION_LABEL;
  eicCompleteness: EicResult["completeness"];
  commercialCompleteness: CommercialPriceCompleteness;
  commercialNetPrice: number | null;
  commercialGrossPrice: number | null;
  incompleteReasons: readonly SiteInstallationIncompleteReason[];
  ownerInternalCost?: SiteInstallationOwnerInternalCost;
};

export function isKnownOptionalScopeId(value: string): value is OptionalCommercialScopeId {
  return (OPTIONAL_COMMERCIAL_SCOPE_IDS as readonly string[]).includes(value);
}

export function normalizeOptionalScopeIds(
  ids: readonly string[],
): { ok: true; ids: readonly string[] } | { ok: false; error: "unknown_optional_scope" } {
  const normalized: string[] = [];
  for (const raw of ids) {
    if (!isKnownOptionalScopeId(raw)) {
      return { ok: false, error: "unknown_optional_scope" };
    }
    if (!normalized.includes(raw)) {
      normalized.push(raw);
    }
  }
  return { ok: true, ids: normalized };
}

export function sameOptionalScopeIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function commercialRequestHasOptionalScope(
  optionalScopeIds: readonly string[],
  scopeId: string,
): boolean {
  return optionalScopeIds.includes(scopeId);
}

export function siteInstallationIncompleteReasonLabel(
  id: SiteInstallationIncompleteReasonId,
): string {
  switch (id) {
    case "MISSING_COST_EVIDENCE":
      return "Evidența de cost pentru montaj lipsește.";
    case "MISSING_PROVIDER_MODE":
      return "Modul de execuție al montajului nu este ales.";
    case "MISSING_CREW_SIZE":
      return "Numărul de persoane pentru montajul intern lipsește.";
    case "MISSING_PLANNED_DURATION":
      return "Durata planificată pentru montajul intern lipsește.";
    case "MISSING_INTERNAL_LABOR_EVIDENCE":
      return "Tariful intern de montaj pe oră-persoană nu este confirmat.";
    case "MISSING_SUBCONTRACT_EVIDENCE":
      return "Evidența de cost a subcontractantului lipsește.";
    case "SUBCONTRACT_EVIDENCE_INVALID":
      return "Evidența subcontractantului nu este validă pentru această dată.";
    case "SITE_ELECTRICAL_COST_REQUIRED":
      return "Racordul electric inclus sau subcontractat nu are evidență de cost.";
    case "SITE_ADDRESS_INCOMPLETE":
      return "Adresa locului de execuție este incompletă.";
    case "SITE_MEASUREMENTS_UNCONFIRMED":
      return "Măsurătorile la locație nu sunt confirmate.";
    case "FACADE_UNCONFIRMED":
      return "Tipul de fațadă nu este confirmat.";
    case "FIXING_UNCONFIRMED":
      return "Sistemul de prindere nu este confirmat.";
    case "SITE_ELECTRICAL_UNCONFIRMED":
      return "Racordul electric de șantier nu este confirmat.";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function siteInstallationIncompleteReasonIds(
  input: Pick<SiteInstallationProjectionInput, "facts" | "providerMode" | "evidence" | "asOf"> = {},
): readonly SiteInstallationIncompleteReasonId[] {
  const facts = input.facts;
  const asOf = input.asOf ?? new Date().toISOString();
  const ids: SiteInstallationIncompleteReasonId[] = [];

  if (facts === undefined) {
    ids.push("MISSING_COST_EVIDENCE");
    return ids;
  }

  const street = facts?.street.trim() ?? "";
  const city = facts?.city.trim() ?? "";
  if (!street || !city) {
    ids.push("SITE_ADDRESS_INCOMPLETE");
  }
  if (!facts || facts.measurementStatus === "UNCONFIRMED") {
    ids.push("SITE_MEASUREMENTS_UNCONFIRMED");
  }
  if (!facts || facts.facadeType === "UNCONFIRMED") {
    ids.push("FACADE_UNCONFIRMED");
  }
  if (!facts || facts.fixingMethod === "UNCONFIRMED") {
    ids.push("FIXING_UNCONFIRMED");
  }
  if (!facts || facts.siteElectrical === "UNCONFIRMED") {
    ids.push("SITE_ELECTRICAL_UNCONFIRMED");
  }
  if (
    facts?.siteElectrical === "INCLUDED" ||
    facts?.siteElectrical === "SUBCONTRACTED"
  ) {
    ids.push("SITE_ELECTRICAL_COST_REQUIRED");
  }

  const mode = input.providerMode ?? null;
  if (!mode) {
    ids.push("MISSING_PROVIDER_MODE");
    ids.push("MISSING_COST_EVIDENCE");
    return uniqueReasonIds(ids);
  }

  if (mode === "INTERNAL") {
    if (!facts?.crewSize) {
      ids.push("MISSING_CREW_SIZE");
    }
    if (!facts?.plannedDurationHours) {
      ids.push("MISSING_PLANNED_DURATION");
    }
    if (!isCompleteInternalInstallLaborEvidence(input.evidence?.internalLabor)) {
      ids.push("MISSING_INTERNAL_LABOR_EVIDENCE");
      ids.push("MISSING_COST_EVIDENCE");
    }
    return uniqueReasonIds(ids);
  }

  const subcontract = input.evidence?.subcontract ?? null;
  if (!subcontract) {
    ids.push("MISSING_SUBCONTRACT_EVIDENCE");
    ids.push("MISSING_COST_EVIDENCE");
    return uniqueReasonIds(ids);
  }
  if (!isCompleteSubcontractInstallEvidence(subcontract, asOf)) {
    ids.push("SUBCONTRACT_EVIDENCE_INVALID");
    ids.push("MISSING_COST_EVIDENCE");
  }
  return uniqueReasonIds(ids);
}

export function siteInstallationIncompleteReasons(
  input: Pick<SiteInstallationProjectionInput, "facts" | "providerMode" | "evidence" | "asOf"> = {},
): readonly SiteInstallationIncompleteReason[] {
  return siteInstallationIncompleteReasonIds(input).map((id) => ({
    id,
    label: siteInstallationIncompleteReasonLabel(id),
  }));
}

export function projectSiteInstallationScope(
  input: SiteInstallationProjectionInput,
): SiteInstallationScopeProjection | null {
  if (!input.selected) {
    return null;
  }
  const incompleteReasons = siteInstallationIncompleteReasons(input);
  const eic = compileSiteInstallationEic(input, incompleteReasons);
  return {
    scopeId: SITE_INSTALLATION_SCOPE_ID,
    label: SITE_INSTALLATION_LABEL,
    eic,
    commercial: projectManualFixedServicePrice({
      netPrice: input.manualNetPrice ?? null,
    }),
    incompleteReasons,
  };
}

export function presentSiteInstallationScope(
  projection: SiteInstallationScopeProjection | null,
): SiteInstallationOperatorView | null {
  if (!projection) {
    return null;
  }
  const commercialComplete = projection.commercial.completeness === "COMPLETE";
  const ownerInternalCost = presentOwnerInternalCost(projection.eic);
  return {
    scopeId: projection.scopeId,
    label: projection.label,
    eicCompleteness: projection.eic.completeness,
    commercialCompleteness: projection.commercial.completeness,
    commercialNetPrice: commercialComplete ? projection.commercial.netPrice : null,
    commercialGrossPrice: commercialComplete ? projection.commercial.grossPrice : null,
    incompleteReasons: projection.incompleteReasons,
    ...(ownerInternalCost ? { ownerInternalCost } : {}),
  };
}

export function siteInstallationIsPrequoteReady(
  view: Pick<
    SiteInstallationOperatorView,
    "eicCompleteness" | "commercialCompleteness" | "incompleteReasons"
  >,
): boolean {
  return (
    view.eicCompleteness === "COMPLETE" &&
    view.commercialCompleteness === "COMPLETE" &&
    view.incompleteReasons.length === 0
  );
}

export function siteInstallationReadinessLabel(
  view: Pick<
    SiteInstallationOperatorView,
    "eicCompleteness" | "commercialCompleteness" | "incompleteReasons"
  >,
): string {
  if (siteInstallationIsPrequoteReady(view)) {
    return "Pregătit pentru ofertă";
  }
  const expired = view.incompleteReasons.some(
    (reason) => reason.id === "SUBCONTRACT_EVIDENCE_INVALID",
  );
  const costReady = view.eicCompleteness === "COMPLETE";
  const priceConfirmed = view.commercialCompleteness === "COMPLETE";
  if (priceConfirmed && expired) {
    return "Preț client confirmat · Dovadă subcontract expirată";
  }
  if (priceConfirmed && !costReady) {
    return "Preț client confirmat · Cost intern incomplet";
  }
  if (!priceConfirmed && costReady) {
    return "Cost intern pregătit · Preț client neconfirmat";
  }
  return "Incomplet";
}

function presentOwnerInternalCost(
  eic: EicResult,
): SiteInstallationOwnerInternalCost | undefined {
  if (eic.completeness !== "COMPLETE" || eic.lines.length === 0) {
    return undefined;
  }
  const line = eic.lines[0];
  if (!line) {
    return undefined;
  }
  return {
    label: ownerInternalCostLabel(line.resourceId),
    total: eic.total,
    currency: eic.currency,
    quantity: line.quantity,
    unitLabel: resourceUnitLabel(line.unit),
    rate: line.rate,
  };
}

function ownerInternalCostLabel(resourceId: string): string {
  switch (resourceId) {
    case LAB_SITE_INSTALL_ID:
      return "Cost intern estimat montaj";
    case SVC_SITE_INSTALL_SUBCONTRACT_ID:
      return "Cost subcontractat montaj";
    default:
      return "Cost intern montaj";
  }
}

export function siteInstallationBlocksQuoteFreeze(
  optionalScopeIds: readonly string[],
  readiness?: Omit<SiteInstallationProjectionInput, "selected">,
): boolean {
  const selected = commercialRequestHasOptionalScope(
    optionalScopeIds,
    SITE_INSTALLATION_SCOPE_ID,
  );
  const projection = projectSiteInstallationScope({
    selected,
    ...readiness,
  });
  return (
    projection !== null &&
    (projection.eic.completeness !== "COMPLETE" ||
      projection.commercial.completeness !== "COMPLETE")
  );
}

export type IncompleteOfferRefusal = {
  error: "incomplete_offer";
  reasons: readonly string[];
};

export function siteInstallationFreezeRefusal(
  optionalScopeIds: readonly string[],
  readiness?: Omit<SiteInstallationProjectionInput, "selected">,
): IncompleteOfferRefusal | null {
  if (!siteInstallationBlocksQuoteFreeze(optionalScopeIds, readiness)) {
    return null;
  }
  const projection = projectSiteInstallationScope({
    selected: true,
    ...readiness,
  });
  const reasons = [SITE_INSTALLATION_FREEZE_REASON];
  if (projection && projection.commercial.completeness !== "COMPLETE") {
    reasons.push(SITE_INSTALLATION_PRICE_FREEZE_REASON);
  }
  return {
    error: "incomplete_offer",
    reasons,
  };
}

function compileSiteInstallationEic(
  input: SiteInstallationProjectionInput,
  incompleteReasons: readonly SiteInstallationIncompleteReason[],
): EicResult {
  const lines = buildInstallEicLines(input);
  const complete = incompleteReasons.length === 0 && lines.length > 0;
  const total = roundMoney(lines.reduce((sum, line) => sum + line.cost, 0));
  return {
    completeness: complete ? "COMPLETE" : "PARTIAL",
    completenessReasons: incompleteReasons.map((reason) => reason.label),
    geometryLabel: null,
    currency: "EUR",
    lines: complete ? lines : [],
    total: complete ? total : 0,
    excludedComponentLabels: [],
  };
}

function buildInstallEicLines(input: SiteInstallationProjectionInput): EicLine[] {
  const asOf = input.asOf ?? new Date().toISOString();
  if (input.providerMode === "INTERNAL") {
    const evidence = input.evidence?.internalLabor ?? null;
    const crew = input.facts?.crewSize;
    const hours = input.facts?.plannedDurationHours;
    if (
      !crew ||
      !hours ||
      !isCompleteInternalInstallLaborEvidence(evidence)
    ) {
      return [];
    }
    const resource = getResource(LAB_SITE_INSTALL_ID);
    if (!resource) {
      return [];
    }
    const quantity = roundMoney(crew * hours);
    const cost = roundMoney(quantity * evidence.amount);
    return [
      {
        resourceId: resource.id,
        label: resource.label,
        quantity,
        unit: resource.unit,
        rate: evidence.amount,
        currency: "EUR",
        cost,
        kind: resource.kind,
        group: "labor",
      },
    ];
  }
  if (input.providerMode === "SUBCONTRACTED") {
    const evidence = input.evidence?.subcontract ?? null;
    if (!isCompleteSubcontractInstallEvidence(evidence, asOf)) {
      return [];
    }
    const resource = getResource(SVC_SITE_INSTALL_SUBCONTRACT_ID);
    if (!resource) {
      return [];
    }
    return [
      {
        resourceId: resource.id,
        label: resource.label,
        quantity: 1,
        unit: resource.unit,
        rate: evidence.amount,
        currency: "EUR",
        cost: evidence.amount,
        kind: resource.kind,
        group: "services",
      },
    ];
  }
  return [];
}

function uniqueReasonIds(
  ids: readonly SiteInstallationIncompleteReasonId[],
): SiteInstallationIncompleteReasonId[] {
  return [...new Set(ids)];
}
