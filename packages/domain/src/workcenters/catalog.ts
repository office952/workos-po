import {
  PRODUCTION_CAPABILITY_CLASS_IDS,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";

export const PROVIDER_KINDS = ["WORKCENTER", "MACHINE"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_LIFECYCLES = ["ACTIVE", "PLANNED", "RETIRED"] as const;
export type ProviderLifecycle = (typeof PROVIDER_LIFECYCLES)[number];

export const PROVIDER_COVERAGE_STATUSES = [
  "COVERED",
  "PROVIDER_PLANNED",
  "NO_PROVIDER",
] as const;
export type ProviderCoverageStatus = (typeof PROVIDER_COVERAGE_STATUSES)[number];

export type Workcenter = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly lifecycle: ProviderLifecycle;
  readonly capabilityIds: readonly ProductionCapabilityClassId[];
  readonly legacyEvidenceIds?: readonly string[];
};

export type Machine = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly workcenterId: string | null;
  readonly lifecycle: ProviderLifecycle;
  readonly capabilityIds: readonly ProductionCapabilityClassId[];
  readonly legacyEvidenceIds?: readonly string[];
};

export type CapabilityProvider = {
  readonly kind: ProviderKind;
  readonly id: string;
  readonly label: string;
  readonly lifecycle: ProviderLifecycle;
  readonly capabilityIds: readonly ProductionCapabilityClassId[];
};

export type WorkcenterRegistry = {
  readonly workcenters: readonly Workcenter[];
  readonly machines: readonly Machine[];
  getWorkcenter(id: string): Workcenter | undefined;
  getMachine(id: string): Machine | undefined;
};

export function createWorkcenterRegistry(
  workcenters: readonly Workcenter[],
  machines: readonly Machine[],
): WorkcenterRegistry {
  const workcenterIds = new Set<string>();
  for (const workcenter of workcenters) {
    validateIdentity(workcenter.id, "workcenter");
    if (workcenterIds.has(workcenter.id)) {
      throw new Error(`Duplicate workcenter: ${workcenter.id}`);
    }
    workcenterIds.add(workcenter.id);
    validateCapabilities(workcenter.capabilityIds, workcenter.id);
  }

  const machineIds = new Set<string>();
  for (const machine of machines) {
    validateIdentity(machine.id, "machine");
    if (machineIds.has(machine.id)) {
      throw new Error(`Duplicate machine: ${machine.id}`);
    }
    if (workcenterIds.has(machine.id)) {
      throw new Error(`Machine id collides with workcenter: ${machine.id}`);
    }
    machineIds.add(machine.id);
    validateCapabilities(machine.capabilityIds, machine.id);
    if (machine.workcenterId && !workcenterIds.has(machine.workcenterId)) {
      throw new Error(`Unknown workcenter ${machine.workcenterId} for ${machine.id}`);
    }
  }

  return {
    workcenters,
    machines,
    getWorkcenter(id) {
      return workcenters.find((item) => item.id === id);
    },
    getMachine(id) {
      return machines.find((item) => item.id === id);
    },
  };
}

export const WC_ASSEMBLY_01_ID = "WC_ASSEMBLY_01";
export const WC_ASSEMBLY_02_ID = "WC_ASSEMBLY_02";
export const WC_WELDING_ID = "WC_WELDING";
export const WC_METAL_CUTTING_ID = "WC_METAL_CUTTING";
export const WC_CNC_ROUTING_ID = "WC_CNC_ROUTING";
export const WC_LETTER_FORMING_ID = "WC_LETTER_FORMING";
export const WC_LED_ASSEMBLY_ID = "WC_LED_ASSEMBLY";
export const WC_PRINT_ID = "WC_PRINT";
export const WC_LAMINATE_ID = "WC_LAMINATE";
export const WC_LASER_CUTTING_ID = "WC_LASER_CUTTING";
export const WC_VINYL_APPLICATION_ID = "WC_VINYL_APPLICATION";
export const WC_CUT_ID = "WC_CUT";

export const MCH_CNC_4020_ID = "MCH-CNC-4020";
export const MCH_CNC_CANT_LITERE_ID = "MCH-CNC-CANT-LITERE";
export const MCH_WELD_STEEL_ID = "MCH-WELD-STEEL";
export const MCH_WELD_ALU_ID = "MCH-WELD-ALU";
export const MCH_METAL_CUTTER_AUTO_ID = "MCH-METAL-CUTTER-AUTO";
export const MCH_EPSON_60800_ID = "MCH-EPSON-60800";
export const MCH_LAMINATOR_XPRO_ID = "MCH-LAMINATOR-XPRO";
export const MCH_LASER_CNC_ID = "MCH-LASER-CNC";
export const MCH_STYRO_CUTTER_ID = "MCH-STYRO-CUTTER";
export const MCH_RIGID_FILM_LAMINATOR_ID = "MCH-RIGID-FILM-LAMINATOR";
export const MCH_CUTTER_PLOTTER_ID = "MCH-CUTTER-PLOTTER";

const ASSEMBLY_TABLE_DESCRIPTION =
  "Masă mare de asamblare. Zonă canonică de organizare, nu singurul loc din hală unde se poate lucra manual.";

export const workcenters: readonly Workcenter[] = [
  {
    id: WC_ASSEMBLY_01_ID,
    label: "Masă asamblare 1",
    description: ASSEMBLY_TABLE_DESCRIPTION,
    lifecycle: "ACTIVE",
    capabilityIds: ["MANUAL_ASSEMBLY"],
    legacyEvidenceIds: ["WA-ASSEMBLY-01"],
  },
  {
    id: WC_ASSEMBLY_02_ID,
    label: "Masă asamblare 2",
    description: ASSEMBLY_TABLE_DESCRIPTION,
    lifecycle: "ACTIVE",
    capabilityIds: ["MANUAL_ASSEMBLY"],
    legacyEvidenceIds: ["WA-ASSEMBLY-02"],
  },
  {
    id: WC_WELDING_ID,
    label: "Stație sudură",
    description:
      "Masă / stație dedicată de sudură, separată de mesele de asamblare. Aparatele de sudură stau aici. Masa de sudură din evidența anterioară este această zonă, nu un utilaj.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
    legacyEvidenceIds: ["WA-WELD-TABLE"],
  },
  {
    id: WC_METAL_CUTTING_ID,
    label: "Stație debitare metale",
    description:
      "Zonă de debitare metale, separată de stația de sudură. Utilajul concret de debitare este evidențiat separat.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_CNC_ROUTING_ID,
    label: "Zonă CNC",
    description:
      "Zonă de debitare CNC. Utilajul CNC și debitatorul de polistiren stau aici, cu eligibilități diferite.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_LETTER_FORMING_ID,
    label: "Zonă formare cant",
    description: "Zonă de formare profil / cant litere.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_LED_ASSEMBLY_ID,
    label: "Montaj LED / electric",
    description:
      "Post de asamblare electrică și montaj LED. Fără utilaj fictiv. Nu este o masă de asamblare generică.",
    lifecycle: "ACTIVE",
    capabilityIds: ["ELECTRICAL_ASSEMBLY"],
  },
  {
    id: WC_PRINT_ID,
    label: "Zonă print",
    description: "Zonă de print format mare.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_LAMINATE_ID,
    label: "Zonă laminare",
    description: "Zonă de laminare. Nu este aplicare manuală de colant.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_VINYL_APPLICATION_ID,
    label: "Zonă aplicare folie",
    description:
      "Zonă de aplicare folie / colant. Laminatorul de plăci rigide stă aici, cu o eligibilitate distinctă.",
    lifecycle: "ACTIVE",
    capabilityIds: ["VINYL_APPLICATION"],
  },
  {
    id: WC_CUT_ID,
    label: "Zonă decupare plotter",
    description: "Zonă de decupare contur / vinyl pe plotter.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
  {
    id: WC_LASER_CUTTING_ID,
    label: "Zonă laser",
    description: "Zonă de debitare laser.",
    lifecycle: "ACTIVE",
    capabilityIds: [],
  },
];

export const machines: readonly Machine[] = [
  {
    id: MCH_CNC_4020_ID,
    label: "CNC 4020",
    description: "Utilaj CNC de debitare foi. Masă 4000 x 2000 mm.",
    workcenterId: WC_CNC_ROUTING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["CNC_ROUTING"],
  },
  {
    id: MCH_STYRO_CUTTER_ID,
    label: "Debitator polistiren",
    description:
      "Utilaj de debitare polistiren din zona CNC. Nu debitează foi ca routerul CNC.",
    workcenterId: WC_CNC_ROUTING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["STYRO_CUTTING"],
  },
  {
    id: MCH_CNC_CANT_LITERE_ID,
    label: "CNC Cant Litere",
    description: "Utilaj de formare cant / profil aluminiu.",
    workcenterId: WC_LETTER_FORMING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["PROFILE_FORMING"],
  },
  {
    id: MCH_WELD_STEEL_ID,
    label: "Aparat sudură oțel",
    description: "Utilaj de sudură oțel. Nu sudează aluminiu.",
    workcenterId: WC_WELDING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["WELD_STEEL"],
  },
  {
    id: MCH_WELD_ALU_ID,
    label: "Aparat sudură aluminiu",
    description: "Utilaj de sudură aluminiu. Nu sudează oțel.",
    workcenterId: WC_WELDING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["WELD_ALUMINIUM"],
  },
  {
    id: MCH_METAL_CUTTER_AUTO_ID,
    label: "Debitator metale",
    description:
      "Debitator de metale cu masă automatizată. Dimensiunea mesei nu este confirmată ca specificație canonică.",
    workcenterId: WC_METAL_CUTTING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["METAL_CUTTING"],
  },
  {
    id: MCH_EPSON_60800_ID,
    label: "Imprimantă Epson",
    description: "Imprimantă de format mare.",
    workcenterId: WC_PRINT_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["PRINTING"],
  },
  {
    id: MCH_LAMINATOR_XPRO_ID,
    label: "Laminator",
    description: "Utilaj de laminare.",
    workcenterId: WC_LAMINATE_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["LAMINATION"],
  },
  {
    id: MCH_RIGID_FILM_LAMINATOR_ID,
    label: "Laminator plăci rigide",
    description:
      "Laminator pentru aplicare folie pe plăci rigide. Nu înlocuiește aplicarea manuală de colant pe litere.",
    workcenterId: WC_VINYL_APPLICATION_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["RIGID_FILM_LAMINATION"],
  },
  {
    id: MCH_CUTTER_PLOTTER_ID,
    label: "Cutter plotter",
    description: "Decupare contur / vinyl pe plotter.",
    workcenterId: WC_CUT_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["PLOTTER_CUTTING"],
  },
  {
    id: MCH_LASER_CNC_ID,
    label: "Laser CNC",
    description: "Utilaj de debitare laser.",
    workcenterId: WC_LASER_CUTTING_ID,
    lifecycle: "ACTIVE",
    capabilityIds: ["LASER_CUTTING"],
  },
];

export const workcenterRegistry = createWorkcenterRegistry(workcenters, machines);

export function providerLifecycleLabel(lifecycle: ProviderLifecycle): string {
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

export function providerKindLabel(kind: ProviderKind): string {
  switch (kind) {
    case "WORKCENTER":
      return "Zonă / stație";
    case "MACHINE":
      return "Utilaj";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function providerCoverageLabel(status: ProviderCoverageStatus): string {
  switch (status) {
    case "COVERED":
      return "Acoperită";
    case "PROVIDER_PLANNED":
      return "Furnizor planificat";
    case "NO_PROVIDER":
      return "Fără furnizor";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function validateIdentity(id: string, kind: "workcenter" | "machine"): void {
  if (id.trim().length === 0) {
    throw new Error(`${kind} id is required`);
  }
}

function validateCapabilities(
  capabilityIds: readonly ProductionCapabilityClassId[],
  ownerId: string,
): void {
  const seen = new Set<string>();
  for (const capabilityId of capabilityIds) {
    if (!PRODUCTION_CAPABILITY_CLASS_IDS.includes(capabilityId)) {
      throw new Error(`Unknown capability ${capabilityId} on ${ownerId}`);
    }
    if (seen.has(capabilityId)) {
      throw new Error(`Duplicate capability ${capabilityId} on ${ownerId}`);
    }
    seen.add(capabilityId);
  }
}
