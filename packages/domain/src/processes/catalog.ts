import type { ComponentTypeId } from "../product/types.js";
import { RETURN_CANT_FORMING_ID } from "../resources/catalog.js";

export const PROCESS_CATEGORIES = [
  "CUTTING",
  "FORMING",
  "WELDING",
  "PRINTING",
  "FINISHING",
  "ASSEMBLY",
  "ELECTRICAL",
  "QUALITY_CONTROL",
  "PACKING",
] as const;
export type ProcessCategory = (typeof PROCESS_CATEGORIES)[number];

export const PROCESS_LIFECYCLES = ["ACTIVE", "PLANNED", "RETIRED"] as const;
export type ProcessLifecycle = (typeof PROCESS_LIFECYCLES)[number];

export const PROCESS_READINESS = [
  "IMPLEMENTED_PROCESS_FOUNDATION",
  "KNOWN_PROCESS",
  "PLANNED",
  "BLOCKED",
] as const;
export type ProcessReadiness = (typeof PROCESS_READINESS)[number];

export const PRODUCTION_CAPABILITY_CLASS_IDS = [
  "CNC_ROUTING",
  "PROFILE_FORMING",
  "MANUAL_ASSEMBLY",
  "VINYL_APPLICATION",
  "ELECTRICAL_ASSEMBLY",
  "PAINTING",
  "QUALITY_CONTROL",
  "PACKAGING",
  "WELD_STEEL",
  "WELD_ALUMINIUM",
  "METAL_CUTTING",
  "PRINTING",
  "LAMINATION",
  "LASER_CUTTING",
  "STYRO_CUTTING",
  "RIGID_FILM_LAMINATION",
  "PLOTTER_CUTTING",
] as const;
export type ProductionCapabilityClassId =
  (typeof PRODUCTION_CAPABILITY_CLASS_IDS)[number];

export const PRODUCTION_CAPABILITY_KINDS = [
  "MACHINE",
  "WORKSTATION",
  "HUMAN_SKILL",
] as const;
export type ProductionCapabilityKind = (typeof PRODUCTION_CAPABILITY_KINDS)[number];

export const PROVIDER_REQUIREMENTS = ["REQUIRED", "NOT_REQUIRED"] as const;
export type ProviderRequirement = (typeof PROVIDER_REQUIREMENTS)[number];

export type ProductionCapabilityClass = {
  id: ProductionCapabilityClassId;
  label: string;
  description: string;
  kind: ProductionCapabilityKind;
};

export type OperationalProcess = {
  id: string;
  label: string;
  description: string;
  category: ProcessCategory;
  requiredCapabilityId: ProductionCapabilityClassId;
  applicableTypeIds: readonly ComponentTypeId[];
  outcome: string;
  resourceIds: readonly string[];
  lifecycle: ProcessLifecycle;
  readiness: ProcessReadiness;
  readinessNote: string;
  providerRequirement?: ProviderRequirement;
};

export const CUT_SHEET_CNC_ID = "CUT_SHEET_CNC";
export const FORM_ALUMINIUM_PROFILE_ID = "FORM_ALUMINIUM_PROFILE";
export const APPLY_SURFACE_FINISH_ID = "APPLY_SURFACE_FINISH";
export const BOND_LETTER_BODY_ID = "BOND_LETTER_BODY";
export const PLACE_LED_MODULES_ID = "PLACE_LED_MODULES";
export const PAINT_RAL_ID = "PAINT_RAL";
export const WIRE_LIGHTING_ID = "WIRE_LIGHTING";
export const INSTALL_OR_CONNECT_PSU_ID = "INSTALL_OR_CONNECT_PSU";
export const TEST_LIGHTING_IGNITION_ID = "TEST_LIGHTING_IGNITION";
export const CLOSE_LETTER_BODY_ID = "CLOSE_LETTER_BODY";
export const TEST_ILLUMINATION_UNIFORMITY_ID = "TEST_ILLUMINATION_UNIFORMITY";
export const INSPECT_FINISHED_LETTER_ID = "INSPECT_FINISHED_LETTER";
export const PACK_PRODUCT_ID = "PACK_PRODUCT";
export const ATTACH_INTERNAL_FRAME_ID = "ATTACH_INTERNAL_FRAME";
export const FORM_SHEET_CASSETTE_ID = "FORM_SHEET_CASSETTE";
export const WELD_STEEL_JOIN_ID = "WELD_STEEL_JOIN";
export const WELD_ALUMINIUM_JOIN_ID = "WELD_ALUMINIUM_JOIN";
export const CUT_METAL_STOCK_ID = "CUT_METAL_STOCK";
export const PRINT_WIDE_FORMAT_ID = "PRINT_WIDE_FORMAT";
export const LAMINATE_WIDE_FORMAT_ID = "LAMINATE_WIDE_FORMAT";
export const LAMINATE_RIGID_PLATE_ID = "LAMINATE_RIGID_PLATE";
export const CUT_CONTOUR_PLOTTER_ID = "CUT_CONTOUR_PLOTTER";
export const CUT_LASER_SHEET_ID = "CUT_LASER_SHEET";
export const CUT_STYROFOAM_ID = "CUT_STYROFOAM";

export const productionCapabilityClasses: readonly ProductionCapabilityClass[] = [
  {
    id: "CNC_ROUTING",
    label: "Debitare CNC",
    description: "Stație/utilaj care debitează foi. Nu este un utilaj concret.",
    kind: "MACHINE",
  },
  {
    id: "PROFILE_FORMING",
    label: "Formare profil",
    description: "Stație/utilaj care formează profilul de aluminiu. Nu este un utilaj concret.",
    kind: "MACHINE",
  },
  {
    id: "MANUAL_ASSEMBLY",
    label: "Asamblare manuală",
    description: "Capabilitate de atelier / îndemânare umană. Nu este un angajat.",
    kind: "HUMAN_SKILL",
  },
  {
    id: "VINYL_APPLICATION",
    label: "Aplicare folie",
    description: "Capabilitate de aplicare finisaj. Nu este un angajat.",
    kind: "HUMAN_SKILL",
  },
  {
    id: "ELECTRICAL_ASSEMBLY",
    label: "Asamblare electrică",
    description: "Post de lucru pentru montaj electric. Nu este un utilaj concret.",
    kind: "WORKSTATION",
  },
  {
    id: "PAINTING",
    label: "Vopsire",
    description: "Post de vopsire RAL. Nu este o cabină sau un pistol concret.",
    kind: "WORKSTATION",
  },
  {
    id: "QUALITY_CONTROL",
    label: "Control calitate",
    description: "Capabilitate de verificare. Nu este un angajat.",
    kind: "HUMAN_SKILL",
  },
  {
    id: "PACKAGING",
    label: "Ambalare",
    description: "Post de ambalare. Nu este un utilaj concret.",
    kind: "WORKSTATION",
  },
  {
    id: "WELD_STEEL",
    label: "Sudură oțel",
    description:
      "Eligibilitate tehnică pentru sudură oțel. Nu este sudură aluminiu și nu este un aparat concret.",
    kind: "MACHINE",
  },
  {
    id: "WELD_ALUMINIUM",
    label: "Sudură aluminiu",
    description:
      "Eligibilitate tehnică pentru sudură aluminiu. Nu este sudură oțel și nu este un aparat concret.",
    kind: "MACHINE",
  },
  {
    id: "METAL_CUTTING",
    label: "Debitare metale",
    description: "Eligibilitate de debitare metale. Nu este debitare CNC de foi.",
    kind: "MACHINE",
  },
  {
    id: "PRINTING",
    label: "Print format mare",
    description: "Eligibilitate de print. Nu este un model de imprimantă.",
    kind: "MACHINE",
  },
  {
    id: "LAMINATION",
    label: "Laminare",
    description: "Eligibilitate de laminare. Nu este aplicare manuală de colant.",
    kind: "MACHINE",
  },
  {
    id: "LASER_CUTTING",
    label: "Debitare laser",
    description: "Eligibilitate de debitare laser. Nu este debitare CNC de foi.",
    kind: "MACHINE",
  },
  {
    id: "STYRO_CUTTING",
    label: "Debitare polistiren",
    description: "Eligibilitate de debitare polistiren. Nu este debitare CNC de foi.",
    kind: "MACHINE",
  },
  {
    id: "RIGID_FILM_LAMINATION",
    label: "Laminare folie pe plăci rigide",
    description:
      "Eligibilitate de aplicare folie pe plăci rigide. Nu înlocuiește aplicarea manuală de colant pe litere.",
    kind: "MACHINE",
  },
  {
    id: "PLOTTER_CUTTING",
    label: "Decupare plotter",
    description: "Eligibilitate de decupare contur / vinyl pe plotter. Nu este debitare CNC.",
    kind: "MACHINE",
  },
];

export const operationalProcesses: readonly OperationalProcess[] = [
  {
    id: CUT_SHEET_CNC_ID,
    label: "Debitare foaie CNC",
    description:
      "Debitare CNC a foii. Același proces servește față Plexiglas, spate Forex și casetă ACM. Fără model de utilaj.",
    category: "CUTTING",
    requiredCapabilityId: "CNC_ROUTING",
    applicableTypeIds: ["PLEXIGLAS_FACE", "FOREX_BACK", "ACM_CASSETTE_BODY"],
    outcome: "Geometrie debitată",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Cunoscut din golurile actuale de debitare CNC. Fără preț CNC și fără geometrie de debitare în acest build.",
  },
  {
    id: FORM_ALUMINIUM_PROFILE_ID,
    label: "Formare profil aluminiu",
    description:
      "Cum se formează profilul de volum. Consumă evidența de cost a serviciului, dar nu este rândul de preț.",
    category: "FORMING",
    requiredCapabilityId: "PROFILE_FORMING",
    applicableTypeIds: ["ALUMINIUM_VOLUME"],
    outcome: "Profil de aluminiu format",
    resourceIds: [RETURN_CANT_FORMING_ID],
    lifecycle: "ACTIVE",
    readiness: "IMPLEMENTED_PROCESS_FOUNDATION",
    readinessNote:
      "Identitate de proces stabilă, legată de serviciul return_cant_forming. Fără execuție și fără utilaj concret.",
  },
  {
    id: APPLY_SURFACE_FINISH_ID,
    label: "Aplicare folie",
    description:
      "Aplicare de folie/colant. Nu este vopsire. Reutilizabil pe față și volum când finisajul este colantat.",
    category: "FINISHING",
    requiredCapabilityId: "VINYL_APPLICATION",
    applicableTypeIds: ["PLEXIGLAS_FACE", "ALUMINIUM_VOLUME"],
    outcome: "Suprafață colantată",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote:
      "Doar colant. Vopsirea RAL este procesul PAINT_RAL, după asamblare.",
  },
  {
    id: BOND_LETTER_BODY_ID,
    label: "Lipire față-volum",
    description:
      "Lipire față de volum format. Adezivul (cianoacrilat + activator) este detaliu de lucru, nu identitate de proces și nu stoc.",
    category: "ASSEMBLY",
    requiredCapabilityId: "MANUAL_ASSEMBLY",
    applicableTypeIds: ["PLEXIGLAS_FACE", "ALUMINIUM_VOLUME"],
    outcome: "Corp de literă asamblat",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Identitate de proces manual. Fără rețetă de labor și fără Pontaj.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: PLACE_LED_MODULES_ID,
    label: "Montare module LED",
    description:
      "Montaj module LED pe spate/interior. Bandă + adeziv/activator sunt detaliu de prindere, nu un proces separat de lipire.",
    category: "ELECTRICAL",
    requiredCapabilityId: "ELECTRICAL_ASSEMBLY",
    applicableTypeIds: ["LIGHTING_FRONT_LED"],
    outcome: "Module LED montate",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Proces cunoscut. Cantitatea de module se calculează din perimetrul de volum. Fără rețetă de labor.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: PAINT_RAL_ID,
    label: "Vopsire RAL",
    description:
      "Vopsire volum după asamblare: mascare față, vopsire, uscare, demascare. Nu este aplicare de folie.",
    category: "FINISHING",
    requiredCapabilityId: "PAINTING",
    applicableTypeIds: ["ALUMINIUM_VOLUME"],
    outcome: "Volum vopsit RAL, față protejată și curată",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote:
      "Traseu cunoscut. Fără material de vopsea și fără rețetă de cost în acest build.",
  },
  {
    id: WIRE_LIGHTING_ID,
    label: "Cablare electrică",
    description:
      "Cablare locală după montarea modulelor. Nu calculează numărul de LED și nu este montarea sursei.",
    category: "ELECTRICAL",
    requiredCapabilityId: "ELECTRICAL_ASSEMBLY",
    applicableTypeIds: ["LIGHTING_FRONT_LED"],
    outcome: "Cablaj local pregătit pentru probă",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Proces cunoscut. Fără rețetă de labor.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: INSTALL_OR_CONNECT_PSU_ID,
    label: "Pregătire sursă de alimentare",
    description:
      "Conectare/pregătire PSU pentru probă și livrare în colet. Nu montează o sursă pe literă și nu decide puterea.",
    category: "ELECTRICAL",
    requiredCapabilityId: "ELECTRICAL_ASSEMBLY",
    applicableTypeIds: ["LIGHTING_FRONT_LED"],
    outcome: "Sursă pregătită pentru probă și colet",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Proces cunoscut. Selecția sursei se calculează din catalogul 12V. Fără rețetă de labor.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: TEST_LIGHTING_IGNITION_ID,
    label: "Probă aprindere",
    description:
      "Probă electrică de aprindere, înainte de închiderea corpului. Nu este controlul de uniformitate.",
    category: "ELECTRICAL",
    requiredCapabilityId: "ELECTRICAL_ASSEMBLY",
    applicableTypeIds: ["LIGHTING_FRONT_LED"],
    outcome: "Aprindere verificată cu acces în corp",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Proces cunoscut. Fără telemetrie de măsură.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: CLOSE_LETTER_BODY_ID,
    label: "Închidere corp",
    description:
      "Prindere mecanică demontabilă a spatelui de corp. Nu este lipire permanentă a spatelui.",
    category: "ASSEMBLY",
    requiredCapabilityId: "MANUAL_ASSEMBLY",
    applicableTypeIds: ["FOREX_BACK"],
    outcome: "Corp închis, accesibil ulterior prin demontare",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Fără SKU de șurub și fără stoc în acest build.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: TEST_ILLUMINATION_UNIFORMITY_ID,
    label: "Probă uniformitate",
    description:
      "Verificare vizuală a iluminării după închiderea corpului. Nu este proba de aprindere.",
    category: "QUALITY_CONTROL",
    requiredCapabilityId: "QUALITY_CONTROL",
    applicableTypeIds: ["LIGHTING_FRONT_LED"],
    outcome: "Uniformitate vizuală verificată",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Proces cunoscut. Fără măsurători instrumentale.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: INSPECT_FINISHED_LETTER_ID,
    label: "Control calitate final",
    description:
      "Verificare vizuală a corpului, finisajului și închiderii înainte de ambalare.",
    category: "QUALITY_CONTROL",
    requiredCapabilityId: "QUALITY_CONTROL",
    applicableTypeIds: [],
    outcome: "Produs acceptat vizual",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Nu este un QC generic fără rezultat.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: PACK_PRODUCT_ID,
    label: "Ambalare",
    description:
      "Ambalare după controlul final. Sursa de alimentare, dacă e cazul, pleacă în colet.",
    category: "PACKING",
    requiredCapabilityId: "PACKAGING",
    applicableTypeIds: [],
    outcome: "Produs ambalat pentru predare",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "PLANNED",
    readinessNote: "Fără material de ambalare și fără tarif în acest build.",
    providerRequirement: "NOT_REQUIRED",
  },
  {
    id: ATTACH_INTERNAL_FRAME_ID,
    label: "Prindere cadru intern",
    description:
      "Prindere cadru metalic intern de corpul casetat. Nu este lipire față-volum de literă.",
    category: "ASSEMBLY",
    requiredCapabilityId: "MANUAL_ASSEMBLY",
    applicableTypeIds: ["ACM_CASSETTE_BODY", "STEEL_INTERNAL_FRAME"],
    outcome: "Cadru intern prins de casetă",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Proces de atelier cunoscut. Fără rețetă de labor și fără tarif de prindere.",
  },
  {
    id: FORM_SHEET_CASSETTE_ID,
    label: "Formare casetă din foaie",
    description:
      "Îndoire/debavurare manuală a casetei după V-groove CNC. Nu este formare de profil aluminiu și nu este un utilaj de îndoit.",
    category: "FORMING",
    requiredCapabilityId: "MANUAL_ASSEMBLY",
    applicableTypeIds: ["ACM_CASSETTE_BODY"],
    outcome: "Casetă formată din foaia debitată",
    resourceIds: [],
    lifecycle: "PLANNED",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Lucru manual după CNC. V-groove rămâne în debitarea CNC. Fără mașină de îndoit.",
  },
  {
    id: WELD_STEEL_JOIN_ID,
    label: "Îmbinare sudură oțel",
    description:
      "Îmbinare prin sudură oțel. Nu este sudură aluminiu și nu este un aparat concret.",
    category: "WELDING",
    requiredCapabilityId: "WELD_STEEL",
    applicableTypeIds: [],
    outcome: "Îmbinare oțel sudată",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Operație de atelier cunoscută. Nu este cerută de Letters. Fără rețetă de cost.",
  },
  {
    id: WELD_ALUMINIUM_JOIN_ID,
    label: "Îmbinare sudură aluminiu",
    description:
      "Îmbinare prin sudură aluminiu. Nu este sudură oțel și nu este un aparat concret.",
    category: "WELDING",
    requiredCapabilityId: "WELD_ALUMINIUM",
    applicableTypeIds: [],
    outcome: "Îmbinare aluminiu sudată",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Operație de atelier cunoscută. Nu este cerută de Letters. Fără rețetă de cost.",
  },
  {
    id: CUT_METAL_STOCK_ID,
    label: "Debitare semifabricat metalic",
    description:
      "Debitare de semifabricat metalic. Nu este debitare CNC de foi și nu este sudură.",
    category: "CUTTING",
    requiredCapabilityId: "METAL_CUTTING",
    applicableTypeIds: ["STEEL_INTERNAL_FRAME"],
    outcome: "Semifabricat metalic debitat",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Operație de atelier cunoscută. Fără dimensiune de masă, fără grosime-limită și fără tarif.",
  },
  {
    id: PRINT_WIDE_FORMAT_ID,
    label: "Printare format mare",
    description:
      "Print de format mare. Nu este materialul de print și nu este laminarea.",
    category: "PRINTING",
    requiredCapabilityId: "PRINTING",
    applicableTypeIds: [],
    outcome: "Suport printat",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote: "Operație de atelier cunoscută. Fără rețetă de print și fără cerere Letters.",
  },
  {
    id: LAMINATE_WIDE_FORMAT_ID,
    label: "Laminare print",
    description:
      "Laminare de media printată. Nu este aplicare de colant pe litere și nu este laminare pe plăci rigide.",
    category: "PRINTING",
    requiredCapabilityId: "LAMINATION",
    applicableTypeIds: [],
    outcome: "Print laminat",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote: "Operație de atelier cunoscută. Fără rețetă de laminare.",
  },
  {
    id: LAMINATE_RIGID_PLATE_ID,
    label: "Aplicare folie pe plăci rigide",
    description:
      "Aplicare de folie pe plăci rigide. Nu înlocuiește aplicarea manuală de colant pe litere.",
    category: "FINISHING",
    requiredCapabilityId: "RIGID_FILM_LAMINATION",
    applicableTypeIds: [],
    outcome: "Placă rigidă cu folie aplicată",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote:
      "Operație de atelier cunoscută. Distinctă de APPLY_SURFACE_FINISH. Fără rețetă.",
  },
  {
    id: CUT_CONTOUR_PLOTTER_ID,
    label: "Decupare contur plotter",
    description:
      "Decupare contur / vinyl pe plotter. Nu este aplicarea foliei și nu este debitare CNC.",
    category: "CUTTING",
    requiredCapabilityId: "PLOTTER_CUTTING",
    applicableTypeIds: [],
    outcome: "Contur decupat pe plotter",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote: "Operație de atelier cunoscută. Distinctă de aplicarea de colant.",
  },
  {
    id: CUT_LASER_SHEET_ID,
    label: "Debitare foaie laser",
    description: "Debitare laser. Nu este debitare CNC de foi și nu este debitare metale.",
    category: "CUTTING",
    requiredCapabilityId: "LASER_CUTTING",
    applicableTypeIds: [],
    outcome: "Geometrie debitată laser",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote: "Operație de atelier cunoscută. Fără matrice de materiale și fără tarif.",
  },
  {
    id: CUT_STYROFOAM_ID,
    label: "Debitare bloc polistiren",
    description:
      "Debitare polistiren. Nu este debitare CNC de foi și nu este debitare metale.",
    category: "CUTTING",
    requiredCapabilityId: "STYRO_CUTTING",
    applicableTypeIds: [],
    outcome: "Polistiren debitat",
    resourceIds: [],
    lifecycle: "ACTIVE",
    readiness: "KNOWN_PROCESS",
    readinessNote: "Operație de atelier cunoscută. Fără cerere Letters și fără tarif.",
  },
];

export function getProductionCapability(
  id: string,
): ProductionCapabilityClass | undefined {
  return productionCapabilityClasses.find((item) => item.id === id);
}

export function getOperationalProcess(id: string): OperationalProcess | undefined {
  return operationalProcesses.find((item) => item.id === id);
}

export function processProviderRequirement(
  process: Pick<OperationalProcess, "providerRequirement"> | undefined,
): ProviderRequirement {
  return process?.providerRequirement ?? "REQUIRED";
}

export function frozenProviderRequirement(
  value: ProviderRequirement | undefined,
): ProviderRequirement {
  return value ?? "REQUIRED";
}

export function providerRequirementLabel(requirement: ProviderRequirement): string {
  switch (requirement) {
    case "REQUIRED":
      return "Necesită utilaj dedicat";
    case "NOT_REQUIRED":
      return "Nu necesită utilaj dedicat";
    default: {
      const _exhaustive: never = requirement;
      return _exhaustive;
    }
  }
}

export function processesForType(typeId: ComponentTypeId): OperationalProcess[] {
  return operationalProcesses.filter((item) =>
    item.applicableTypeIds.includes(typeId),
  );
}

export function processesForCapability(
  capabilityId: ProductionCapabilityClassId,
): OperationalProcess[] {
  return operationalProcesses.filter(
    (item) => item.requiredCapabilityId === capabilityId,
  );
}

export function processesForCategory(category: ProcessCategory): OperationalProcess[] {
  return operationalProcesses.filter((item) => item.category === category);
}

export function processCategoryLabel(category: ProcessCategory): string {
  switch (category) {
    case "CUTTING":
      return "Debitare";
    case "FORMING":
      return "Formare";
    case "WELDING":
      return "Sudură";
    case "PRINTING":
      return "Print / finisare";
    case "FINISHING":
      return "Finisare";
    case "ASSEMBLY":
      return "Asamblare";
    case "ELECTRICAL":
      return "Electric";
    case "QUALITY_CONTROL":
      return "Control calitate";
    case "PACKING":
      return "Ambalare";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function processLifecycleLabel(lifecycle: ProcessLifecycle): string {
  switch (lifecycle) {
    case "ACTIVE":
      return "Activ";
    case "PLANNED":
      return "Planificat";
    case "RETIRED":
      return "Retras";
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

export function processReadinessLabel(readiness: ProcessReadiness): string {
  switch (readiness) {
    case "IMPLEMENTED_PROCESS_FOUNDATION":
      return "Fundație de proces";
    case "KNOWN_PROCESS":
      return "Proces cunoscut";
    case "PLANNED":
      return "Planificat";
    case "BLOCKED":
      return "Blocat";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

export function productionCapabilityKindLabel(
  kind: ProductionCapabilityKind,
): string {
  switch (kind) {
    case "MACHINE":
      return "Utilaj / stație de mașină";
    case "WORKSTATION":
      return "Post de lucru";
    case "HUMAN_SKILL":
      return "Îndemânare umană";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
