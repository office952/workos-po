export const RESOURCE_KINDS = ["MATERIAL", "SERVICE", "LABOR"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const MATERIAL_FAMILY_IDS = [
  "PLEXIGLAS",
  "FOREX",
  "ALUMINIUM",
  "LED",
  "VINYL",
  "ACM",
  "STEEL",
] as const;
export type MaterialFamilyId = (typeof MATERIAL_FAMILY_IDS)[number];

export type ProductResourceUnit = "m" | "m2" | "buc";
export type ResourceUnit = ProductResourceUnit | "person_hour" | "job";

export function isProductResourceUnit(unit: ResourceUnit): unit is ProductResourceUnit {
  return unit === "m" || unit === "m2" || unit === "buc";
}
export type MaterialForm = "sheet" | "profile";

export type ElectricalSpecification = {
  voltageV: number;
  capacityW?: number;
};

export type MaterialFamily = {
  id: MaterialFamilyId;
  label: string;
  description: string;
};

export type MaterialSpecification = {
  familyId: MaterialFamilyId;
  form: MaterialForm;
  thicknessMm?: number;
  opticalType?: "opal";
};

export type CostEvidenceQualifierKind = "volumeDepthMm";

export type CostEvidenceQualifierField = {
  kind: CostEvidenceQualifierKind;
  label: string;
  unitLabel: string;
};

export const VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER: CostEvidenceQualifierField = {
  kind: "volumeDepthMm",
  label: "Adâncime volum",
  unitLabel: "mm",
};

export type ResourceDefinition = {
  id: string;
  label: string;
  kind: ResourceKind;
  unit: ResourceUnit;
  familyId?: MaterialFamilyId;
  specification?: MaterialSpecification;
  electrical?: ElectricalSpecification;
  costEvidenceQualifiers?: readonly CostEvidenceQualifierKind[];
};

export type CostEvidenceWhen = {
  volumeDepthMm?: number;
};

export function costEvidenceQualifierIdentity(when?: CostEvidenceWhen): string {
  if (when?.volumeDepthMm !== undefined) {
    return `volumeDepthMm=${when.volumeDepthMm}`;
  }
  return "unqualified";
}

function costEvidenceSortKey(evidence: CostEvidence): string {
  return `${evidence.resourceId}:${evidence.when?.volumeDepthMm ?? ""}`;
}

export function sameCostEvidenceSlot(left: CostEvidence, right: CostEvidence): boolean {
  return (
    left.resourceId === right.resourceId &&
    costEvidenceQualifierIdentity(left.when) === costEvidenceQualifierIdentity(right.when)
  );
}

export function sortActiveCostEvidence(
  rows: readonly CostEvidence[],
): CostEvidence[] {
  const rank = new Map(
    costEvidence.map((item, index) => [costEvidenceSortKey(item), index]),
  );
  return [...rows].sort((left, right) => {
    const leftRank = rank.get(costEvidenceSortKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(costEvidenceSortKey(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
  });
}

export function applyActiveCostEvidenceWrite(
  current: readonly CostEvidence[],
  next: CostEvidence,
  supersededRowId?: string | null,
): CostEvidence[] {
  const remaining = current.filter((row) => {
    if (supersededRowId && row.evidenceRowId === supersededRowId) {
      return false;
    }
    return !sameCostEvidenceSlot(row, next);
  });
  return sortActiveCostEvidence([...remaining, next]);
}

export function costEvidenceQualifierFieldsFor(
  qualifiers: readonly CostEvidenceQualifierKind[] | undefined,
): readonly CostEvidenceQualifierField[] {
  return (qualifiers ?? []).map((kind) => {
    switch (kind) {
      case "volumeDepthMm":
        return VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  });
}

export function resourceAllowsCostEvidenceQualifier(
  resource: ResourceDefinition,
  kind: CostEvidenceQualifierKind,
): boolean {
  return (resource.costEvidenceQualifiers ?? []).includes(kind);
}

export function parseCostEvidenceWhen(
  input: unknown,
): { ok: true; when?: CostEvidenceWhen } | { ok: false; error: "invalid_qualifier" } {
  if (input === undefined || input === null) {
    return { ok: true };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_qualifier" };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "volumeDepthMm")) {
    return { ok: false, error: "invalid_qualifier" };
  }
  if (!Object.prototype.hasOwnProperty.call(record, "volumeDepthMm")) {
    return { ok: true };
  }
  const value = record.volumeDepthMm;
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return { ok: false, error: "invalid_qualifier" };
  }
  return { ok: true, when: { volumeDepthMm: value } };
}

export type CostEvidence = {
  resourceId: string;
  amount: number;
  currency: "EUR";
  perUnit: ResourceUnit;
  source:
    | "PILOT_INTERNAL_EVIDENCE"
    | "OWNER_CONFIRMED_PURCHASE"
    | "OWNER_CONFIRMED_WORKSHOP"
    | "LEGACY_EVIDENCE"
    | "AI_DECISION"
    | "PLATFORM_DEFAULT";
  classification: "AI_DECISION" | "OWNER_CONFIRMED" | "DEVELOPMENT_DEFAULT";
  note: string;
  when?: CostEvidenceWhen;
  supplierLabel?: string;
  validFrom?: string;
  validUntil?: string;
  evidenceRowId?: string;
  createdAt?: string;
};

export type CostEvidenceRecord = CostEvidence & {
  evidenceRowId: string;
  createdAt: string;
  supersededAt: string | null;
};

export const PLEXIGLAS_3MM_OPAL_ID = "plexiglas_3mm_opal";
export const FOREX_10MM_ID = "forex_10mm";
export const ALUMINIUM_RETURN_PROFILE_ID = "aluminium_return_profile";
export const RETURN_CANT_FORMING_ID = "return_cant_forming";
export const MAT_LED_MODULE_ID = "MAT-LED-MODULE";
export const MAT_LED_PSU_12V_60W_ID = "MAT-LED-PSU-12V-60W";
export const MAT_LED_PSU_12V_100W_ID = "MAT-LED-PSU-12V-100W";
export const MAT_LED_PSU_12V_160W_ID = "MAT-LED-PSU-12V-160W";
export const MAT_LED_PSU_12V_200W_ID = "MAT-LED-PSU-12V-200W";
export const MAT_VINYL_ORACAL_651_ID = "MAT-VINYL-ORACAL-651";
export const SVC_CNC_FACE_ID = "SVC-CNC-FACE";
export const SVC_CNC_BACK_ID = "SVC-CNC-BACK";
export const LAB_VINYL_FACE_ID = "LAB-VINYL-FACE";
export const LAB_VINYL_VOLUME_ID = "LAB-VINYL-VOLUME";
export const LAB_BOND_LETTER_BODY_ID = "LAB-BOND-LETTER-BODY";
export const LAB_CLOSE_LETTER_BODY_ID = "LAB-CLOSE-LETTER-BODY";
export const SVC_PLACE_LED_MODULES_ID = "SVC-PLACE-LED-MODULES";
export const SVC_ELECTRICAL_FINISH_ID = "SVC-ELECTRICAL-FINISH";
export const SVC_PAINT_RAL_ID = "SVC-PAINT-RAL";
export const SVC_PACK_PRODUCT_ID = "SVC-PACK-PRODUCT";
export const ACM_3MM_ID = "acm_3mm";
export const STEEL_FRAME_PROFILE_ID = "steel_frame_profile";
export const SVC_CNC_SHEET_PANEL_ID = "SVC-CNC-SHEET-PANEL";
export const SVC_CUT_METAL_STOCK_ID = "SVC-CUT-METAL-STOCK";
export const LAB_FORM_SHEET_CASSETTE_ID = "LAB-FORM-SHEET-CASSETTE";
export const LAB_ATTACH_INTERNAL_FRAME_ID = "LAB-ATTACH-INTERNAL-FRAME";
export const LAB_SITE_INSTALL_ID = "LAB-SITE-INSTALL";
export const SVC_SITE_INSTALL_SUBCONTRACT_ID = "SVC-SITE-INSTALL-SUBCONTRACT";

export const materialFamilies: readonly MaterialFamily[] = [
  {
    id: "PLEXIGLAS",
    label: "Plexiglas",
    description: "Familie de foi PMMA. Grosimea și proprietatea optică sunt specificație, nu familia.",
  },
  {
    id: "FOREX",
    label: "Forex",
    description: "Familie de foi PVC expandat. Grosimea este specificație.",
  },
  {
    id: "ALUMINIUM",
    label: "Aluminiu",
    description: "Familie de aluminiu. Tabla, profilul și grosimea sunt specificație.",
  },
  {
    id: "LED",
    label: "Iluminare LED",
    description:
      "Module LED și surse 12V. Puterea pe modul este setare tehnică; capacitatea sursei este specificație de resursă.",
  },
  {
    id: "VINYL",
    label: "Folie / colant",
    description:
      "Folie de aplicare. Materialul este separat de manopera de aplicare.",
  },
  {
    id: "ACM",
    label: "ACM",
    description: "Familie de foi composite aluminiu-polietilenă. Grosimea este specificație.",
  },
  {
    id: "STEEL",
    label: "Oțel",
    description: "Familie de oțel. Profilul de cadru este specificație, nu prinderea.",
  },
];

export const resourceCatalog: readonly ResourceDefinition[] = [
  {
    id: PLEXIGLAS_3MM_OPAL_ID,
    label: "Plexiglas 3 mm opal",
    kind: "MATERIAL",
    unit: "m2",
    familyId: "PLEXIGLAS",
    specification: {
      familyId: "PLEXIGLAS",
      form: "sheet",
      thicknessMm: 3,
      opticalType: "opal",
    },
  },
  {
    id: FOREX_10MM_ID,
    label: "Forex 10 mm",
    kind: "MATERIAL",
    unit: "m2",
    familyId: "FOREX",
    specification: {
      familyId: "FOREX",
      form: "sheet",
      thicknessMm: 10,
    },
  },
  {
    id: ALUMINIUM_RETURN_PROFILE_ID,
    label: "Profil aluminiu 0,6 mm",
    kind: "MATERIAL",
    unit: "m",
    familyId: "ALUMINIUM",
    specification: {
      familyId: "ALUMINIUM",
      form: "profile",
      thicknessMm: 0.6,
    },
    costEvidenceQualifiers: ["volumeDepthMm"],
  },
  {
    id: RETURN_CANT_FORMING_ID,
    label: "Formare profil aluminiu",
    kind: "SERVICE",
    unit: "m",
  },
  {
    id: MAT_LED_MODULE_ID,
    label: "Modul LED 12V",
    kind: "MATERIAL",
    unit: "buc",
    familyId: "LED",
    electrical: { voltageV: 12 },
  },
  {
    id: MAT_LED_PSU_12V_60W_ID,
    label: "Sursă LED 12V 60W",
    kind: "MATERIAL",
    unit: "buc",
    familyId: "LED",
    electrical: { voltageV: 12, capacityW: 60 },
  },
  {
    id: MAT_LED_PSU_12V_100W_ID,
    label: "Sursă LED 12V 100W",
    kind: "MATERIAL",
    unit: "buc",
    familyId: "LED",
    electrical: { voltageV: 12, capacityW: 100 },
  },
  {
    id: MAT_LED_PSU_12V_160W_ID,
    label: "Sursă LED 12V 160W",
    kind: "MATERIAL",
    unit: "buc",
    familyId: "LED",
    electrical: { voltageV: 12, capacityW: 160 },
  },
  {
    id: MAT_LED_PSU_12V_200W_ID,
    label: "Sursă LED 12V 200W",
    kind: "MATERIAL",
    unit: "buc",
    familyId: "LED",
    electrical: { voltageV: 12, capacityW: 200 },
  },
  {
    id: MAT_VINYL_ORACAL_651_ID,
    label: "Folie Oracal 651",
    kind: "MATERIAL",
    unit: "m2",
    familyId: "VINYL",
    specification: { familyId: "VINYL", form: "sheet" },
  },
  {
    id: SVC_CNC_FACE_ID,
    label: "Debitare CNC față",
    kind: "SERVICE",
    unit: "m",
  },
  {
    id: SVC_CNC_BACK_ID,
    label: "Debitare CNC spate",
    kind: "SERVICE",
    unit: "m",
  },
  {
    id: LAB_VINYL_FACE_ID,
    label: "Aplicare folie față",
    kind: "LABOR",
    unit: "m2",
  },
  {
    id: LAB_VINYL_VOLUME_ID,
    label: "Aplicare folie volum",
    kind: "LABOR",
    unit: "m",
  },
  {
    id: LAB_BOND_LETTER_BODY_ID,
    label: "Lipire față-volum",
    kind: "LABOR",
    unit: "m",
  },
  {
    id: LAB_CLOSE_LETTER_BODY_ID,
    label: "Închidere corp",
    kind: "LABOR",
    unit: "m",
  },
  {
    id: SVC_PLACE_LED_MODULES_ID,
    label: "Montare module LED",
    kind: "SERVICE",
    unit: "buc",
  },
  {
    id: SVC_ELECTRICAL_FINISH_ID,
    label: "Pregătire electrică",
    kind: "SERVICE",
    unit: "buc",
  },
  {
    id: SVC_PAINT_RAL_ID,
    label: "Vopsire RAL",
    kind: "SERVICE",
    unit: "m",
  },
  {
    id: SVC_PACK_PRODUCT_ID,
    label: "Ambalare",
    kind: "SERVICE",
    unit: "m2",
  },
  {
    id: ACM_3MM_ID,
    label: "ACM 3 mm",
    kind: "MATERIAL",
    unit: "m2",
    familyId: "ACM",
    specification: {
      familyId: "ACM",
      form: "sheet",
      thicknessMm: 3,
    },
  },
  {
    id: STEEL_FRAME_PROFILE_ID,
    label: "Profil oțel cadru intern",
    kind: "MATERIAL",
    unit: "m",
    familyId: "STEEL",
    specification: {
      familyId: "STEEL",
      form: "profile",
    },
  },
  {
    id: SVC_CNC_SHEET_PANEL_ID,
    label: "Debitare CNC foaie panou",
    kind: "SERVICE",
    unit: "m2",
  },
  {
    id: SVC_CUT_METAL_STOCK_ID,
    label: "Debitare semifabricat metalic",
    kind: "SERVICE",
    unit: "m",
  },
  {
    id: LAB_FORM_SHEET_CASSETTE_ID,
    label: "Formare casetă din foaie",
    kind: "LABOR",
    unit: "buc",
  },
  {
    id: LAB_ATTACH_INTERNAL_FRAME_ID,
    label: "Prindere cadru intern",
    kind: "LABOR",
    unit: "buc",
  },
  {
    id: LAB_SITE_INSTALL_ID,
    label: "Manoperă montaj la locație",
    kind: "LABOR",
    unit: "person_hour",
  },
  {
    id: SVC_SITE_INSTALL_SUBCONTRACT_ID,
    label: "Montaj la locație subcontractat",
    kind: "SERVICE",
    unit: "job",
  },
];

export const costEvidence: readonly CostEvidence[] = [
  {
    resourceId: ALUMINIUM_RETURN_PROFILE_ID,
    amount: 3,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed workshop purchase for 60 mm depth. Not a universal profile rate.",
    when: { volumeDepthMm: 60 },
  },
  {
    resourceId: ALUMINIUM_RETURN_PROFILE_ID,
    amount: 2,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed workshop purchase for 30 mm depth. Not a universal profile rate.",
    when: { volumeDepthMm: 30 },
  },
  {
    resourceId: ALUMINIUM_RETURN_PROFILE_ID,
    amount: 4,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed workshop purchase for 80 mm depth. Not a universal profile rate.",
    when: { volumeDepthMm: 80 },
  },
  {
    resourceId: ALUMINIUM_RETURN_PROFILE_ID,
    amount: 5,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed workshop purchase for 100 mm depth. Not a universal profile rate.",
    when: { volumeDepthMm: 100 },
  },
  {
    resourceId: RETURN_CANT_FORMING_ID,
    amount: 5,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed internal forming rate. Same basis for all configured depths.",
  },
  {
    resourceId: PLEXIGLAS_3MM_OPAL_ID,
    amount: 16,
    currency: "EUR",
    perUnit: "m2",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Legacy MAT-ACP-FATA-LITERE: plexiglas 3 mm PMMA opal = 16 EUR/mp purchase, no markup. Waste not folded into unit cost.",
  },
  {
    resourceId: FOREX_10MM_ID,
    amount: 16,
    currency: "EUR",
    perUnit: "m2",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Legacy MAT-SPATE-PVC-LITERE: Forex 10 mm = 16 EUR/mp purchase, no markup. Waste not folded into unit cost.",
  },
  {
    resourceId: MAT_LED_MODULE_ID,
    amount: 0.5,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Default de dezvoltare din evidența owner 0,5 EUR/buc. De calibrat ulterior pe achiziția reală de atelier.",
  },
  {
    resourceId: MAT_LED_PSU_12V_60W_ID,
    amount: 12,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Default de dezvoltare din catalogul owner 12 EUR/buc. De calibrat ulterior.",
  },
  {
    resourceId: MAT_LED_PSU_12V_100W_ID,
    amount: 16,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Default de dezvoltare din catalogul owner 16 EUR/buc. De calibrat ulterior.",
  },
  {
    resourceId: MAT_LED_PSU_12V_160W_ID,
    amount: 20,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Default de dezvoltare din catalogul owner 20 EUR/buc. De calibrat ulterior.",
  },
  {
    resourceId: MAT_LED_PSU_12V_200W_ID,
    amount: 40,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Default de dezvoltare din catalogul owner 40 EUR/buc. De calibrat ulterior.",
  },
  {
    resourceId: MAT_VINYL_ORACAL_651_ID,
    amount: 9,
    currency: "EUR",
    perUnit: "m2",
    source: "LEGACY_EVIDENCE",
    classification: "DEVELOPMENT_DEFAULT",
    note: "Legacy owner-confirmed Oracal 651 purchase 9 EUR/m². Default de dezvoltare, de calibrat.",
  },
  {
    resourceId: SVC_CNC_FACE_ID,
    amount: 3,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed internal CNC face rate. 1,5 EUR/m × 2 passes on letter perimeter.",
  },
  {
    resourceId: SVC_CNC_BACK_ID,
    amount: 4.5,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed internal CNC back rate. 1,5 EUR/m × 3 passes on letter perimeter.",
  },
  {
    resourceId: LAB_VINYL_FACE_ID,
    amount: 5,
    currency: "EUR",
    perUnit: "m2",
    source: "LEGACY_EVIDENCE",
    classification: "DEVELOPMENT_DEFAULT",
    note: "Legacy FACE_VINYL_APPLICATION_LABOR 5 EUR/m². Nu este costul foliei.",
  },
  {
    resourceId: LAB_VINYL_VOLUME_ID,
    amount: 1,
    currency: "EUR",
    perUnit: "m",
    source: "LEGACY_EVIDENCE",
    classification: "DEVELOPMENT_DEFAULT",
    note: "Legacy RETURN_CANT_VINYL_APPLICATION_LABOR 1 EUR/ml. Nu este costul foliei.",
  },
  {
    resourceId: LAB_BOND_LETTER_BODY_ID,
    amount: 5,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed internal face–volume bonding rate.",
  },
  {
    resourceId: LAB_CLOSE_LETTER_BODY_ID,
    amount: 2,
    currency: "EUR",
    perUnit: "m",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed internal body-closure rate. Distinct from bonding.",
  },
  {
    resourceId: SVC_PLACE_LED_MODULES_ID,
    amount: 0.05,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed LED installation service. Not the module material price.",
  },
  {
    resourceId: SVC_ELECTRICAL_FINISH_ID,
    amount: 2,
    currency: "EUR",
    perUnit: "buc",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed electrical finish per product. Covers wiring, PSU and ignition test.",
  },
  {
    resourceId: SVC_PAINT_RAL_ID,
    amount: 4,
    currency: "EUR",
    perUnit: "m",
    source: "LEGACY_EVIDENCE",
    classification: "DEVELOPMENT_DEFAULT",
    note: "Legacy generic PAINTING 4 EUR/ml după asamblare. Doar când volumul este vopsit.",
  },
  {
    resourceId: SVC_PACK_PRODUCT_ID,
    amount: 10,
    currency: "EUR",
    perUnit: "m2",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Owner-confirmed packing rate on confirmed face area.",
  },
  {
    resourceId: ACM_3MM_ID,
    amount: 32,
    currency: "EUR",
    perUnit: "m2",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development purchase rate for ACM 3 mm PE-core sheet. Bounded between typical 28–40 EUR/m² workshop quotes. Replace with the current supplier invoice. Not nesting and not owner-confirmed.",
  },
  {
    resourceId: STEEL_FRAME_PROFILE_ID,
    amount: 3.5,
    currency: "EUR",
    perUnit: "m",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development purchase rate for internal steel frame profile, priced on frame perimeter. Replace with the current steel-profile purchase. Not an area rate and not owner-confirmed.",
  },
  {
    resourceId: SVC_CNC_SHEET_PANEL_ID,
    amount: 18,
    currency: "EUR",
    perUnit: "m2",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development CNC rate on developed blank area. Covers outer contour plus V-groove on the existing CNC 4020. Not the LETTERS perimeter 2-pass/3-pass rate. Replace with workshop calibration. Not owner-confirmed.",
  },
  {
    resourceId: SVC_CUT_METAL_STOCK_ID,
    amount: 2,
    currency: "EUR",
    perUnit: "m",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development metal-stock cutting rate on frame perimeter. Replace with the workshop metal-cutting rate. Not owner-confirmed.",
  },
  {
    resourceId: LAB_FORM_SHEET_CASSETTE_ID,
    amount: 8,
    currency: "EUR",
    perUnit: "buc",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development per-product labor for manual fold/deburr after CNC V-groove. foldCount is workshop truth, not a V1 quantity driver. No bending machine. Replace with labor calibration. Not owner-confirmed.",
  },
  {
    resourceId: LAB_ATTACH_INTERNAL_FRAME_ID,
    amount: 12,
    currency: "EUR",
    perUnit: "buc",
    source: "AI_DECISION",
    classification: "AI_DECISION",
    note: "AI development per-product labor for attaching the internal steel frame. Replace with labor calibration. Not owner-confirmed.",
  },
];

export function getMaterialFamily(id: string): MaterialFamily | undefined {
  return materialFamilies.find((item) => item.id === id);
}

export function getResource(id: string): ResourceDefinition | undefined {
  return resourceCatalog.find((item) => item.id === id);
}

export function listCostEvidenceFrom(
  rows: readonly CostEvidence[],
  resourceId: string,
): readonly CostEvidence[] {
  return rows.filter((item) => item.resourceId === resourceId);
}

export function lookupCostEvidence(
  rows: readonly CostEvidence[],
  resourceId: string,
  when?: CostEvidenceWhen,
): CostEvidence | undefined {
  const resourceRows = listCostEvidenceFrom(rows, resourceId);
  const qualified = resourceRows.filter((item) => item.when?.volumeDepthMm !== undefined);
  const unqualified = resourceRows.filter((item) => item.when?.volumeDepthMm === undefined);
  if (when?.volumeDepthMm !== undefined) {
    return (
      qualified.find((item) => item.when?.volumeDepthMm === when.volumeDepthMm) ??
      unqualified[0]
    );
  }
  return unqualified[0];
}

export function listCostEvidence(resourceId: string): readonly CostEvidence[] {
  return listCostEvidenceFrom(costEvidence, resourceId);
}

export function getCostEvidence(
  resourceId: string,
  when?: CostEvidenceWhen,
): CostEvidence | undefined {
  return lookupCostEvidence(costEvidence, resourceId, when);
}

export function ownerConfirmedCostSource(kind: ResourceKind): CostEvidence["source"] {
  switch (kind) {
    case "MATERIAL":
      return "OWNER_CONFIRMED_PURCHASE";
    case "SERVICE":
    case "LABOR":
      return "OWNER_CONFIRMED_WORKSHOP";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function isValidCostAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

export function listMaterialSpecifications(
  familyId: MaterialFamilyId,
): ResourceDefinition[] {
  return resourceCatalog.filter(
    (item) => item.kind === "MATERIAL" && item.familyId === familyId,
  );
}

export function listServiceResources(): ResourceDefinition[] {
  return resourceCatalog.filter((item) => item.kind === "SERVICE");
}

export function listLaborResources(): ResourceDefinition[] {
  return resourceCatalog.filter((item) => item.kind === "LABOR");
}

export type PsuCapacityEntry = {
  resourceId: string;
  label: string;
  capacityW: number;
  voltageV: number;
};

export function listPsuCapacityCatalog(): readonly PsuCapacityEntry[] {
  return resourceCatalog.flatMap((item) => {
    const capacityW = item.electrical?.capacityW;
    if (capacityW === undefined || item.electrical === undefined) {
      return [];
    }
    return [
      {
        resourceId: item.id,
        label: item.label,
        capacityW,
        voltageV: item.electrical.voltageV,
      },
    ];
  });
}

export function matchMaterialSpecification(
  familyId: MaterialFamilyId,
  query: {
    thicknessMm?: number;
    opticalType?: "opal";
    form?: MaterialForm;
  },
): ResourceDefinition | undefined {
  return matchMaterialSpecificationIn(resourceCatalog, familyId, query);
}

export function matchMaterialSpecificationIn(
  catalog: readonly ResourceDefinition[],
  familyId: MaterialFamilyId,
  query: {
    thicknessMm?: number;
    opticalType?: "opal";
    form?: MaterialForm;
  },
): ResourceDefinition | undefined {
  return catalog.find((item) => {
    if (item.kind !== "MATERIAL" || item.familyId !== familyId) {
      return false;
    }
    const spec = item.specification;
    if (!spec) {
      return false;
    }
    if (query.thicknessMm !== undefined && spec.thicknessMm !== query.thicknessMm) {
      return false;
    }
    if (query.opticalType !== undefined && spec.opticalType !== query.opticalType) {
      return false;
    }
    if (query.form !== undefined && spec.form !== query.form) {
      return false;
    }
    return true;
  });
}

export function resourceKindLabel(kind: ResourceKind): string {
  switch (kind) {
    case "MATERIAL":
      return "Material";
    case "SERVICE":
      return "Serviciu";
    case "LABOR":
      return "Manoperă";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function resourceUnitLabel(unit: ResourceUnit): string {
  switch (unit) {
    case "m":
      return "m";
    case "m2":
      return "m²";
    case "buc":
      return "buc";
    case "person_hour":
      return "ore-persoană";
    case "job":
      return "lucrare";
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function costSourceLabel(source: CostEvidence["source"]): string {
  switch (source) {
    case "PILOT_INTERNAL_EVIDENCE":
      return "Evidență internă de pilot";
    case "OWNER_CONFIRMED_PURCHASE":
      return "Achiziție confirmată de owner";
    case "OWNER_CONFIRMED_WORKSHOP":
      return "Tarif intern confirmat de owner";
    case "LEGACY_EVIDENCE":
      return "Evidență legacy";
    case "AI_DECISION":
      return "Decizie AI / default de dezvoltare";
    case "PLATFORM_DEFAULT":
      return "Valoare implicită de platformă";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function costClassificationLabel(
  classification: CostEvidence["classification"],
): string {
  switch (classification) {
    case "AI_DECISION":
      return "Decizie AI / pilot";
    case "OWNER_CONFIRMED":
      return "Confirmat de owner";
    case "DEVELOPMENT_DEFAULT":
      return "Default de dezvoltare";
    default: {
      const _exhaustive: never = classification;
      return _exhaustive;
    }
  }
}
