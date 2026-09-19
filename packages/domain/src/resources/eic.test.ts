import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
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
import type { DraftValues } from "../product/types.js";
import {
  MAT_LED_MODULE_ID,
  MAT_LED_PSU_12V_160W_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  RETURN_CANT_FORMING_ID,
  costEvidence,
  getCostEvidence,
  getResource,
  resourceCatalog,
} from "./catalog.js";
import {
  EIC_CALIBRATION_REASON,
  EIC_GEOMETRY_CONFIRMED_LABEL,
  applyRequirement,
  compileEic,
  resourceRequirements,
} from "./eic.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedSpine(values: DraftValues = readyValues) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values,
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
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  return { definition, truth, aggregate, composition };
}

function lineCost(eic: ReturnType<typeof compileEic>, resourceId: string): number {
  return eic.lines
    .filter((line) => line.resourceId === resourceId)
    .reduce((sum, line) => sum + line.cost, 0);
}

describe("resource ownership", () => {
  it("keeps rates only in the resource catalog", () => {
    expect(JSON.stringify(frontlitPlexiAl06Template)).not.toMatch(/amount|EUR|rate/i);
    const { truth, aggregate } = confirmedSpine();
    expect(JSON.stringify(truth)).not.toMatch(/"amount":10|"amount":15/);
    expect(
      aggregate.quantities.find((item) => item.componentId === "VOLUME")?.value,
    ).toBe(12.5);
    expect(JSON.stringify(aggregate)).not.toMatch(/"amount":10|"amount":15/);
    expect(
      costEvidence.every((item) =>
        resourceCatalog.some((resource) => resource.id === item.resourceId),
      ),
    ).toBe(true);
    expect(resourceCatalog.map((item) => item.id)).toEqual(
      expect.arrayContaining(["acm_3mm", "steel_frame_profile"]),
    );
    expect(costEvidence.map((item) => item.resourceId)).toEqual(
      expect.arrayContaining(["acm_3mm", "steel_frame_profile"]),
    );
    expect(getCostEvidence("acm_3mm")?.classification).toBe("AI_DECISION");
    expect(getCostEvidence("steel_frame_profile")?.classification).toBe("AI_DECISION");
  });
});

describe("EIC", () => {
  it("multiplies confirmed quantity by catalog rates and is complete without recipes at 60 mm", () => {
    const { aggregate } = confirmedSpine();
    const requirements = resourceRequirements(aggregate);
    expect(requirements).toHaveLength(6);
    const eic = compileEic(aggregate);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.completenessReasons).toEqual([]);
    expect(eic.geometryLabel).toBe(EIC_GEOMETRY_CONFIRMED_LABEL);
    expect(eic.currency).toBe("EUR");
    expect(eic.lines.map((line) => line.cost)).toEqual([4, 37.5, 62.5, 4, 62.5, 20]);
    expect(eic.total).toBe(190.5);
    expect(eic.excludedComponentLabels).toEqual([]);
    expect(JSON.stringify(eic)).not.toMatch(/Geometrie din Analyzer|customer|markup|quote/i);
  });

  it("adds LETTERS recipes and becomes complete for owner-confirmed 60 mm none/none", () => {
    const { aggregate, composition } = confirmedSpine();
    const eic = compileEic(aggregate, composition);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.completenessReasons).toEqual([]);
    expect(eic.geometryLabel).toBe(EIC_GEOMETRY_CONFIRMED_LABEL);
    expect(eic.total).toBe(382.5);
    expect(JSON.stringify(eic)).not.toMatch(/Geometrie din Analyzer/);
    expect(lineCost(eic, "aluminium_return_profile")).toBe(37.5);
    expect(lineCost(eic, "SVC-CNC-FACE")).toBe(37.5);
    expect(lineCost(eic, "SVC-CNC-BACK")).toBe(56.25);
    expect(lineCost(eic, "LAB-BOND-LETTER-BODY")).toBe(62.5);
    expect(lineCost(eic, "LAB-CLOSE-LETTER-BODY")).toBe(25);
    expect(lineCost(eic, "SVC-PLACE-LED-MODULES")).toBe(6.25);
    expect(lineCost(eic, "SVC-ELECTRICAL-FINISH")).toBe(2);
    expect(lineCost(eic, "SVC-PACK-PRODUCT")).toBe(2.5);
    expect(lineCost(eic, RETURN_CANT_FORMING_ID)).toBe(62.5);
    expect(eic.lines.filter((line) => line.resourceId === RETURN_CANT_FORMING_ID)).toHaveLength(
      1,
    );
    expect(lineCost(eic, MAT_LED_MODULE_ID) + lineCost(eic, MAT_LED_PSU_12V_160W_ID)).toBe(
      82.5,
    );
    expect(eic.lines.some((line) => line.resourceId === "SVC-PAINT-RAL")).toBe(false);
    expect(eic.lines.some((line) => line.resourceId === "MAT-VINYL-ORACAL-651")).toBe(false);
    expect(JSON.stringify(eic)).not.toMatch(/customer|markup|quote|if process|LETTERS/i);
  });

  it.each([
    { depthMm: 30, profileRate: 2, profileCost: 25, total: 370 },
    { depthMm: 60, profileRate: 3, profileCost: 37.5, total: 382.5 },
    { depthMm: 80, profileRate: 4, profileCost: 50, total: 395 },
    { depthMm: 100, profileRate: 5, profileCost: 62.5, total: 407.5 },
  ] as const)(
    "uses depth-scoped aluminium purchase evidence at $depthMm mm",
    ({ depthMm, profileRate, profileCost, total }) => {
      const { aggregate, composition } = confirmedSpine({
        ...readyValues,
        "volume.depthMm": String(depthMm),
      });
      const eic = compileEic(aggregate, composition);
      expect(eic.completeness).toBe("COMPLETE");
      expect(eic.completenessReasons).toEqual([]);
      expect(eic.geometryLabel).toBe(EIC_GEOMETRY_CONFIRMED_LABEL);
      expect(lineCost(eic, "aluminium_return_profile")).toBe(profileCost);
      expect(lineCost(eic, RETURN_CANT_FORMING_ID)).toBe(62.5);
      expect(eic.total).toBe(total);
      const profileLine = eic.lines.find(
        (line) => line.resourceId === "aluminium_return_profile",
      );
      expect(profileLine?.rate).toBe(profileRate);
      expect(eic.lines.filter((line) => line.resourceId === "aluminium_return_profile")).toHaveLength(
        1,
      );
    },
  );

  it("does not let 30 mm inherit a 60 mm-only aluminium row", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "volume.depthMm": "30",
    });
    const sixtyOnly = costEvidence.filter(
      (item) =>
        item.resourceId !== "aluminium_return_profile" || item.when?.volumeDepthMm === 60,
    );
    const eic = compileEic(aggregate, composition, sixtyOnly);
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.completenessReasons).toEqual([
      "Tarif profil aluminiu neconfirmat pentru adâncimea 30 mm",
    ]);
    expect(lineCost(eic, "aluminium_return_profile")).toBe(0);
    expect(lineCost(eic, RETURN_CANT_FORMING_ID)).toBe(62.5);
    expect(eic.total).toBe(345);
    expect(
      eic.lines.some(
        (line) => line.rate === 3 && line.resourceId === "aluminium_return_profile",
      ),
    ).toBe(false);
  });

  it("keeps vinyl material and application labor separate when vinyl is selected", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const eic = compileEic(aggregate, composition);
    expect(lineCost(eic, "MAT-VINYL-ORACAL-651")).toBe(2.25);
    expect(lineCost(eic, "LAB-VINYL-FACE")).toBe(1.25);
    expect(eic.lines.filter((line) => line.resourceId === "MAT-VINYL-ORACAL-651")).toHaveLength(
      1,
    );
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.completenessReasons).toEqual([EIC_CALIBRATION_REASON]);
    expect(eic.total).toBe(386);
  });

  it("costs RAL only when the volume finish is painted", () => {
    const { aggregate, composition } = confirmedSpine({
      ...readyValues,
      "volume.finish": "painted",
      "volume.color": "RAL 9010",
    });
    const eic = compileEic(aggregate, composition);
    expect(lineCost(eic, "SVC-PAINT-RAL")).toBe(50);
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.completenessReasons).toEqual([EIC_CALIBRATION_REASON]);
    expect(eic.total).toBe(432.5);
  });

  it("reports honest missing geometry without an Analyzer gap", () => {
    const { truth } = confirmedSpine();
    const missing = compileAggregate(
      { ...truth, measurements: [] },
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    const eic = compileEic(missing);
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.geometryLabel).toBeNull();
    expect(eic.completenessReasons).toEqual(
      expect.arrayContaining(["Suprafață față neconfirmată", "Perimetru volum neconfirmat"]),
    );
    expect(eic.completenessReasons).not.toContain("Geometrie din Analyzer");
    expect(eic.lines).toEqual([]);
    expect(missing.unavailable).toEqual(
      expect.arrayContaining(["Suprafață față neconfirmată", "Perimetru volum neconfirmat"]),
    );
  });

  it("fails explicitly for an unknown resource", () => {
    expect(getResource("missing_resource")).toBeUndefined();
    expect(getCostEvidence("missing_resource")).toBeUndefined();
    expect(() =>
      applyRequirement({
        componentId: "VOLUME",
        resourceId: "missing_resource",
        quantity: 1,
        unit: "m",
      }),
    ).toThrow(/Unknown resource missing_resource/);
  });

  it("rejects unit mismatch and stays generic", () => {
    expect(() =>
      applyRequirement({
        componentId: "FACE",
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        quantity: 1,
        unit: "m",
      }),
    ).toThrow(/Unit mismatch/);
    const { aggregate } = confirmedSpine();
    const eic = compileEic(aggregate);
    expect(JSON.stringify(eic)).not.toMatch(/FACE|VOLUME|BACK|LIGHTING/);
    expect(JSON.stringify(eic)).not.toMatch(/customer|markup|quote|VAT/i);
  });
});
