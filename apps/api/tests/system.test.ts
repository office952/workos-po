import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";

describe("system projection API", () => {
  it("projects reusable components from domain contracts", async () => {
    const response = await createApp().request("/api/components");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      roles: Array<{
        role: string;
        label: string;
        types: Array<{
          typeId: string;
          eic: string;
          usedBy: Array<{ productCode: string }>;
          technicalSettings: Array<{ id: string; valueDisplay: string }>;
        }>;
      }>;
    };
    expect(body.roles.map((item) => item.role)).toEqual([
      "FACE",
      "VOLUME",
      "BACK",
      "LIGHTING",
    ]);
    expect(body.roles.map((item) => item.label)).toEqual([
      "Față",
      "Volum",
      "Spate",
      "Iluminare",
    ]);
    expect(body.roles[0]?.types[0]?.usedBy[0]?.productCode).toBe(
      CANONICAL_PRODUCT_CODE,
    );
    expect(body.roles[3]?.types[0]?.eic).toBe("Disponibil: material");
    expect(body.roles[3]?.types[0]?.technicalSettings).toEqual([
      expect.objectContaining({ id: "ledPitchMm", valueDisplay: "100 mm" }),
      expect.objectContaining({ id: "ledModulePowerW", valueDisplay: "0.75 W" }),
      expect.objectContaining({ id: "psuReservePercent", valueDisplay: "25 %" }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/RETURN_CANT/);
  });

  it("projects product system administration from canonical registries", async () => {
    const response = await createApp().request("/api/product-system-admin");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      families: Array<{ id: string; productCodes: string[] }>;
      products: Array<{
        code: string;
        composition: Array<{ typeId: string }>;
      }>;
      types: Array<{
        typeId: string;
        usedByProductCodes: string[];
        technicalSettings: Array<{ id: string }>;
      }>;
    };
    expect(body.families[0]?.id).toBe("LIGHTED_VOLUMETRIC_SIGNS");
    expect(body.families[0]?.productCodes).toEqual([CANONICAL_PRODUCT_CODE]);
    expect(body.products[0]?.composition.map((item) => item.typeId)).toEqual([
      "PLEXIGLAS_FACE",
      "ALUMINIUM_VOLUME",
      "FOREX_BACK",
      "LIGHTING_FRONT_LED",
    ]);
    expect(
      body.types.find((item) => item.typeId === "LIGHTING_FRONT_LED")
        ?.usedByProductCodes,
    ).toEqual([CANONICAL_PRODUCT_CODE]);
  });

  it("projects resources administration from the typed catalog", async () => {
    const response = await createApp().request("/api/resources-admin");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      writeState: string;
      families: Array<{ id: string; specifications: Array<{ id: string }> }>;
      services: Array<{ id: string; kind: string }>;
      costEvidence: Array<{ resourceId: string; amount: number; evidenceRowId: string | null }>;
    };
    expect(body.writeState).toBe("READY");
    expect(body.families.map((item) => item.id)).toEqual([
      "PLEXIGLAS",
      "FOREX",
      "ALUMINIUM",
      "LED",
      "VINYL",
      "ACM",
      "STEEL",
    ]);
    expect(body.families[0]?.specifications[0]?.id).toBe("plexiglas_3mm_opal");
    expect(body.families[3]?.specifications.map((item) => item.id)).toEqual([
      "MAT-LED-MODULE",
      "MAT-LED-PSU-12V-60W",
      "MAT-LED-PSU-12V-100W",
      "MAT-LED-PSU-12V-160W",
      "MAT-LED-PSU-12V-200W",
    ]);
    expect(body.services[0]).toEqual(
      expect.objectContaining({ id: "return_cant_forming", kind: "SERVICE" }),
    );
    expect(body.costEvidence).toHaveLength(29);
    expect(body.costEvidence.every((item) => typeof item.evidenceRowId === "string")).toBe(
      true,
    );
    expect(JSON.stringify(body)).not.toMatch(/plexiglas_face_3mm|forex_back_10mm/);
  });

  it("projects operational processes from the typed catalog", async () => {
    const response = await createApp().request("/api/operational-processes");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      writeState: string;
      processes: Array<{
        id: string;
        requiredCapabilityId: string;
        resourceLinks: Array<{ id: string }>;
      }>;
      capabilities: Array<{ id: string }>;
    };
    expect(body.writeState).toBe("NOT_IMPLEMENTED");
    expect(body.processes.map((item) => item.id)).toEqual([
      "CUT_SHEET_CNC",
      "FORM_ALUMINIUM_PROFILE",
      "APPLY_SURFACE_FINISH",
      "BOND_LETTER_BODY",
      "PLACE_LED_MODULES",
      "PAINT_RAL",
      "WIRE_LIGHTING",
      "INSTALL_OR_CONNECT_PSU",
      "TEST_LIGHTING_IGNITION",
      "CLOSE_LETTER_BODY",
      "TEST_ILLUMINATION_UNIFORMITY",
      "INSPECT_FINISHED_LETTER",
      "PACK_PRODUCT",
      "ATTACH_INTERNAL_FRAME",
      "FORM_SHEET_CASSETTE",
      "WELD_STEEL_JOIN",
      "WELD_ALUMINIUM_JOIN",
      "CUT_METAL_STOCK",
      "PRINT_WIDE_FORMAT",
      "LAMINATE_WIDE_FORMAT",
      "LAMINATE_RIGID_PLATE",
      "CUT_CONTOUR_PLOTTER",
      "CUT_LASER_SHEET",
      "CUT_STYROFOAM",
    ]);
    expect(
      body.processes.find((item) => item.id === "FORM_ALUMINIUM_PROFILE")
        ?.requiredCapabilityId,
    ).toBe("PROFILE_FORMING");
    expect(
      body.processes.find((item) => item.id === "FORM_ALUMINIUM_PROFILE")
        ?.resourceLinks[0]?.id,
    ).toBe("return_cant_forming");
    expect(body.capabilities.map((item) => item.id)).toContain("CNC_ROUTING");
    expect(JSON.stringify(body)).not.toMatch(/machineId|ExecutionPlan|employeeId/);
    expect(
      (body.processes[0] as { providerCoverage?: string }).providerCoverage,
    ).toBe("COVERED");
    expect(
      (body as { compositions?: Array<{ id: string }> }).compositions?.map(
        (item) => item.id,
      ),
    ).toEqual([
      "letters-finish-none",
      "letters-finish-vinyl",
      "letters-volume-painted",
    ]);
  });

  it("projects workcenters administration from the typed catalog", async () => {
    const response = await createApp().request("/api/workcenters");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      writeState: string;
      workcenters: unknown[];
      machines: unknown[];
      overview: {
        workcenterCount: number;
        coveredCapabilityCount: number;
        missingCapabilityCount: number;
        capacityPlanningState: string;
        executionState: string;
      };
      lettersCoverage: { missingCapabilityIds: string[] };
    };
    expect(body.writeState).toBe("NOT_IMPLEMENTED");
    expect(
      (body.workcenters as Array<{ id: string }>).map((item) => item.id),
    ).toEqual(
      expect.arrayContaining(["WC_ASSEMBLY_01", "WC_ASSEMBLY_02", "WC_WELDING"]),
    );
    expect((body.workcenters as Array<{ id: string }>)[0]?.id).toBe("WC_ASSEMBLY_01");
    expect((body.machines as Array<{ id: string }>).map((item) => item.id)).toContain(
      "MCH-CNC-4020",
    );
    expect(body.overview.missingCapabilityCount).toBe(3);
    expect(body.overview.workcenterCount).toBe(12);
    expect(body.overview.coveredCapabilityCount).toBe(14);
    expect(body.overview.capacityPlanningState).toBe("NOT_IMPLEMENTED");
    expect(body.overview.executionState).toBe("NOT_IMPLEMENTED");
    expect(body.lettersCoverage.missingCapabilityIds).toEqual([
      "PAINTING",
      "QUALITY_CONTROL",
      "PACKAGING",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/CNC-01|machineHour|ExecutionPlan|Preț client/);
  });

  it("projects letters process composition without mutating the product", async () => {
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/process-composition?faceFinish=vinyl&volumeFinish=vinyl`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      composition: {
        completeness: string;
        nodes: Array<{ id: string; processId: string }>;
      };
    };
    expect(body.composition.completeness).toBe("BLOCKED");
    expect(body.composition.nodes.map((item) => item.id)).toContain(
      "FACE:CUT_SHEET_CNC",
    );
    expect(body.composition.nodes.map((item) => item.id)).toContain(
      "BACK:CUT_SHEET_CNC",
    );
    expect(body.composition.nodes.map((item) => item.id)).toContain(
      "BODY:BOND_LETTER_BODY",
    );
    expect(body.composition.nodes.map((item) => item.processId)).not.toEqual(
      expect.arrayContaining(["WELD_STEEL_JOIN", "PRINT_WIDE_FORMAT"]),
    );
    expect(JSON.stringify(body)).not.toMatch(
      /machineId|employeeId|ExecutionPlan|ExecutionTask/,
    );
  });

  it("projects governance with commercial price rules and without quote freeze", async () => {
    const response = await createApp().request("/api/governance");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authorities: Array<{ id: string; state: string }>;
      freeze: { state: string };
    };
    expect(
      body.authorities.find((item) => item.id === "COMPONENT_TECHNICAL_SETTINGS")?.state,
    ).toBe("IMPLEMENTED");
    expect(body.authorities.find((item) => item.id === "COMMERCIAL")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(body.authorities.find((item) => item.id === "ANALYZER")?.state).toBe(
      "NOT_IMPLEMENTED",
    );
    expect(body.freeze.state).toBe("PLANNED");
  });
});
