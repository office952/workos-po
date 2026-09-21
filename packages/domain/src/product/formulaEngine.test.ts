import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_AST_DEPTH,
  MAX_AST_NODES,
  countFormulaAstNodes,
  formulaAstDepth,
  formulaAstEquals,
  formulaAstIdentity,
  formulaDependencyGraphHasCycle,
  parseFormulaAst,
  parseFormulaExpressionJson,
  serializeFormulaExpression,
  type FormulaAst,
} from "./formulaAst.js";
import {
  LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
  LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
  LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID,
  LIGHTING_TOTAL_LED_LOAD_FORMULA_ID,
  LIGHTING_TOTAL_LED_LOAD_STARTER_AST,
  explainFormulaAst,
  findFormulaDefinition,
  lightingFrontLedFormulaDefinitions,
  requiredFormulaDefinitions,
  validateFormulaAstAgainstDefinition,
} from "./formulaDefinition.js";
import {
  addFormulaValues,
  ceilFormulaValue,
  divideFormulaValues,
  multiplyFormulaValues,
  subtractFormulaValues,
} from "./formulaValue.js";
import {
  createPlatformStarterFormulaVersions,
  persistedFormulaVersionFromRecord,
  planFormulaSave,
  type FormulaVersionRecord,
  type PersistedFormulaVersion,
} from "./formulaVersion.js";
import {
  FORMULAS_EMPTY_REASON,
  FORMULAS_INACTIVE,
  FORMULAS_INVALID,
  resolveOrganizationFormulas,
  starterResolvedFormulas,
} from "./resolveFormulas.js";
import { evaluateFormulaDag } from "./evaluateFormulas.js";
import {
  ledModuleQuantityFromPerimeter,
  requiredPsuCapacityW,
} from "./lighting.js";
import { listTypeTechnicalSettings } from "./technicalSettings.js";

const formulaDir = dirname(fileURLToPath(import.meta.url));
const formulaSources = [
  "formulaAst.ts",
  "formulaDefinition.ts",
  "formulaValue.ts",
  "formulaVersion.ts",
  "resolveFormulas.ts",
  "evaluateFormulas.ts",
].map((name) => readFileSync(join(formulaDir, name), "utf8"));

const confirmedPerimeter = {
  componentId: "VOLUME",
  fieldId: "volume.confirmedPerimeterMm",
  value: 12500,
  unit: "mm" as const,
  source: "OPERATOR_MANUAL" as const,
  confirmed: true as const,
};

function starters(now = "2026-09-21T00:00:00.000Z"): FormulaVersionRecord[] {
  return createPlatformStarterFormulaVersions({
    now,
    rowIdFor: (formulaId) => `fv:${formulaId}:test`,
  });
}

function nestCeil(depth: number): FormulaAst {
  if (depth <= 1) {
    return { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" };
  }
  return { kind: "CEIL", operand: nestCeil(depth - 1) };
}

describe("formula definitions and starters", () => {
  it("owns the three lighting derived results", () => {
    expect(requiredFormulaDefinitions()).toHaveLength(3);
    expect(lightingFrontLedFormulaDefinitions.map((item) => item.formulaId)).toEqual([
      LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
      LIGHTING_TOTAL_LED_LOAD_FORMULA_ID,
      LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID,
    ]);
    expect(findFormulaDefinition(LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID)?.resultId).toBe(
      "ledModuleQuantity",
    );
    expect(explainFormulaAst(LIGHTING_LED_MODULE_QUANTITY_STARTER_AST)).toMatch(/rotunjire/);
  });

  it("creates platform starter versions from the starter ASTs", () => {
    const rows = starters();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.source === "PLATFORM_STARTER")).toBe(true);
    expect(rows.every((row) => row.status === "ACTIVE")).toBe(true);
    expect(rows.every((row) => row.actorKind === "SYSTEM")).toBe(true);
    expect(formulaAstEquals(rows[0]!.expression, LIGHTING_LED_MODULE_QUANTITY_STARTER_AST)).toBe(
      true,
    );
  });
});

describe("formula AST safety", () => {
  it("rejects invalid JSON, unknown nodes, and unbounded trees", () => {
    expect(parseFormulaExpressionJson("{").ok).toBe(false);
    expect(parseFormulaAst({ kind: "EVAL" }).ok).toBe(false);
    expect(parseFormulaAst(nestCeil(MAX_AST_DEPTH + 1)).ok).toBe(false);
    const wide: FormulaAst = nestCeil(MAX_AST_DEPTH);
    expect(formulaAstDepth(wide)).toBe(MAX_AST_DEPTH);
    expect(parseFormulaAst(wide).ok).toBe(true);
    const many: FormulaAst = {
      kind: "ADD",
      left: nestCeil(8),
      right: nestCeil(8),
    };
    expect(countFormulaAstNodes(many)).toBeGreaterThan(1);
    const tooManyLeaves = Array.from({ length: MAX_AST_NODES }, () => ({
      kind: "NUMERIC_CONSTANT" as const,
      value: 1,
      valueKind: "SCALAR" as const,
    }));
    const packed = tooManyLeaves.reduce<FormulaAst>(
      (left, right) => ({ kind: "ADD", left, right }),
      { kind: "NUMERIC_CONSTANT", value: 0, valueKind: "SCALAR" },
    );
    expect(countFormulaAstNodes(packed)).toBeGreaterThan(MAX_AST_NODES);
    expect(parseFormulaAst(packed).ok).toBe(false);
  });

  it("canonicalizes equivalent ASTs", () => {
    const left = LIGHTING_TOTAL_LED_LOAD_STARTER_AST;
    const right = JSON.parse(serializeFormulaExpression(left)) as FormulaAst;
    expect(formulaAstEquals(left, right)).toBe(true);
    expect(formulaAstIdentity(left)).toBe(formulaAstIdentity(right));
  });
});

describe("formula value semantics", () => {
  it("accepts the lighting dimensional path", () => {
    expect(divideFormulaValues(
      { value: 12500, valueKind: "LENGTH" },
      { value: 100, valueKind: "LENGTH" },
    )).toEqual({ value: 125, valueKind: "SCALAR" });
    expect(ceilFormulaValue({ value: 125.2, valueKind: "SCALAR" })).toEqual({
      value: 126,
      valueKind: "COUNT",
    });
    expect(multiplyFormulaValues(
      { value: 125, valueKind: "COUNT" },
      { value: 0.75, valueKind: "POWER" },
    )).toEqual({ value: 93.75, valueKind: "POWER" });
    expect(divideFormulaValues(
      { value: 25, valueKind: "PERCENT" },
      { value: 100, valueKind: "PERCENT" },
    )).toEqual({ value: 0.25, valueKind: "SCALAR" });
    expect(multiplyFormulaValues(
      { value: 93.75, valueKind: "POWER" },
      { value: 1.25, valueKind: "SCALAR" },
    )).toEqual({ value: 117.1875, valueKind: "POWER" });
  });

  it("rejects incompatible algebra and division by zero", () => {
    expect(addFormulaValues({ value: 1, valueKind: "POWER" }, { value: 1, valueKind: "LENGTH" })).toMatchObject({
      field: "ADD",
    });
    expect(subtractFormulaValues({ value: 1, valueKind: "COUNT" }, { value: 1, valueKind: "POWER" })).toMatchObject({
      field: "SUBTRACT",
    });
    expect(addFormulaValues({ value: 10, valueKind: "POWER" }, { value: 5, valueKind: "POWER" })).toEqual({
      value: 15,
      valueKind: "POWER",
    });
    expect(multiplyFormulaValues({ value: 2, valueKind: "POWER" }, { value: 3, valueKind: "POWER" })).toMatchObject({
      field: "MULTIPLY",
    });
    expect(divideFormulaValues({ value: 10, valueKind: "POWER" }, { value: 0, valueKind: "SCALAR" })).toMatchObject({
      field: "DIVIDE",
    });
    expect(ceilFormulaValue({ value: 2, valueKind: "POWER" })).toMatchObject({ field: "CEIL" });
    expect(parseFormulaAst({ kind: "NUMERIC_CONSTANT", value: Number.NaN, valueKind: "SCALAR" }).ok).toBe(
      false,
    );
  });
});

describe("formula history resolution", () => {
  it("resolves a normal starter history", () => {
    const resolved = resolveOrganizationFormulas(starters().map(persistedFormulaVersionFromRecord));
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.formulas).toHaveLength(3);
    }
  });

  it("fails closed for empty, inactive, invalid, and corrupt rows", () => {
    expect(resolveOrganizationFormulas([])).toMatchObject({
      ok: false,
      error: FORMULAS_INACTIVE,
      reason: FORMULAS_EMPTY_REASON,
    });
    const missingActive = starters().map(persistedFormulaVersionFromRecord).map((row) => ({
      ...row,
      status: "RETIRED",
    }));
    expect(resolveOrganizationFormulas(missingActive)).toMatchObject({
      ok: false,
      error: FORMULAS_INACTIVE,
    });
    const twoActive: PersistedFormulaVersion[] = [
      ...starters().map(persistedFormulaVersionFromRecord),
      {
        ...persistedFormulaVersionFromRecord(starters()[0]!),
        formulaVersionRowId: "dup",
        version: 2,
      },
    ];
    expect(resolveOrganizationFormulas(twoActive)).toMatchObject({
      ok: false,
      error: FORMULAS_INACTIVE,
    });
    const invalidSource: PersistedFormulaVersion[] = starters().map((row, index) =>
      index === 0
        ? { ...persistedFormulaVersionFromRecord(row), source: "LIVE_PLATFORM" }
        : persistedFormulaVersionFromRecord(row),
    );
    expect(resolveOrganizationFormulas(invalidSource)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    const invalidActor: PersistedFormulaVersion[] = starters().map((row, index) =>
      index === 0
        ? {
            ...persistedFormulaVersionFromRecord(row),
            actorKind: "SYSTEM",
            actorUserId: "user-1",
            actorSystemId: "sys",
          }
        : persistedFormulaVersionFromRecord(row),
    );
    expect(resolveOrganizationFormulas(invalidActor)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    const unknownId: PersistedFormulaVersion[] = [
      {
        ...persistedFormulaVersionFromRecord(starters()[0]!),
        formulaId: "ACM.something",
      },
    ];
    expect(resolveOrganizationFormulas(unknownId)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    const wrongType: PersistedFormulaVersion[] = [
      {
        ...persistedFormulaVersionFromRecord(starters()[0]!),
        componentTypeId: "ACM_CASSETTE_BODY",
      },
    ];
    expect(resolveOrganizationFormulas(wrongType)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    const wrongResult: PersistedFormulaVersion[] = [
      {
        ...persistedFormulaVersionFromRecord(starters()[0]!),
        resultId: "selectedPsu",
      },
    ];
    expect(resolveOrganizationFormulas(wrongResult)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    const badJson: PersistedFormulaVersion[] = [
      {
        ...persistedFormulaVersionFromRecord(starters()[0]!),
        expressionJson: "{not-json",
      },
    ];
    expect(resolveOrganizationFormulas(badJson)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
  });

  it("resolves retired history plus one active organization version", () => {
    const starterRows = starters().map(persistedFormulaVersionFromRecord);
    const first = starterRows[0]!;
    const history = [
      { ...first, status: "RETIRED" },
      {
        ...first,
        formulaVersionRowId: "fv:quantity:v2",
        version: 2,
        status: "ACTIVE",
        source: "ORGANIZATION",
        actorKind: "USER",
        actorUserId: "owner-1",
        actorSystemId: null,
        supersedesVersion: 1,
      },
      ...starterRows.slice(1),
    ];
    const resolved = resolveOrganizationFormulas(history);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(
        resolved.formulas.find((item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID),
      ).toMatchObject({ version: 2, source: "ORGANIZATION", status: "ACTIVE" });
    }
  });
});

describe("formula save planning", () => {
  it("creates an organization version and reports alreadyApplied", () => {
    const existing = starters();
    const structural: FormulaAst = {
      kind: "CEIL",
      operand: {
        kind: "DIVIDE",
        left: {
          kind: "DIVIDE",
          left: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
          right: { kind: "CONFIG_REF", settingId: "ledPitchMm" },
        },
        right: { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" },
      },
    };
    expect(
      validateFormulaAstAgainstDefinition(
        findFormulaDefinition(LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID)!,
        structural,
      ),
    ).toHaveLength(0);
    const planned = planFormulaSave(
      existing,
      [{ formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID, expression: structural }],
      { kind: "USER", userId: "owner-1" },
      { now: "2026-09-21T01:00:00.000Z", rowIdFor: (id) => `fv:${id}:v2` },
    );
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.alreadyApplied).toBe(false);
      expect(planned.next[0]?.source).toBe("ORGANIZATION");
      expect(planned.next[0]?.version).toBe(2);
      expect(planned.retire).toEqual([
        { formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID, version: 1 },
      ]);
    }
    const same = planFormulaSave(
      existing,
      [
        {
          formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
          expression: LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
        },
      ],
      { kind: "USER", userId: "owner-1" },
      { now: "2026-09-21T01:00:00.000Z", rowIdFor: (id) => `fv:${id}:v2` },
    );
    expect(same).toMatchObject({ ok: true, alreadyApplied: true });
  });

  it("rejects unknown ids, unauthorized refs, and invalid actors", () => {
    const existing = starters();
    expect(
      planFormulaSave(
        existing,
        [{ formulaId: "ACM.x", expression: LIGHTING_LED_MODULE_QUANTITY_STARTER_AST }],
        { kind: "USER", userId: "owner-1" },
        { now: "2026-09-21T01:00:00.000Z", rowIdFor: (id) => id },
      ).ok,
    ).toBe(false);
    expect(
      planFormulaSave(
        existing,
        [
          {
            formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
            expression: {
              kind: "CONFIG_REF",
              settingId: "ledModulePowerW",
            },
          },
        ],
        { kind: "USER", userId: "owner-1" },
        { now: "2026-09-21T01:00:00.000Z", rowIdFor: (id) => id },
      ).ok,
    ).toBe(false);
    expect(
      planFormulaSave(
        existing,
        [
          {
            formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
            expression: LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
          },
        ],
        { kind: "USER", userId: "" },
        { now: "2026-09-21T01:00:00.000Z", rowIdFor: (id) => id },
      ).ok,
    ).toBe(false);
  });
});

describe("formula evaluation", () => {
  it("reproduces current lighting starter outputs", () => {
    const evaluated = evaluateFormulaDag({
      formulas: starterResolvedFormulas(),
      technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
      measurements: [confirmedPerimeter],
    });
    expect(evaluated.ok).toBe(true);
    if (!evaluated.ok) {
      return;
    }
    const quantity = evaluated.results.find((item) => item.resultId === "ledModuleQuantity");
    const load = evaluated.results.find((item) => item.resultId === "totalLedLoadW");
    const capacity = evaluated.results.find((item) => item.resultId === "requiredPsuCapacityW");
    expect(quantity?.value).toBe(ledModuleQuantityFromPerimeter(12500, 100));
    expect(load?.value).toBe(125 * 0.75);
    expect(capacity?.value).toBe(requiredPsuCapacityW(93.75, 25));
  });

  it("rejects missing refs, division by zero, cycles, and unexpected result types", () => {
    const formulas = starterResolvedFormulas();
    expect(
      evaluateFormulaDag({
        formulas,
        technicalSettings: [],
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);
    expect(
      evaluateFormulaDag({
        formulas,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [],
      }).ok,
    ).toBe(false);
    const zeroDivide = formulas.map((item) =>
      item.formulaId === LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID
        ? {
            ...item,
            expression: {
              kind: "DIVIDE" as const,
              left: { kind: "FORMULA_REF" as const, formulaId: LIGHTING_TOTAL_LED_LOAD_FORMULA_ID },
              right: { kind: "NUMERIC_CONSTANT" as const, value: 0, valueKind: "PERCENT" as const },
            },
          }
        : item,
    );
    expect(
      evaluateFormulaDag({
        formulas: zeroDivide,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);

    const selfCycle = formulas.map((item) =>
      item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID
        ? {
            ...item,
            expression: {
              kind: "FORMULA_REF" as const,
              formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
            },
          }
        : item,
    );
    expect(formulaDependencyGraphHasCycle(selfCycle)).toBe(true);
    expect(
      evaluateFormulaDag({
        formulas: selfCycle,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);

    const twoNode = formulas.map((item) => {
      if (item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID) {
        return {
          ...item,
          expression: {
            kind: "FORMULA_REF" as const,
            formulaId: LIGHTING_TOTAL_LED_LOAD_FORMULA_ID,
          },
        };
      }
      if (item.formulaId === LIGHTING_TOTAL_LED_LOAD_FORMULA_ID) {
        return {
          ...item,
          expression: {
            kind: "FORMULA_REF" as const,
            formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
          },
        };
      }
      return item;
    });
    expect(formulaDependencyGraphHasCycle(twoNode)).toBe(true);

    const longer = formulas.map((item) => {
      if (item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID) {
        return {
          ...item,
          expression: {
            kind: "FORMULA_REF" as const,
            formulaId: LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID,
          },
        };
      }
      return item;
    });
    expect(formulaDependencyGraphHasCycle(longer)).toBe(true);

    const wrongKind = formulas.map((item) =>
      item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID
        ? {
            ...item,
            expression: {
              kind: "DIVIDE" as const,
              left: { kind: "JOB_REF" as const, inputId: "confirmedPerimeterMm" },
              right: { kind: "CONFIG_REF" as const, settingId: "ledPitchMm" },
            },
          }
        : item,
    );
    expect(
      evaluateFormulaDag({
        formulas: wrongKind,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);

    const missingFormulaRef = formulas.filter(
      (item) => item.formulaId !== LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
    );
    expect(
      evaluateFormulaDag({
        formulas: missingFormulaRef,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);

    const infinite = formulas.map((item) =>
      item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID
        ? {
            ...item,
            expression: {
              kind: "CEIL" as const,
              operand: {
                kind: "DIVIDE" as const,
                left: { kind: "NUMERIC_CONSTANT" as const, value: 1, valueKind: "SCALAR" as const },
                right: { kind: "NUMERIC_CONSTANT" as const, value: 0, valueKind: "SCALAR" as const },
              },
            },
          }
        : item,
    );
    expect(
      evaluateFormulaDag({
        formulas: infinite,
        technicalSettings: listTypeTechnicalSettings("LIGHTING_FRONT_LED"),
        measurements: [confirmedPerimeter],
      }).ok,
    ).toBe(false);
  });
});

describe("formula static safety", () => {
  it("does not introduce executable expression evaluation", () => {
    const joined = formulaSources.join("\n");
    expect(joined).not.toMatch(/\beval\s*\(/);
    expect(joined).not.toMatch(/new Function\s*\(/);
    expect(joined).not.toMatch(/child_process/);
    expect(joined).not.toMatch(/dynamic import/);
  });
});
