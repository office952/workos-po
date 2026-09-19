import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import { compileEic } from "../resources/eic.js";
import { compileAggregate, compileDefinition, confirmReviewedDefinition } from "./compiler.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { runWithProductEvaluationTrace } from "./evaluationTrace.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import type { DraftValues } from "./types.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedTruth(values: DraftValues = readyValues) {
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
  return truth;
}

describe("accepted-path baseline before PERF_1 orchestration", () => {
  it("proves the current compileAcceptedProduct sequence evaluates twice", () => {
    const truth = confirmedTruth();
    const labels = seededDisplayLabelCatalog();
    const { result, trace } = runWithProductEvaluationTrace(() => {
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
      const eic = compileEic(aggregate, composition);
      return { aggregate, composition, eic };
    });

    expect(trace.evaluateProductComponents).toBe(2);
    expect(trace.compileEic).toBe(2);
    expect(result.eic.total).toBe(382.5);
    expect(result.eic.completeness).toBe("COMPLETE");
    expect(result.composition.costCompleteness).toBe("COMPLETE");
  });
});
