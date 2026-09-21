import { describe, expect, it } from "vitest";
import { presentFormulaAst, presentFormulasAdmin } from "./formulasAdapter";

describe("formulasAdapter", () => {
  it("presents a valid admin payload and rejects unknown AST nodes", () => {
    const presented = presentFormulasAdmin({
      canEdit: true,
      resolutionOk: true,
      guidance: "Ghid",
      formulas: [
        {
          formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
          resultId: "ledModuleQuantity",
          typeId: "LIGHTING_FRONT_LED",
          label: "Cantitate module LED",
          description: "Descriere",
          resultUnit: "buc",
          resultValueKind: "COUNT",
          allowedOperators: ["DIVIDE", "CEIL"],
          allowedReferences: {
            configSettingIds: ["ledPitchMm"],
            jobInputIds: ["confirmedPerimeterMm"],
            formulaIds: [],
          },
          expression: {
            kind: "CEIL",
            operand: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
          },
          explanation: "explicație",
          source: "PLATFORM_STARTER",
          sourceLabel: "Valoare de pornire",
          version: 1,
          status: "ACTIVE",
          statusLabel: "Activă",
          effectiveFrom: "2026-09-21T00:00:00.000Z",
        },
      ],
      history: [
        {
          formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
          resultId: "ledModuleQuantity",
          version: 1,
          status: "ACTIVE",
          statusLabel: "Activă",
          source: "PLATFORM_STARTER",
          sourceLabel: "Valoare de pornire",
          createdAt: "2026-09-21T00:00:00.000Z",
          effectiveFrom: "2026-09-21T00:00:00.000Z",
        },
      ],
    });
    expect(presented?.formulas[0]?.expression).toEqual({
      kind: "CEIL",
      operand: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
    });
    expect(presented?.history).toHaveLength(1);
    expect(presentFormulaAst({ kind: "EVAL", code: "1+1" })).toBeNull();
    expect(presentFormulasAdmin(null)).toBeNull();
  });
});
