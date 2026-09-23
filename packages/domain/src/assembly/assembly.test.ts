import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { freezeQuoteSnapshot, type FrozenCommercialOffer } from "../commercial/quoteSnapshot.js";
import type { QuoteCommercialTerms } from "../commercial/quoteTerms.js";
import { projectPlanningWorkload } from "../execution/workload.js";
import { codeDefaultProductEnablement } from "../product/productEnablement.js";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "../product/acmCassetteNone.js";
import { compileAcceptedProductEvaluation } from "../product/acceptedEvaluation.js";
import {
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import type { DraftValues, FormSchema, ProductTemplate } from "../product/types.js";
import { forexBackContract } from "../product/back.js";
import { costEvidence } from "../resources/catalog.js";
import { INSPECT_FINISHED_LETTER_ID, PACK_PRODUCT_ID } from "../processes/catalog.js";
import {
  acknowledgeAssemblyReview,
  attachConfirmedChild,
  confirmAssembly,
  createAssemblyDefinition,
  freezeAssemblyQuote,
  acceptAssemblyQuote,
  hashProductAggregate,
  hashProductTruth,
  materializeAssemblyExecutionPlan,
  MOUNT_LETTERS_ON_PANEL_ID,
  INSPECT_FINISHED_ASSEMBLY_ID,
  presentAssemblyReview,
  projectAssemblyProduction,
  setAssemblyTaskPlannedEffort,
  type ConfirmedChildProduct,
} from "./index.js";

const lettersValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues: DraftValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

const ORG = "org-assembly";
const OTHER_ORG = "org-other";

function evaluate(template: ProductTemplate, schema: FormSchema, values: DraftValues) {
  const definition = compileDefinition(template, schema, {
    templateCode: template.code,
    values,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("child truth was not confirmed");
  }
  return compileAcceptedProductEvaluation({
    truth,
    template,
    formSchema: schema,
    labels: seededDisplayLabelCatalog(),
    costEvidenceRows: costEvidence,
    formulaVersionsForType: starterFormulaVersionsForType,
  });
}

function confirmedChild(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
  truthId: string,
  organizationId = ORG,
  quoteTerms?: QuoteCommercialTerms,
): ConfirmedChildProduct & {
  childQuoteSnapshotId: string;
  childQuoteContentHash: string;
  commercial: FrozenCommercialOffer;
} {
  const compiled = evaluate(template, schema, values);
  const price = projectCommercialPrice(compiled.eic, DEFAULT_COMMERCIAL_POLICY, quoteTerms);
  const frozen = freezeQuoteSnapshot(
    compiled.truth,
    compiled.aggregate,
    compiled.composition,
    compiled.eic,
    price,
    { createdAt: "2026-09-23T10:00:00.000Z" },
  );
  if (!frozen.ok) {
    throw new Error(frozen.error);
  }
  return {
    truthId,
    organizationId,
    productCode: compiled.truth.templateCode,
    templateCode: compiled.truth.templateCode,
    templateVersion: compiled.truth.templateVersion,
    familyId: compiled.truth.familyId,
    reviewId: compiled.truth.reviewId,
    truthHash: hashProductTruth(compiled.truth),
    aggregateHash: hashProductAggregate(compiled.aggregate),
    confirmedAt: compiled.truth.confirmedAt,
    productLabel: compiled.aggregate.productLabel,
    inscription: compiled.aggregate.inscription,
    childQuoteSnapshotId: frozen.snapshot.quoteSnapshotId,
    childQuoteContentHash: frozen.snapshot.contentHash,
    commercial: frozen.snapshot.commercial,
    productionInput: frozen.snapshot.productionInput,
    eicTotal: compiled.eic.total,
    eicCurrency: "EUR",
    eicCompleteness: compiled.eic.completeness,
    truth: compiled.truth,
  };
}

function readyAssembly() {
  const created = createAssemblyDefinition({
    assemblyId: "asm-1",
    organizationId: ORG,
    requestId: "req-1",
    customerId: "cus-1",
    resolution: codeDefaultProductEnablement(),
    createdAt: "2026-09-23T10:00:00.000Z",
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  const acm = confirmedChild(
    acmCassetteNoneTemplate,
    acmCassetteNoneFormSchema,
    acmValues,
    "child-acm",
  );
  const letters = confirmedChild(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    lettersValues,
    "child-letters",
  );
  const withAcm = attachConfirmedChild(created.definition, acm, "SUPPORT_PANEL", created.definition.createdAt);
  if (!withAcm.ok) {
    throw new Error(withAcm.error);
  }
  const withLetters = attachConfirmedChild(withAcm.definition, letters, "SIGNAGE_LETTERS", created.definition.createdAt);
  if (!withLetters.ok) {
    throw new Error(withLetters.error);
  }
  return { definition: withLetters.definition, acm, letters };
}

describe("product assembly v1", () => {
  it("accepts one ACM panel and one letters child", () => {
    const ready = readyAssembly();
    const confirmed = confirmAssembly(
      ready.definition,
      [ready.acm, ready.letters],
      [],
      "2026-09-23T11:00:00.000Z",
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      return;
    }
    expect(confirmed.truth.members).toHaveLength(2);
    expect(confirmed.truth.relations).toEqual([
      {
        relationId: "relation:letters-on-acm-panel",
        kind: "LETTERS_ON_ACM_PANEL",
        sourceMemberId: "member:signage-letters",
        targetMemberId: "member:support-panel",
      },
    ]);
    expect(confirmed.aggregate.childAggregates).toHaveLength(2);
    expect(confirmed.aggregate.assemblyDemand).toEqual([]);
    expect(JSON.stringify(confirmed.truth)).not.toContain("childQuoteSnapshotId");
    expect(JSON.stringify(confirmed.truth)).not.toContain("FOREX_BACK");
    expect(JSON.stringify(confirmed.truth)).not.toContain("confirmedAreaMm2");
  });

  it("rejects a second letters role, a foreign organization, and a disabled product", () => {
    const { definition, letters } = readyAssembly();
    const foreign = { ...letters, organizationId: OTHER_ORG, truthId: "child-foreign" };
    expect(attachConfirmedChild(definition, foreign, "SIGNAGE_LETTERS", definition.updatedAt).ok).toBe(false);
    const wrong = attachConfirmedChild(definition, letters, "SUPPORT_PANEL", definition.updatedAt);
    expect(wrong.ok).toBe(false);
    const unavailable = createAssemblyDefinition({
      assemblyId: "asm-disabled",
      organizationId: ORG,
      requestId: null,
      customerId: null,
      resolution: {
        ok: true,
        source: "ORGANIZATION",
        version: 2,
        enabledTemplateCodes: [CANONICAL_PRODUCT_CODE],
        entries: [],
        guidance: "",
      },
      createdAt: "2026-09-23T10:00:00.000Z",
    });
    expect(unavailable.ok).toBe(false);
  });

  it("keeps a confirmed assembly immutable when letters are reconfirmed", () => {
    const ready = readyAssembly();
    const first = confirmAssembly(ready.definition, [ready.acm, ready.letters], [], "2026-09-23T11:00:00.000Z");
    if (!first.ok) {
      throw new Error(first.error);
    }
    const frozen = structuredClone(first.truth);
    const changed = confirmedChild(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { ...lettersValues, "root.inscription": "NOU" },
      "child-letters-2",
    );
    const stale = attachConfirmedChild(first.definition, changed, "SIGNAGE_LETTERS", "2026-09-23T12:00:00.000Z");
    if (!stale.ok) {
      throw new Error(stale.error);
    }
    expect(stale.definition.status).toBe("STALE");
    expect(first.truth).toEqual(frozen);
    const blocked = confirmAssembly(stale.definition, [ready.acm, changed], [first.truth], "2026-09-23T12:10:00.000Z");
    expect(blocked.ok).toBe(false);
    const reviewed = acknowledgeAssemblyReview(stale.definition, "2026-09-23T12:20:00.000Z");
    if (!reviewed.ok) {
      throw new Error(reviewed.error);
    }
    const second = confirmAssembly(reviewed.definition, [ready.acm, changed], [first.truth], "2026-09-23T12:30:00.000Z");
    if (!second.ok) {
      throw new Error(second.error);
    }
    expect(second.truth.contentHash).not.toBe(first.truth.contentHash);
    expect(first.truth).toEqual(frozen);
    expect(changed.truth.values["root.inscription"]).toBe("NOU");
    expect(ready.letters.truth.values["root.inscription"]).toBe("WORKOS");
  });

  it("keeps the same technical truth when only the child quote changes", () => {
    const ready = readyAssembly();
    const repriced = confirmedChild(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      lettersValues,
      ready.letters.truthId,
      ORG,
      { markupPercent: 80, discountPercent: 0, adjustmentAmount: 0 },
    );
    expect(repriced.truthHash).toBe(ready.letters.truthHash);
    expect(repriced.aggregateHash).toBe(ready.letters.aggregateHash);
    expect(repriced.childQuoteContentHash).not.toBe(ready.letters.childQuoteContentHash);
    expect(repriced.commercial.grossPrice).not.toBe(ready.letters.commercial.grossPrice);

    const first = confirmAssembly(
      ready.definition,
      [ready.acm, ready.letters],
      [],
      "2026-09-23T11:00:00.000Z",
    );
    const second = confirmAssembly(
      ready.definition,
      [ready.acm, repriced],
      [],
      "2026-09-23T11:05:00.000Z",
    );
    if (!first.ok || !second.ok) {
      throw new Error("technical confirm failed");
    }
    expect(second.truth.contentHash).toBe(first.truth.contentHash);
    expect(JSON.stringify(first.truth)).not.toContain(ready.letters.childQuoteSnapshotId);

    const reattached = attachConfirmedChild(
      first.definition,
      repriced,
      "SIGNAGE_LETTERS",
      "2026-09-23T11:06:00.000Z",
    );
    if (!reattached.ok) {
      throw new Error(reattached.error);
    }
    expect(reattached.definition.status).toBe("CONFIRMED");

    const quoteA = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-c1",
      truth: first.truth,
      children: [ready.acm, ready.letters],
      createdAt: "2026-09-23T11:10:00.000Z",
    });
    const quoteB = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-c2",
      truth: first.truth,
      children: [ready.acm, repriced],
      createdAt: "2026-09-23T11:10:00.000Z",
    });
    if (!quoteA.ok || !quoteB.ok) {
      throw new Error("quote freeze failed");
    }
    expect(quoteA.quote.contentHash).not.toBe(quoteB.quote.contentHash);
    expect(quoteA.quote.totals.grossPrice).not.toBe(quoteB.quote.totals.grossPrice);
    expect(quoteA.quote.members.find((item) => item.role === "SIGNAGE_LETTERS")?.childQuoteSnapshotId).toBe(
      ready.letters.childQuoteSnapshotId,
    );
    expect(quoteB.quote.members.find((item) => item.role === "SIGNAGE_LETTERS")?.childQuoteContentHash).toBe(
      repriced.childQuoteContentHash,
    );

    const withoutCommercial: ConfirmedChildProduct = {
      ...ready.letters,
      childQuoteSnapshotId: null,
      childQuoteContentHash: null,
      commercial: null,
    };
    const technical = confirmAssembly(
      ready.definition,
      [ready.acm, withoutCommercial],
      [],
      "2026-09-23T11:00:00.000Z",
    );
    expect(technical.ok).toBe(true);
    if (!technical.ok) {
      return;
    }
    expect(technical.truth.contentHash).toBe(first.truth.contentHash);
    const blockedQuote = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-missing",
      truth: technical.truth,
      children: [ready.acm, withoutCommercial],
      createdAt: "2026-09-23T11:10:00.000Z",
    });
    expect(blockedQuote.ok).toBe(false);
    if (!blockedQuote.ok) {
      expect(blockedQuote.error).toBe("incomplete_commercial");
    }
  });

  it("hashes the same assembly twice to the same truth", () => {
    const ready = readyAssembly();
    const left = confirmAssembly(ready.definition, [ready.acm, ready.letters], [], "2026-09-23T11:00:00.000Z");
    const right = confirmAssembly(ready.definition, [ready.acm, ready.letters], [], "2026-09-23T11:05:00.000Z");
    if (!left.ok || !right.ok) {
      throw new Error("confirm failed");
    }
    expect(left.truth.contentHash).toBe(right.truth.contentHash);
  });

  it("sums child commercial totals without a second markup", () => {
    const ready = readyAssembly();
    const confirmed = confirmAssembly(ready.definition, [ready.acm, ready.letters], [], "2026-09-23T11:00:00.000Z");
    if (!confirmed.ok) {
      throw new Error(confirmed.error);
    }
    const quote = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-1",
      truth: confirmed.truth,
      children: [ready.acm, ready.letters],
      createdAt: "2026-09-23T11:10:00.000Z",
    });
    if (!quote.ok) {
      throw new Error(quote.error);
    }
    const net = round(ready.acm.commercial.netPrice + ready.letters.commercial.netPrice);
    const vat = round(ready.acm.commercial.vatAmount + ready.letters.commercial.vatAmount);
    const gross = round(ready.acm.commercial.grossPrice + ready.letters.commercial.grossPrice);
    expect(quote.quote.totals).toEqual({
      netPrice: net,
      vatAmount: vat,
      grossPrice: gross,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(quote.quote.relationCommercialPrice).toBeNull();
    const markedAgain = projectCommercialPrice({
      total: quote.quote.totals.netPrice,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(markedAgain.grossPrice).not.toBe(quote.quote.totals.grossPrice);
    const order = acceptAssemblyQuote({
      orderSnapshotId: "asmo-1",
      quote: quote.quote,
      children: [ready.acm, ready.letters],
      createdAt: "2026-09-23T11:20:00.000Z",
    });
    if (!order.ok) {
      throw new Error(order.error);
    }
    expect(order.order.sourceQuoteContentHash).toBe(quote.quote.contentHash);
    expect(order.order.children[0]?.productionInput.contentHash).toBe(
      ready.definition.members[0] ? childProductionHash(ready, order.order.children[0].truthId) : "",
    );
    const production = projectAssemblyProduction(order.order, {
      snapshotId: "asmp-1",
      createdAt: "2026-09-23T11:30:00.000Z",
    });
    if (!production.ok) {
      throw new Error(production.error);
    }
    const processes = [
      ...production.snapshot.members.flatMap((member) => member.operations),
      ...production.snapshot.assemblyOperations,
    ];
    expect(processes.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LETTER_ID)).toHaveLength(0);
    const mount = production.snapshot.assemblyOperations[0];
    expect(mount?.dependsOn.length).toBeGreaterThan(0);
    expect(production.snapshot.assemblyOperations[1]?.dependsOn).toEqual([mount?.id]);
    expect(production.snapshot.assemblyOperations[2]?.dependsOn).toEqual([
      production.snapshot.assemblyOperations[1]?.id,
    ]);
    expect(mount?.resourceDemands).toEqual([]);
    const scopes = new Set(processes.map((item) => item.scopeLabel));
    expect(scopes).toEqual(new Set(["Panou ACM", "Litere", "Ansamblare"]));
    const plan = materializeAssemblyExecutionPlan(production.snapshot);
    const mountTask = plan.tasks.find((task) => task.processId === MOUNT_LETTERS_ON_PANEL_ID);
    expect(mountTask?.providerRequirement).toBe("NOT_REQUIRED");
    const effort = setAssemblyTaskPlannedEffort(plan, mountTask?.taskId ?? "", 40);
    expect(effort.ok).toBe(true);
    if (!effort.ok) {
      return;
    }
    const assigned = {
      ...effort.record,
      tasks: effort.record.tasks.map((task) =>
        task.processId === MOUNT_LETTERS_ON_PANEL_ID
          ? {
              ...task,
              assignedProvider: {
                id: "WC_ASSEMBLY_01",
                kind: "WORKCENTER" as const,
                label: "Asamblare",
              },
            }
          : task,
      ),
    };
    const workload = projectPlanningWorkload([{ record: assigned }]);
    const group = workload.providers.find((item) => item.provider.id === "WC_ASSEMBLY_01");
    expect(group?.knownQueuedMinutes).toBe(40);
    const review = presentAssemblyReview({
      definition: confirmed.definition,
      truth: confirmed.truth,
      quote: quote.quote,
      order: order.order,
      production: production.snapshot,
      executionPlanId: plan.plan.planId,
    });
    expect(review.label).toBe("Panou ACM + litere volumetrice");
    expect(JSON.stringify(review)).not.toContain(confirmed.truth.contentHash);
    expect(frontlitPlexiAl06Template.components.some((item) => item.typeId === "FOREX_BACK")).toBe(true);
    expect(forexBackContract.typeId).toBe("FOREX_BACK");
    expect(acmCassetteNoneTemplate.components.map((item) => item.typeId)).toEqual([
      "ACM_CASSETTE_BODY",
      "STEEL_INTERNAL_FRAME",
    ]);
    expect(ACM_CASSETTE_NONE_PRODUCT_CODE).toBe("PRD-ACM-CASSETTE-NONE");
  });
});

function childProductionHash(
  ready: ReturnType<typeof readyAssembly>,
  truthId: string,
): string {
  return truthId === ready.acm.truthId
    ? ready.acm.productionInput.contentHash
    : ready.letters.productionInput.contentHash;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
