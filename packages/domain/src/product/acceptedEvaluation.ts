import {
  applyCompositionCostCompleteness,
  composeProductProcessTopology,
  type ProductProcessComposition,
} from "../processes/composition.js";
import type { CostEvidence } from "../resources/catalog.js";
import { compileEic, type EicResult } from "../resources/eic.js";
import { compileAggregate } from "./compiler.js";
import {
  evaluateProductComponents,
  type ComponentEvaluation,
} from "./componentEvaluation.js";
import type { DisplayLabelCatalog } from "./displayMetadata.js";
import type {
  FormSchema,
  ProductAggregate,
  ProductTemplate,
  ProductTruth,
} from "./types.js";

export type AcceptedProductEvaluation = {
  readonly template: ProductTemplate;
  readonly formSchema: FormSchema;
  readonly truth: ProductTruth;
  readonly evaluations: readonly ComponentEvaluation[];
  readonly aggregate: ProductAggregate;
  readonly composition: ProductProcessComposition;
  readonly eic: EicResult;
  readonly costEvidenceRows: readonly CostEvidence[];
};

export function compileAcceptedProductEvaluation(input: {
  readonly truth: ProductTruth;
  readonly template: ProductTemplate;
  readonly formSchema: FormSchema;
  readonly labels: DisplayLabelCatalog;
  readonly costEvidenceRows: readonly CostEvidence[];
}): AcceptedProductEvaluation {
  if (input.truth.templateCode !== input.template.code) {
    throw new Error(`accepted_evaluation_template_mismatch:${input.truth.templateCode}`);
  }

  const evaluations = evaluateProductComponents({
    template: input.template,
    selectedComponentIds: input.truth.selectedComponentIds,
    values: input.truth.values,
    measurements: input.truth.measurements,
  });
  const aggregate = compileAggregate(
    input.truth,
    input.template,
    input.formSchema,
    input.labels,
    { evaluations },
  );
  const topology = composeProductProcessTopology(input.template, input.truth.values, {
    measurements: input.truth.measurements,
    evaluations,
  });
  const eic = compileEic(aggregate, topology, input.costEvidenceRows);
  return {
    template: input.template,
    formSchema: input.formSchema,
    truth: input.truth,
    evaluations,
    aggregate,
    composition: applyCompositionCostCompleteness(topology, eic),
    eic,
    costEvidenceRows: input.costEvidenceRows,
  };
}
