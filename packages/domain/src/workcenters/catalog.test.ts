import { describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  CUT_CONTOUR_PLOTTER_ID,
  CUT_LASER_SHEET_ID,
  CUT_METAL_STOCK_ID,
  CUT_SHEET_CNC_ID,
  CUT_STYROFOAM_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  LAMINATE_RIGID_PLATE_ID,
  LAMINATE_WIDE_FORMAT_ID,
  operationalProcesses,
  PAINT_RAL_ID,
  PRINT_WIDE_FORMAT_ID,
  WELD_ALUMINIUM_JOIN_ID,
  WELD_STEEL_JOIN_ID,
} from "../processes/catalog.js";
import { composeProductProcesses } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import { compileEic } from "../resources/eic.js";
import {
  MCH_CNC_4020_ID,
  MCH_CNC_CANT_LITERE_ID,
  MCH_METAL_CUTTER_AUTO_ID,
  MCH_WELD_ALU_ID,
  MCH_WELD_STEEL_ID,
  WC_ASSEMBLY_01_ID,
  WC_ASSEMBLY_02_ID,
  WC_CNC_ROUTING_ID,
  WC_LED_ASSEMBLY_ID,
  WC_LETTER_FORMING_ID,
  WC_METAL_CUTTING_ID,
  WC_VINYL_APPLICATION_ID,
  WC_WELDING_ID,
  createWorkcenterRegistry,
  machines,
  workcenterRegistry,
  workcenters,
  type Machine,
  type Workcenter,
} from "./catalog.js";
import { recipeGapForProcess } from "./recipeGap.js";
import { lettersCapabilityCoverage } from "./coverage.js";
import { projectWorkcentersAdministration } from "./projection.js";
import {
  coverageForCapability,
  providersForCapability,
  providersForProcess,
} from "./providers.js";

const fixtureWorkcenters: readonly Workcenter[] = [
  {
    id: "WC_CNC",
    label: "Zonă CNC (fixture)",
    description: "Fixture only. Not a live shop asset.",
    lifecycle: "ACTIVE",
    capabilityIds: ["CNC_ROUTING"],
  },
  {
    id: "WC_FIXTURE_ASSEMBLY",
    label: "Zonă asamblare (fixture)",
    description: "Manual work without a fake machine.",
    lifecycle: "ACTIVE",
    capabilityIds: ["MANUAL_ASSEMBLY"],
  },
  {
    id: "WC_FIXTURE_ASSEMBLY_ALT",
    label: "Zonă asamblare planificată (fixture)",
    description: "Second provider for the same capability.",
    lifecycle: "PLANNED",
    capabilityIds: ["MANUAL_ASSEMBLY"],
  },
  {
    id: "WC_PAINTING",
    label: "Zonă vopsire (fixture)",
    description: "Painting provided by a workcenter.",
    lifecycle: "ACTIVE",
    capabilityIds: ["PAINTING"],
  },
];

const fixtureMachines: readonly Machine[] = [
  {
    id: "M_CNC_PROFILE",
    label: "Utilaj CNC/profil (fixture)",
    description: "One machine, two capabilities. Fixture only.",
    workcenterId: "WC_CNC",
    lifecycle: "ACTIVE",
    capabilityIds: ["CNC_ROUTING", "PROFILE_FORMING"],
  },
];

const fixtureRegistry = createWorkcenterRegistry(fixtureWorkcenters, fixtureMachines);

describe("workcenter registry", () => {
  it("preserves the two owner-confirmed assembly workcenters unchanged", () => {
    const assembly = workcenters.filter(
      (item) => item.id === WC_ASSEMBLY_01_ID || item.id === WC_ASSEMBLY_02_ID,
    );
    expect(assembly.map((item) => item.id)).toEqual([
      WC_ASSEMBLY_01_ID,
      WC_ASSEMBLY_02_ID,
    ]);
    expect(assembly.every((item) => item.lifecycle === "ACTIVE")).toBe(true);
    expect(
      assembly.every(
        (item) =>
          item.label.startsWith("Masă asamblare") &&
          item.capabilityIds.length === 1 &&
          item.capabilityIds[0] === "MANUAL_ASSEMBLY",
      ),
    ).toBe(true);
    expect(assembly[0]?.label).toBe("Masă asamblare 1");
    expect(assembly[1]?.label).toBe("Masă asamblare 2");
    expect(workcenters.some((item) => item.id === "WC_ASSEMBLY")).toBe(false);
    expect(machines.some((item) => item.id.startsWith("WA-"))).toBe(false);
    expect(JSON.stringify(workcenters)).not.toMatch(
      /Infinity|unlimited|maxTasks|maxEmployees|taskConcurrency|employeeLimit/,
    );
  });

  it("keeps unique live identities and valid machine workcenter references", () => {
    const workcenterIds = workcenters.map((item) => item.id);
    const machineIds = machines.map((item) => item.id);
    expect(new Set(workcenterIds).size).toBe(workcenterIds.length);
    expect(new Set(machineIds).size).toBe(machineIds.length);
    expect(workcenterIds.some((id) => machineIds.includes(id))).toBe(false);
    expect(workcenters.every((item) => item.lifecycle === "ACTIVE")).toBe(true);
    expect(machines.every((item) => item.lifecycle === "ACTIVE")).toBe(true);
    expect(
      machines.every(
        (item) => item.workcenterId !== null && workcenterIds.includes(item.workcenterId),
      ),
    ).toBe(true);
    expect(workcenterRegistry.workcenters).toEqual(workcenters);
    expect(workcenterRegistry.machines).toEqual(machines);
  });

  it("rejects duplicate ids, unknown capabilities, and broken workcenter refs", () => {
    expect(() =>
      createWorkcenterRegistry(
        [
          {
            id: "WC_A",
            label: "A",
            description: "",
            lifecycle: "ACTIVE",
            capabilityIds: ["CNC_ROUTING"],
          },
          {
            id: "WC_A",
            label: "A2",
            description: "",
            lifecycle: "ACTIVE",
            capabilityIds: ["PAINTING"],
          },
        ],
        [],
      ),
    ).toThrow(/Duplicate workcenter/);
    expect(() =>
      createWorkcenterRegistry(
        [],
        [
          {
            id: "M_A",
            label: "A",
            description: "",
            workcenterId: "MISSING",
            lifecycle: "ACTIVE",
            capabilityIds: ["CNC_ROUTING"],
          },
        ],
      ),
    ).toThrow(/Unknown workcenter/);
    expect(() =>
      createWorkcenterRegistry(
        [
          {
            id: "WC_A",
            label: "A",
            description: "",
            lifecycle: "ACTIVE",
            capabilityIds: ["CNC_ROUTING", "CNC_ROUTING"],
          },
        ],
        [],
      ),
    ).toThrow(/Duplicate capability/);
  });
});

describe("capability providers", () => {
  it("derives providers from workcenters and machines without mutating processes", () => {
    expect(providersForProcess(CUT_SHEET_CNC_ID, fixtureRegistry).map((item) => item.id)).toEqual([
      "WC_CNC",
      "M_CNC_PROFILE",
    ]);
    expect(coverageForCapability("CNC_ROUTING", fixtureRegistry)).toBe("COVERED");
    expect(JSON.stringify(operationalProcesses)).not.toMatch(/WC_CNC|M_CNC_PROFILE|machineId/);
  });

  it("lets a workcenter provide manual assembly without a machine", () => {
    const providers = providersForCapability("MANUAL_ASSEMBLY", fixtureRegistry);
    expect(
      providers.some((item) => item.kind === "WORKCENTER" && item.id === "WC_FIXTURE_ASSEMBLY"),
    ).toBe(true);
    expect(providers.every((item) => item.kind !== "MACHINE")).toBe(true);
    expect(coverageForCapability("MANUAL_ASSEMBLY", fixtureRegistry)).toBe("COVERED");
  });

  it("lets painting be provided by a workcenter while the process stays unchanged", () => {
    expect(providersForProcess(PAINT_RAL_ID, fixtureRegistry).map((item) => item.id)).toEqual([
      "WC_PAINTING",
    ]);
    expect(operationalProcesses.find((item) => item.id === PAINT_RAL_ID)?.requiredCapabilityId).toBe(
      "PAINTING",
    );
  });

  it("allows one machine to provide multiple capabilities and one capability multiple providers", () => {
    const machine = fixtureRegistry.getMachine("M_CNC_PROFILE");
    expect(machine?.capabilityIds).toEqual(["CNC_ROUTING", "PROFILE_FORMING"]);
    expect(providersForCapability("CNC_ROUTING", fixtureRegistry).map((item) => item.id)).toEqual([
      "WC_CNC",
      "M_CNC_PROFILE",
    ]);
    expect(providersForCapability("MANUAL_ASSEMBLY", fixtureRegistry).map((item) => item.id)).toEqual(
      ["WC_FIXTURE_ASSEMBLY", "WC_FIXTURE_ASSEMBLY_ALT"],
    );
  });

  it("lets a future execution task choose a provider without changing the process", () => {
    const futureTask = {
      processId: BOND_LETTER_BODY_ID,
      providerKind: "WORKCENTER" as const,
      providerId: "WC_FIXTURE_ASSEMBLY",
    };
    expect(providersForProcess(futureTask.processId, fixtureRegistry).some((item) => item.id === futureTask.providerId)).toBe(
      true,
    );
    expect(JSON.stringify(operationalProcesses)).not.toMatch(/WC_FIXTURE_ASSEMBLY|WC_ASSEMBLY_01|WC_ASSEMBLY_02/);
  });
});

describe("letters capability coverage", () => {
  it("reports live Letters demand as missing providers", () => {
    const live = lettersCapabilityCoverage();
    expect(live.productCode).toBe(frontlitPlexiAl06Template.code);
    expect(live.requiredCapabilityIds).toEqual([
      "CNC_ROUTING",
      "PROFILE_FORMING",
      "MANUAL_ASSEMBLY",
      "VINYL_APPLICATION",
      "ELECTRICAL_ASSEMBLY",
      "PAINTING",
      "QUALITY_CONTROL",
      "PACKAGING",
    ]);
    expect(live.coveredCapabilityIds).toEqual([
      "CNC_ROUTING",
      "PROFILE_FORMING",
      "MANUAL_ASSEMBLY",
      "VINYL_APPLICATION",
      "ELECTRICAL_ASSEMBLY",
    ]);
    expect(live.plannedCapabilityIds).toEqual([]);
    expect(live.missingCapabilityIds).toEqual([
      "PAINTING",
      "QUALITY_CONTROL",
      "PACKAGING",
    ]);
    expect(live.requiredCapabilityIds).not.toContain("WELD_STEEL");
    expect(live.requiredCapabilityIds).not.toContain("WELD_ALUMINIUM");
    expect(live.requiredCapabilityIds).not.toContain("METAL_CUTTING");
    expect(live.requiredCapabilityIds).not.toContain("PRINTING");
  });

  it("compares Letters demand with a fixture catalog without claiming execution readiness", () => {
    const covered = lettersCapabilityCoverage(fixtureRegistry);
    expect(covered.coveredCapabilityIds).toEqual([
      "CNC_ROUTING",
      "PROFILE_FORMING",
      "MANUAL_ASSEMBLY",
      "PAINTING",
    ]);
    expect(covered.missingCapabilityIds).toEqual([
      "VINYL_APPLICATION",
      "ELECTRICAL_ASSEMBLY",
      "QUALITY_CONTROL",
      "PACKAGING",
    ]);
    const admin = projectWorkcentersAdministration(fixtureRegistry);
    expect(admin.overview.executionState).toBe("NOT_IMPLEMENTED");
    expect(admin.overview.capacityPlanningState).toBe("NOT_IMPLEMENTED");
    expect(JSON.stringify(admin)).not.toMatch(/amount|EUR|hourly|machineHour/);
  });
});

describe("live shop-floor map", () => {
  it("maps welding machines to one workcenter with distinct steel and aluminium eligibility", () => {
    const welding = workcenterRegistry.getWorkcenter(WC_WELDING_ID);
    const steel = workcenterRegistry.getMachine(MCH_WELD_STEEL_ID);
    const aluminium = workcenterRegistry.getMachine(MCH_WELD_ALU_ID);
    expect(welding?.label).toBe("Stație sudură");
    expect(welding?.capabilityIds).toEqual([]);
    expect(steel?.workcenterId).toBe(WC_WELDING_ID);
    expect(aluminium?.workcenterId).toBe(WC_WELDING_ID);
    expect(steel?.capabilityIds).toEqual(["WELD_STEEL"]);
    expect(aluminium?.capabilityIds).toEqual(["WELD_ALUMINIUM"]);
    expect(providersForCapability("WELD_STEEL").map((item) => item.id)).toEqual([
      MCH_WELD_STEEL_ID,
    ]);
    expect(providersForCapability("WELD_ALUMINIUM").map((item) => item.id)).toEqual([
      MCH_WELD_ALU_ID,
    ]);
    expect(coverageForCapability("WELD_STEEL")).toBe("COVERED");
    expect(coverageForCapability("WELD_ALUMINIUM")).toBe("COVERED");
    expect(providersForProcess(WELD_STEEL_JOIN_ID).map((item) => item.id)).toEqual([
      MCH_WELD_STEEL_ID,
    ]);
    expect(providersForProcess(WELD_ALUMINIUM_JOIN_ID).map((item) => item.id)).toEqual([
      MCH_WELD_ALU_ID,
    ]);
    expect(recipeGapForProcess(WELD_STEEL_JOIN_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(recipeGapForProcess(WELD_ALUMINIUM_JOIN_ID)).toBe("SERVICE_RECIPE_MISSING");
  });

  it("maps metal cutting and CNC without collapsing machine into workcenter or process", () => {
    expect(workcenterRegistry.getWorkcenter(WC_METAL_CUTTING_ID)?.capabilityIds).toEqual([]);
    expect(workcenterRegistry.getMachine(MCH_METAL_CUTTER_AUTO_ID)?.capabilityIds).toEqual([
      "METAL_CUTTING",
    ]);
    expect(providersForCapability("CNC_ROUTING").map((item) => item.id)).toEqual([
      MCH_CNC_4020_ID,
    ]);
    expect(providersForCapability("PROFILE_FORMING").map((item) => item.id)).toEqual([
      MCH_CNC_CANT_LITERE_ID,
    ]);
    expect(providersForProcess(CUT_SHEET_CNC_ID).map((item) => item.id)).toEqual([
      MCH_CNC_4020_ID,
    ]);
    expect(workcenterRegistry.getMachine(MCH_CNC_4020_ID)?.workcenterId).toBe(
      WC_CNC_ROUTING_ID,
    );
    expect(workcenterRegistry.getMachine(MCH_CNC_CANT_LITERE_ID)?.workcenterId).toBe(
      WC_LETTER_FORMING_ID,
    );
    expect(JSON.stringify(operationalProcesses)).not.toMatch(
      /MCH-CNC-4020|WC_CNC_ROUTING|machineId|workcenterId/,
    );
  });

  it("lets electrical and vinyl stations provide capability without fake machines", () => {
    expect(providersForCapability("ELECTRICAL_ASSEMBLY").map((item) => item.id)).toEqual([
      WC_LED_ASSEMBLY_ID,
    ]);
    expect(providersForCapability("VINYL_APPLICATION").map((item) => item.id)).toEqual([
      WC_VINYL_APPLICATION_ID,
    ]);
    expect(
      workcenters
        .find((item) => item.id === WC_ASSEMBLY_01_ID)
        ?.capabilityIds.includes("ELECTRICAL_ASSEMBLY"),
    ).toBe(false);
    expect(
      workcenters
        .find((item) => item.id === WC_ASSEMBLY_02_ID)
        ?.capabilityIds.includes("VINYL_APPLICATION"),
    ).toBe(false);
  });

  it("projects the live shop-floor map and honest remaining Letters gaps", () => {
    const admin = projectWorkcentersAdministration();
    expect(admin.writeState).toBe("NOT_IMPLEMENTED");
    expect(admin.overview.peopleState).toBe("NOT_IMPLEMENTED");
    expect(admin.workcenters.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        WC_ASSEMBLY_01_ID,
        WC_ASSEMBLY_02_ID,
        WC_WELDING_ID,
        WC_METAL_CUTTING_ID,
        WC_CNC_ROUTING_ID,
        WC_LETTER_FORMING_ID,
        WC_LED_ASSEMBLY_ID,
      ]),
    );
    expect(admin.workcenters[0]?.id).toBe(WC_ASSEMBLY_01_ID);
    expect(admin.workcenters[1]?.id).toBe(WC_ASSEMBLY_02_ID);
    expect(admin.workcenters[0]?.processLabels).toEqual(
      expect.arrayContaining(["Lipire față-volum", "Închidere corp"]),
    );
    expect(admin.overview.workcenterCount).toBe(workcenters.length);
    expect(admin.overview.machineCount).toBe(machines.length);
    expect(admin.overview.workcenterCount).toBe(12);
    expect(admin.overview.machineCount).toBe(11);
    expect(admin.overview.coveredCapabilityCount).toBe(14);
    expect(admin.overview.missingCapabilityCount).toBe(3);
    expect(admin.overview.capacityPlanningState).toBe("NOT_IMPLEMENTED");
    expect(admin.overview.executionState).toBe("NOT_IMPLEMENTED");
    const manual = admin.capabilities.find((item) => item.id === "MANUAL_ASSEMBLY");
    expect(manual?.coverage).toBe("COVERED");
    expect(manual?.providers.map((item) => item.id)).toEqual([
      WC_ASSEMBLY_01_ID,
      WC_ASSEMBLY_02_ID,
    ]);
    expect(providersForCapability("MANUAL_ASSEMBLY").map((item) => item.id)).toEqual([
      WC_ASSEMBLY_01_ID,
      WC_ASSEMBLY_02_ID,
    ]);
    expect(coverageForCapability("MANUAL_ASSEMBLY")).toBe("COVERED");
    expect(providersForProcess(BOND_LETTER_BODY_ID).map((item) => item.id)).toEqual([
      WC_ASSEMBLY_01_ID,
      WC_ASSEMBLY_02_ID,
    ]);
    expect(admin.lettersCoverage.missingCapabilityIds).toEqual([
      "PAINTING",
      "QUALITY_CONTROL",
      "PACKAGING",
    ]);
    const cncMachine = admin.machines.find((item) => item.id === MCH_CNC_4020_ID);
    expect(cncMachine?.processLabels).toContain("Debitare foaie CNC");
    expect(cncMachine?.recipeRows[0]?.state).toBe("CANONICAL_COST_EXISTS");
    const steelMachine = admin.machines.find((item) => item.id === MCH_WELD_STEEL_ID);
    expect(steelMachine?.processLabels).toEqual(["Îmbinare sudură oțel"]);
    expect(steelMachine?.recipeRows[0]?.state).toBe("SERVICE_RECIPE_MISSING");
    expect(
      admin.workcenters.find((item) => item.id === WC_WELDING_ID)?.processLabels,
    ).toEqual(["Îmbinare sudură oțel", "Îmbinare sudură aluminiu"]);
    expect(providersForProcess(PRINT_WIDE_FORMAT_ID).map((item) => item.id)).toEqual([
      "MCH-EPSON-60800",
    ]);
    expect(providersForProcess(LAMINATE_WIDE_FORMAT_ID).map((item) => item.id)).toEqual([
      "MCH-LAMINATOR-XPRO",
    ]);
    expect(providersForProcess(LAMINATE_RIGID_PLATE_ID).map((item) => item.id)).toEqual([
      "MCH-RIGID-FILM-LAMINATOR",
    ]);
    expect(providersForProcess(CUT_CONTOUR_PLOTTER_ID).map((item) => item.id)).toEqual([
      "MCH-CUTTER-PLOTTER",
    ]);
    expect(providersForProcess(CUT_LASER_SHEET_ID).map((item) => item.id)).toEqual([
      "MCH-LASER-CNC",
    ]);
    expect(providersForProcess(CUT_STYROFOAM_ID).map((item) => item.id)).toEqual([
      "MCH-STYRO-CUTTER",
    ]);
    expect(providersForProcess(CUT_METAL_STOCK_ID).map((item) => item.id)).toEqual([
      MCH_METAL_CUTTER_AUTO_ID,
    ]);
    expect(recipeGapForProcess(PRINT_WIDE_FORMAT_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(recipeGapForProcess(CUT_CONTOUR_PLOTTER_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(admin.processCoverage.some((item) => item.processId === WELD_STEEL_JOIN_ID)).toBe(
      true,
    );
    expect(
      admin.lettersCoverage.compositions.flatMap((item) =>
        item.processes.map((process) => process.processId),
      ),
    ).not.toContain(WELD_STEEL_JOIN_ID);
    expect(recipeGapForProcess(FORM_ALUMINIUM_PROFILE_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(recipeGapForProcess(BOND_LETTER_BODY_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(admin.serviceMap.some((item) => item.providerId === MCH_WELD_STEEL_ID)).toBe(
      true,
    );
    expect(JSON.stringify(operationalProcesses)).not.toMatch(
      /WC_ASSEMBLY_01|WC_ASSEMBLY_02|machineId/,
    );
    expect(JSON.stringify(admin)).not.toMatch(
      /WC_ASSEMBLY[^_]|Infinity|maxEmployees|taskConcurrency/,
    );
    expect(JSON.stringify(admin)).not.toMatch(/CNC-01|Paint Booth|Assembly Station/);
    expect(JSON.stringify(admin)).not.toMatch(/ExecutionPlan|Preț client|machineHour|hourlyRate/);
    expect(JSON.stringify(admin)).not.toMatch(/employeeId|CNC_ROUTER[^_]|Paint Booth/);
    expect(admin.workcenters.map((item) => item.label).join(" ")).not.toMatch(/WA-/);
    expect(admin.machines.map((item) => item.label).join(" ")).not.toMatch(/WA-/);
  });

  it("keeps ProductTemplate, Aggregate, Lighting and EIC independent of providers", () => {
    expect(JSON.stringify(frontlitPlexiAl06Template)).not.toMatch(
      /machineId|workcenterId|WC_|M_CNC/,
    );
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
      },
    );
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected confirmed truth");
    }
    const aggregate = compileAggregate(
      truth,
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    const composition = composeProductProcesses(frontlitPlexiAl06Template, truth.values);
    expect(compileEic(aggregate).total).toBe(190.5);
    expect(aggregate.componentStatuses.find((item) => item.id === "LIGHTING")?.status).toBe(
      "CALCULATED",
    );
    expect(composition.executionReadiness).toBe("NOT_IMPLEMENTED");
    expect(JSON.stringify(aggregate)).not.toMatch(/workcenter|machineId|Utilaje/);
    expect(JSON.stringify(composition)).not.toMatch(/workcenterId|machineId/);
  });
});
