import { describe, expect, it } from "vitest";
import { APPLY_SURFACE_FINISH_ID, CUT_SHEET_CNC_ID } from "./catalog.js";
import {
  processRequirementReferenceLabel,
  processRequirementsForType,
  resolvedProcessRequirementsForType,
} from "./requirements.js";

describe("component process requirements", () => {
  it("keeps FACE vinyl conditional and silent when finish is none", () => {
    const contract = processRequirementsForType("PLEXIGLAS_FACE");
    expect(contract.map((item) => item.processId)).toEqual([
      CUT_SHEET_CNC_ID,
      APPLY_SURFACE_FINISH_ID,
    ]);
    expect(
      resolvedProcessRequirementsForType("PLEXIGLAS_FACE", { "face.finish": "none" }).map(
        (item) => item.processId,
      ),
    ).toEqual([CUT_SHEET_CNC_ID]);
    expect(
      processRequirementReferenceLabel(contract[1]!),
    ).toBe("Aplicare folie (Finisaj față: Colantat)");
  });

  it("does not treat painted volume as vinyl", () => {
    expect(
      resolvedProcessRequirementsForType("ALUMINIUM_VOLUME", {
        "volume.finish": "painted",
      }).map((item) => item.processId),
    ).toEqual(["FORM_ALUMINIUM_PROFILE", "PAINT_RAL"]);
    expect(
      resolvedProcessRequirementsForType("ALUMINIUM_VOLUME", {
        "volume.finish": "painted",
      }).some((item) => item.processId === "APPLY_SURFACE_FINISH"),
    ).toBe(false);
  });
});
