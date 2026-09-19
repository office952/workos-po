import { describe, expect, it } from "vitest";
import { CAPABILITY_IDS } from "../capabilities.js";
import { RETURN_CANT_FORMING_ID } from "../resources/catalog.js";
import {
  APPLY_SURFACE_FINISH_ID,
  ATTACH_INTERNAL_FRAME_ID,
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  FORM_SHEET_CASSETTE_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  PRINT_WIDE_FORMAT_ID,
  PROCESS_CATEGORIES,
  CUT_CONTOUR_PLOTTER_ID,
  CUT_LASER_SHEET_ID,
  CUT_METAL_STOCK_ID,
  CUT_STYROFOAM_ID,
  LAMINATE_RIGID_PLATE_ID,
  LAMINATE_WIDE_FORMAT_ID,
  WELD_ALUMINIUM_JOIN_ID,
  WELD_STEEL_JOIN_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
  frozenProviderRequirement,
  getOperationalProcess,
  getProductionCapability,
  operationalProcesses,
  processProviderRequirement,
  processesForType,
  productionCapabilityClasses,
} from "./catalog.js";

describe("operational process catalog", () => {
  it("keeps unique process and capability identities", () => {
    const processIds = operationalProcesses.map((item) => item.id);
    const capabilityIds = productionCapabilityClasses.map((item) => item.id);
    expect(new Set(processIds).size).toBe(processIds.length);
    expect(new Set(capabilityIds).size).toBe(capabilityIds.length);
    expect(processIds).toEqual([
      CUT_SHEET_CNC_ID,
      FORM_ALUMINIUM_PROFILE_ID,
      APPLY_SURFACE_FINISH_ID,
      BOND_LETTER_BODY_ID,
      PLACE_LED_MODULES_ID,
      PAINT_RAL_ID,
      WIRE_LIGHTING_ID,
      INSTALL_OR_CONNECT_PSU_ID,
      TEST_LIGHTING_IGNITION_ID,
      CLOSE_LETTER_BODY_ID,
      TEST_ILLUMINATION_UNIFORMITY_ID,
      INSPECT_FINISHED_LETTER_ID,
      PACK_PRODUCT_ID,
      ATTACH_INTERNAL_FRAME_ID,
      FORM_SHEET_CASSETTE_ID,
      WELD_STEEL_JOIN_ID,
      WELD_ALUMINIUM_JOIN_ID,
      CUT_METAL_STOCK_ID,
      PRINT_WIDE_FORMAT_ID,
      LAMINATE_WIDE_FORMAT_ID,
      LAMINATE_RIGID_PLATE_ID,
      CUT_CONTOUR_PLOTTER_ID,
      CUT_LASER_SHEET_ID,
      CUT_STYROFOAM_ID,
    ]);
  });

  it("uses only declared categories and shop-floor capabilities", () => {
    for (const process of operationalProcesses) {
      expect(PROCESS_CATEGORIES).toContain(process.category);
      expect(getProductionCapability(process.requiredCapabilityId)).toBeDefined();
    }
    expect(productionCapabilityClasses.map((item) => item.id)).not.toEqual(
      expect.arrayContaining([...CAPABILITY_IDS]),
    );
  });

  it("requires a capability class and never a machine or employee identity", () => {
    expect(JSON.stringify(operationalProcesses)).not.toMatch(
      /machineId|machineCode|employeeId|orderId|assigned|hourlyRate|EUR|MCH-|WC_|CNC_ROUTER|WELDING_BANNER/i,
    );
    expect(getOperationalProcess(CUT_SHEET_CNC_ID)?.requiredCapabilityId).toBe(
      "CNC_ROUTING",
    );
    expect(getOperationalProcess(FORM_ALUMINIUM_PROFILE_ID)?.requiredCapabilityId).toBe(
      "PROFILE_FORMING",
    );
    expect(getOperationalProcess(BOND_LETTER_BODY_ID)?.requiredCapabilityId).toBe(
      "MANUAL_ASSEMBLY",
    );
    expect(getProductionCapability("CNC_ROUTING")?.kind).toBe("MACHINE");
    expect(getProductionCapability("MANUAL_ASSEMBLY")?.kind).toBe("HUMAN_SKILL");
  });

  it("keeps process applicability reusable across component types", () => {
    expect(processesForType("PLEXIGLAS_FACE").map((item) => item.id)).toEqual([
      CUT_SHEET_CNC_ID,
      APPLY_SURFACE_FINISH_ID,
      BOND_LETTER_BODY_ID,
    ]);
    expect(processesForType("FOREX_BACK").map((item) => item.id)).toEqual([
      CUT_SHEET_CNC_ID,
      CLOSE_LETTER_BODY_ID,
    ]);
    expect(processesForType("ALUMINIUM_VOLUME").map((item) => item.id)).toEqual([
      FORM_ALUMINIUM_PROFILE_ID,
      APPLY_SURFACE_FINISH_ID,
      BOND_LETTER_BODY_ID,
      PAINT_RAL_ID,
    ]);
    expect(getOperationalProcess(PAINT_RAL_ID)?.requiredCapabilityId).toBe("PAINTING");
    expect(getOperationalProcess(APPLY_SURFACE_FINISH_ID)?.requiredCapabilityId).not.toBe(
      "PAINTING",
    );
    expect(getOperationalProcess(CUT_SHEET_CNC_ID)?.applicableTypeIds).toEqual([
      "PLEXIGLAS_FACE",
      "FOREX_BACK",
      "ACM_CASSETTE_BODY",
    ]);
    expect(processesForType("ACM_CASSETTE_BODY").map((item) => item.id)).toEqual([
      CUT_SHEET_CNC_ID,
      ATTACH_INTERNAL_FRAME_ID,
      FORM_SHEET_CASSETTE_ID,
    ]);
    expect(processesForType("STEEL_INTERNAL_FRAME").map((item) => item.id)).toEqual([
      ATTACH_INTERNAL_FRAME_ID,
      CUT_METAL_STOCK_ID,
    ]);
  });

  it("keeps forming linked to the service resource without owning the price", () => {
    const forming = getOperationalProcess(FORM_ALUMINIUM_PROFILE_ID);
    expect(forming?.resourceIds).toEqual([RETURN_CANT_FORMING_ID]);
    expect(forming?.id).not.toBe(RETURN_CANT_FORMING_ID);
    expect(JSON.stringify(forming)).not.toMatch(/"amount"|EUR/);
  });

  it("allows a future execution task to reference a process without changing the definition", () => {
    const futureTask = {
      processId: CUT_SHEET_CNC_ID,
      orderRef: "ORDER-123",
      assignedEmployeeId: "EMP-9",
      machineId: "CNC-ALPHA",
    };
    expect(getOperationalProcess(futureTask.processId)?.id).toBe(CUT_SHEET_CNC_ID);
    expect(JSON.stringify(operationalProcesses)).not.toMatch(
      /ORDER-123|EMP-9|CNC-ALPHA/,
    );
    expect(
      operationalProcesses.every(
        (item) =>
          !("sequence" in item) && !("order" in item) && !("taskId" in item),
      ),
    ).toBe(true);
  });

  it("keeps lighting processes known and forming as the live foundation", () => {
    expect(getOperationalProcess(FORM_ALUMINIUM_PROFILE_ID)).toEqual(
      expect.objectContaining({
        lifecycle: "ACTIVE",
        readiness: "IMPLEMENTED_PROCESS_FOUNDATION",
      }),
    );
    expect(getOperationalProcess(CUT_SHEET_CNC_ID)?.readiness).toBe("KNOWN_PROCESS");
    expect(getOperationalProcess(PLACE_LED_MODULES_ID)?.readiness).toBe("KNOWN_PROCESS");
    expect(getOperationalProcess(INSTALL_OR_CONNECT_PSU_ID)?.readiness).toBe("KNOWN_PROCESS");
  });

  it("keeps steel and aluminium welding as distinct reusable shop-floor processes", () => {
    const steel = getOperationalProcess(WELD_STEEL_JOIN_ID);
    const aluminium = getOperationalProcess(WELD_ALUMINIUM_JOIN_ID);
    expect(steel?.requiredCapabilityId).toBe("WELD_STEEL");
    expect(aluminium?.requiredCapabilityId).toBe("WELD_ALUMINIUM");
    expect(steel?.category).toBe("WELDING");
    expect(aluminium?.category).toBe("WELDING");
    expect(steel?.applicableTypeIds).toEqual([]);
    expect(aluminium?.applicableTypeIds).toEqual([]);
    expect(steel?.resourceIds).toEqual([]);
    expect(processesForType("ALUMINIUM_VOLUME").map((item) => item.id)).not.toContain(
      WELD_STEEL_JOIN_ID,
    );
    expect(processesForType("ALUMINIUM_VOLUME").map((item) => item.id)).not.toContain(
      WELD_ALUMINIUM_JOIN_ID,
    );
  });

  it("keeps plotter cutting distinct from vinyl application and print lamination", () => {
    expect(getOperationalProcess(CUT_CONTOUR_PLOTTER_ID)?.requiredCapabilityId).toBe(
      "PLOTTER_CUTTING",
    );
    expect(getOperationalProcess(APPLY_SURFACE_FINISH_ID)?.requiredCapabilityId).toBe(
      "VINYL_APPLICATION",
    );
    expect(getOperationalProcess(LAMINATE_WIDE_FORMAT_ID)?.requiredCapabilityId).toBe(
      "LAMINATION",
    );
    expect(getOperationalProcess(LAMINATE_RIGID_PLATE_ID)?.requiredCapabilityId).toBe(
      "RIGID_FILM_LAMINATION",
    );
    expect(getOperationalProcess(PRINT_WIDE_FORMAT_ID)?.requiredCapabilityId).toBe("PRINTING");
    expect(getOperationalProcess(CUT_METAL_STOCK_ID)?.requiredCapabilityId).toBe(
      "METAL_CUTTING",
    );
    expect(getOperationalProcess(CUT_LASER_SHEET_ID)?.requiredCapabilityId).toBe(
      "LASER_CUTTING",
    );
    expect(getOperationalProcess(CUT_STYROFOAM_ID)?.requiredCapabilityId).toBe(
      "STYRO_CUTTING",
    );
    expect(getOperationalProcess(CUT_SHEET_CNC_ID)?.requiredCapabilityId).toBe("CNC_ROUTING");
  });

  it("marks only genuine manual operations as provider-not-required", () => {
    expect(processProviderRequirement(getOperationalProcess(CUT_SHEET_CNC_ID))).toBe("REQUIRED");
    expect(processProviderRequirement(getOperationalProcess(FORM_ALUMINIUM_PROFILE_ID))).toBe(
      "REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(PAINT_RAL_ID))).toBe("REQUIRED");
    expect(processProviderRequirement(getOperationalProcess(BOND_LETTER_BODY_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(PLACE_LED_MODULES_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(WIRE_LIGHTING_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(INSTALL_OR_CONNECT_PSU_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(TEST_LIGHTING_IGNITION_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(CLOSE_LETTER_BODY_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(
      processProviderRequirement(getOperationalProcess(TEST_ILLUMINATION_UNIFORMITY_ID)),
    ).toBe("NOT_REQUIRED");
    expect(processProviderRequirement(getOperationalProcess(INSPECT_FINISHED_LETTER_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(processProviderRequirement(getOperationalProcess(PACK_PRODUCT_ID))).toBe(
      "NOT_REQUIRED",
    );
    expect(frozenProviderRequirement(undefined)).toBe("REQUIRED");
  });

  it("keeps shop-floor catalog processes out of Letters type demand", () => {
    const lettersTypeProcessIds = [
      ...processesForType("PLEXIGLAS_FACE"),
      ...processesForType("ALUMINIUM_VOLUME"),
      ...processesForType("FOREX_BACK"),
      ...processesForType("LIGHTING_FRONT_LED"),
    ].map((item) => item.id);
    expect(lettersTypeProcessIds).not.toEqual(
      expect.arrayContaining([
        WELD_STEEL_JOIN_ID,
        WELD_ALUMINIUM_JOIN_ID,
        CUT_METAL_STOCK_ID,
        PRINT_WIDE_FORMAT_ID,
        LAMINATE_WIDE_FORMAT_ID,
        LAMINATE_RIGID_PLATE_ID,
        CUT_CONTOUR_PLOTTER_ID,
        CUT_LASER_SHEET_ID,
        CUT_STYROFOAM_ID,
      ]),
    );
  });
});
