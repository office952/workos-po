import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import { projectExecutionPlanPreview } from "../execution/preview.js";
import { composeProductProcesses, composeProductProcessesFromTruth } from "../processes/composition.js";
import { freezeAcceptedProductionSnapshot } from "../production/snapshot.js";
import { costEvidence } from "../resources/catalog.js";
import { compileEic } from "../resources/eic.js";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "./acmCassetteNone.js";
import { compileAcceptedProductEvaluation } from "./acceptedEvaluation.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "./compiler.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { runWithProductEvaluationTrace } from "./evaluationTrace.js";
import {
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import type { DraftValues, FormSchema, ProductTemplate } from "./types.js";

const lettersNoneNone: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const lettersPins = [
  { depthMm: "30", eic: 370, commercial: 604.4 },
  { depthMm: "60", eic: 382.5, commercial: 624.82 },
  { depthMm: "80", eic: 395, commercial: 645.23 },
  { depthMm: "100", eic: 407.5, commercial: 665.66 },
] as const;

const acmValues: DraftValues = {
  "root.inscription": "PANOU ACM",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": String(ACM_GOLDEN_DEPTH_MM),
  "face.foldCount": "2",
};

const QUOTE_HASH_PIN =
  "35e562617d45f4caabb4f582b9c6385e6be5c1edc345c1dd31d688b25add2f27";

function confirmedTruth(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
) {
  const definition = compileDefinition(template, schema, {
    templateCode: template.code,
    values,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error(`expected confirmed truth for ${template.code}`);
  }
  return truth;
}

function evaluateAccepted(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
) {
  return compileAcceptedProductEvaluation({
    truth: confirmedTruth(template, schema, values),
    template,
    formSchema: schema,
    labels: seededDisplayLabelCatalog(),
    costEvidenceRows: costEvidence,
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

describe("accepted product evaluation", () => {
  it("evaluates components and compiles EIC once for LETTERS 60 mm", () => {
    const { result, trace } = runWithProductEvaluationTrace(() =>
      evaluateAccepted(
        frontlitPlexiAl06Template,
        frontlitPlexiAl06FormSchema,
        lettersNoneNone,
      ),
    );
    expect(trace.evaluateProductComponents).toBe(1);
    expect(trace.compileEic).toBe(1);
    expect(result.eic.total).toBe(382.5);
    expect(result.eic.completeness).toBe("COMPLETE");
    expect(result.composition.costCompleteness).toBe("COMPLETE");
    expect(result.composition.costCompletenessLabel).toBe(
      "Complete pentru configurația curentă",
    );
    expect(projectCommercialPrice(result.eic).grossPrice).toBe(624.82);
  });

  it("projects execution preview from the same evaluation without more compiles", () => {
    const compiled = evaluateAccepted(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersNoneNone,
    );
    const { result, trace } = runWithProductEvaluationTrace(() =>
      projectExecutionPlanPreview(
        compiled.truth,
        compiled.aggregate,
        compiled.composition,
        compiled.eic,
      ),
    );
    expect(trace.evaluateProductComponents).toBe(0);
    expect(trace.compileEic).toBe(0);
    expect(result.summary.internalCostTotal).toBe(382.5);
  });

  it.each(lettersPins)(
    "keeps LETTERS none/none $depthMm mm pins",
    ({ depthMm, eic, commercial }) => {
      const compiled = evaluateAccepted(
        frontlitPlexiAl06Template,
        frontlitPlexiAl06FormSchema,
        { ...lettersNoneNone, "volume.depthMm": depthMm },
      );
      expect(compiled.eic.total).toBe(eic);
      expect(projectCommercialPrice(compiled.eic).grossPrice).toBe(commercial);
    },
  );

  it("uses the same generic pipeline for ACM cassette", () => {
    const { result, trace } = runWithProductEvaluationTrace(() =>
      evaluateAccepted(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues),
    );
    expect(result.template.code).toBe(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(trace.evaluateProductComponents).toBe(1);
    expect(trace.compileEic).toBe(1);
    expect(result.eic.completeness).toBe("COMPLETE");
    expect(result.eic.total).toBeCloseTo(72.644, 6);
    expect(projectCommercialPrice(result.eic).grossPrice).toBe(118.66);
  });

  it("keeps the canonical 60 mm Quote content-hash pin", () => {
    const compiled = evaluateAccepted(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersNoneNone,
    );
    const frozen = freezeQuoteSnapshot(
      compiled.truth,
      compiled.aggregate,
      compiled.composition,
      compiled.eic,
      projectCommercialPrice(compiled.eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(frozen.snapshot.contentHash).toBe(QUOTE_HASH_PIN);
  });

  it("freezes the accepted production snapshot from the same evaluation", () => {
    const compiled = evaluateAccepted(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersNoneNone,
    );
    const snapshot = freezeAcceptedProductionSnapshot(
      compiled.truth,
      compiled.aggregate,
      compiled.composition,
      compiled.eic,
      { costEvidenceRows: compiled.costEvidenceRows },
    );
    expect(snapshot.eic.total).toBe(382.5);
    expect(snapshot.eic.completeness).toBe("COMPLETE");
  });

  it("keeps generic draft process composition usable independently", () => {
    const { result, trace } = runWithProductEvaluationTrace(() =>
      composeProductProcesses(frontlitPlexiAl06Template, lettersNoneNone, {
        costEvidenceRows: costEvidence,
      }),
    );
    expect(trace.evaluateProductComponents).toBe(1);
    expect(trace.compileEic).toBe(1);
    expect(result.costCompleteness).toBe("COMPLETE");
  });

  it("has no product-code business forks in the evaluation pipeline", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const accepted = readFileSync(join(here, "acceptedEvaluation.ts"), "utf8");
    const compiler = readFileSync(join(here, "compiler.ts"), "utf8");
    expect(accepted).not.toMatch(/PRD-LETTERS|PRD-ACM|CANONICAL_PRODUCT/);
    expect(compiler).not.toMatch(/PRD-LETTERS|PRD-ACM|CANONICAL_PRODUCT/);
  });

  it("reports before/after medians for the same LETTERS 60 mm compile", () => {
    const warmup = 25;
    const iterations = 100;
    const truth = confirmedTruth(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersNoneNone,
    );
    const labels = seededDisplayLabelCatalog();
    const legacyAcceptedCompile = () => {
      const aggregate = compileAggregate(
        truth,
        frontlitPlexiAl06Template,
        frontlitPlexiAl06FormSchema,
        labels,
      );
      const composition = composeProductProcessesFromTruth(
        truth,
        frontlitPlexiAl06Template,
      );
      return compileEic(aggregate, composition, costEvidence);
    };
    const nextAcceptedCompile = () =>
      compileAcceptedProductEvaluation({
        truth,
        template: frontlitPlexiAl06Template,
        formSchema: frontlitPlexiAl06FormSchema,
        labels,
        costEvidenceRows: costEvidence,
      });

    for (let index = 0; index < warmup; index += 1) {
      legacyAcceptedCompile();
      nextAcceptedCompile();
    }
    const beforeSamples: number[] = [];
    const afterSamples: number[] = [];
    for (let index = 0; index < iterations; index += 1) {
      const beforeStarted = performance.now();
      legacyAcceptedCompile();
      beforeSamples.push(performance.now() - beforeStarted);
      const afterStarted = performance.now();
      nextAcceptedCompile();
      afterSamples.push(performance.now() - afterStarted);
    }
    const medianBefore = median(beforeSamples);
    const medianAfter = median(afterSamples);
    if (process.env.PERF_1_BENCH === "1") {
      console.info(
        JSON.stringify({
          warmup,
          iterations,
          medianBefore,
          medianAfter,
        }),
      );
    }
    expect(medianBefore).toBeGreaterThan(0);
    expect(medianAfter).toBeGreaterThan(0);
    expect(beforeSamples).toHaveLength(iterations);
    expect(afterSamples).toHaveLength(iterations);
  });
});
