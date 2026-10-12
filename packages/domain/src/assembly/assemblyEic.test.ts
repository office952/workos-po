import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { freezeQuoteSnapshot, freezeSiteInstallationQuoteLine } from "../commercial/quoteSnapshot.js";
import { projectManualFixedServicePrice } from "../commercial/servicePrice.js";
import { blankSiteInstallationFacts } from "../installation/facts.js";
import { acmCassetteNoneFormSchema, acmCassetteNoneTemplate } from "../product/acmCassetteNone.js";
import { compileAcceptedProductEvaluation } from "../product/acceptedEvaluation.js";
import { compileDefinition, confirmReviewedDefinition } from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import { frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "../product/frontlitPlexiAl06.js";
import {
  logoFrontlitPlexiAl06FormSchema,
  logoFrontlitPlexiAl06Template,
  logoReadyValues,
} from "../product/logoFrontlitPlexiAl06.js";
import {
  codeDefaultProductEnablement,
  productEnablementEntries,
  type ProductEnablementResolution,
} from "../product/productEnablement.js";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import type { DraftValues, FormSchema, ProductTemplate } from "../product/types.js";
import {
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  INSTALL_AT_SITE_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
  WIRE_LIGHTING_ID,
} from "../processes/catalog.js";
import type { FrozenRecipeTrace } from "../production/snapshot.js";
import { LAB_SITE_INSTALL_ID, costEvidence } from "../resources/catalog.js";
import { RCP_ELECTRICAL_FINISH_ID, RCP_PACK_PRODUCT_ID, RCP_PROFILE_FORMING_ID } from "../resources/recipes.js";
import { SIGN_ASSEMBLY_ACM_LETTERS_V1, SIGN_ASSEMBLY_ACM_SIGNAGE_V2, type AssemblyKind, type AssemblyMemberRole } from "./contract.js";
import {
  acceptAssemblyQuote,
  attachConfirmedChild,
  confirmAssembly,
  createAssemblyDefinition,
  freezeAssemblyQuote,
  hashProductAggregate,
  hashProductTruth,
  projectAssemblyProduction,
  reconcileAssemblyEic,
  type ConfirmedChildProduct,
} from "./index.js";
import type { AssemblyOrderChild, AssemblyOrderSnapshot } from "./snapshots.js";

const ORG = "org-assembly-eic";
const DROPPED = new Set([PACK_PRODUCT_ID, INSPECT_FINISHED_LETTER_ID, INSPECT_FINISHED_LOGO_ID]);

const acmValues: DraftValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};
const lettersValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function child(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
  truthId: string,
): ConfirmedChildProduct {
  const definition = compileDefinition(template, schema, { templateCode: template.code, values });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("child truth was not confirmed");
  }
  const compiled = compileAcceptedProductEvaluation({
    truth,
    template,
    formSchema: schema,
    labels: seededDisplayLabelCatalog(),
    costEvidenceRows: costEvidence,
    formulaVersionsForType: starterFormulaVersionsForType,
  });
  const frozen = freezeQuoteSnapshot(
    compiled.truth,
    compiled.aggregate,
    compiled.composition,
    compiled.eic,
    projectCommercialPrice(compiled.eic, DEFAULT_COMMERCIAL_POLICY),
    { createdAt: "2026-10-10T08:00:00.000Z" },
  );
  if (!frozen.ok) {
    throw new Error(frozen.error);
  }
  return {
    truthId,
    organizationId: ORG,
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

const acm = () => child(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues, "child-acm");
const letters = () =>
  child(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, lettersValues, "child-letters");
const logo = () =>
  child(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, logoReadyValues, "child-logo");

function resolution(codes: readonly string[]): ProductEnablementResolution {
  return {
    ok: true,
    source: "ORGANIZATION",
    version: 1,
    enabledTemplateCodes: codes,
    entries: productEnablementEntries(codes),
    guidance: "Selecție de test",
  };
}

function installationLine() {
  const frozen = freezeSiteInstallationQuoteLine({
    label: "Montaj la locație",
    providerMode: "INTERNAL",
    requestId: "req-eic",
    facts: {
      ...blankSiteInstallationFacts({ requestId: "req-eic", createdAt: "2026-10-10T08:00:00.000Z" }),
      version: 3,
      street: "Strada Sintetică 9",
      city: "Oraș Sintetic",
      measurementStatus: "OFFICE_MEASURED",
      facadeType: "CONCRETE",
      fixingMethod: "MECHANICAL_ANCHOR",
      siteElectrical: "EXCLUDED_CUSTOMER_RESPONSIBILITY",
      crewSize: 2,
      plannedDurationHours: 3,
    },
    evidence: {
      resourceId: LAB_SITE_INSTALL_ID,
      amount: 25,
      currency: "EUR",
      perUnit: "person_hour",
      source: "OWNER_CONFIRMED_WORKSHOP",
      classification: "OWNER_CONFIRMED",
      note: "Tarif intern sintetic.",
    },
    eic: {
      completeness: "COMPLETE",
      calculationStatus: "CALCULABLE",
      verificationStatus: "CONFIRMED",
      completenessReasons: [],
      geometryLabel: null,
      currency: "EUR",
      lines: [
        {
          resourceId: LAB_SITE_INSTALL_ID,
          label: "Manoperă montaj la locație",
          quantity: 6,
          unit: "person_hour",
          rate: 25,
          currency: "EUR",
          cost: 150,
          kind: "LABOR",
          group: "labor",
        },
      ],
      total: 150,
      excludedComponentLabels: [],
    },
    commercial: projectManualFixedServicePrice({ netPrice: 180 }),
  });
  if (!frozen.ok) {
    throw new Error(frozen.error);
  }
  return frozen.line;
}

function acceptedOrder(
  kind: AssemblyKind,
  members: ReadonlyArray<readonly [AssemblyMemberRole, ConfirmedChildProduct]>,
  withInstallation = false,
): AssemblyOrderSnapshot {
  const codes = members.map(([, item]) => item.productCode);
  const created = createAssemblyDefinition({
    assemblyId: `asm-eic-${kind}`,
    organizationId: ORG,
    requestId: "req-eic",
    customerId: "cus-eic",
    resolution:
      kind === SIGN_ASSEMBLY_ACM_LETTERS_V1 ? codeDefaultProductEnablement() : resolution(codes),
    createdAt: "2026-10-10T08:10:00.000Z",
    kind,
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  let definition = created.definition;
  for (const [role, item] of members) {
    const attached = attachConfirmedChild(definition, item, role, definition.updatedAt);
    if (!attached.ok) {
      throw new Error(attached.error);
    }
    definition = attached.definition;
  }
  const children = members.map(([, item]) => item);
  const confirmed = confirmAssembly(definition, children, [], "2026-10-10T08:20:00.000Z");
  if (!confirmed.ok) {
    throw new Error(confirmed.error);
  }
  const quote = freezeAssemblyQuote({
    quoteSnapshotId: `asmq-eic-${kind}`,
    truth: confirmed.truth,
    children,
    createdAt: "2026-10-10T08:30:00.000Z",
    ...(withInstallation ? { serviceLine: installationLine() } : {}),
  });
  if (!quote.ok) {
    throw new Error(quote.error);
  }
  const order = acceptAssemblyQuote({
    orderSnapshotId: `asmo-eic-${kind}`,
    quote: quote.quote,
    children,
    createdAt: "2026-10-10T08:40:00.000Z",
  });
  if (!order.ok) {
    throw new Error(order.error);
  }
  return order.order;
}

function produce(order: AssemblyOrderSnapshot) {
  const production = projectAssemblyProduction(order, {
    snapshotId: `asmp:${order.orderSnapshotId}`,
    createdAt: "2026-10-10T08:50:00.000Z",
  });
  if (!production.ok) {
    throw new Error(production.error);
  }
  return production.snapshot;
}

function retained(item: AssemblyOrderChild) {
  return item.productionInput.operations.filter((operation) => !DROPPED.has(operation.processId));
}

function reconcile(order: AssemblyOrderSnapshot) {
  const production = produce(order);
  return reconcileAssemblyEic({
    members: order.children.map((item) => ({ child: item, retainedOperations: retained(item) })),
    assemblyOperations: production.assemblyOperations,
    ...(order.serviceLine ? { serviceLine: order.serviceLine } : {}),
  });
}

function packTraces(item: AssemblyOrderChild): FrozenRecipeTrace[] {
  return item.productionInput.usedRecipes.filter((trace) => trace.recipeId === RCP_PACK_PRODUCT_ID);
}

function expectedReconciledTotal(order: AssemblyOrderSnapshot): number {
  return round(
    order.children.reduce((sum, item) => {
      const traces = packTraces(item);
      expect(traces).toHaveLength(1);
      return sum + item.eicTotal - (traces[0]?.cost ?? 0);
    }, 0),
  );
}

function withTraces(item: AssemblyOrderChild, usedRecipes: FrozenRecipeTrace[]): AssemblyOrderChild {
  return { ...item, productionInput: { ...item.productionInput, usedRecipes } };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const v1Members = () =>
  [
    ["SUPPORT_PANEL", acm()],
    ["SIGNAGE_LETTERS", letters()],
  ] as const;

describe("assembly internal EIC reconciliation", () => {
  it("V1 ACM + letters: drops superseded child pack cost once per child and stays PARTIAL", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const production = produce(order);
    const rawChildTotal = round(order.children.reduce((sum, item) => sum + item.eicTotal, 0));
    const expected = expectedReconciledTotal(order);

    expect(order.children.every((item) => item.eicCompleteness === "COMPLETE")).toBe(true);
    expect(production.eicTotal).toBe(expected);
    expect(production.eicTotal).not.toBe(rawChildTotal);
    expect(production.eicCompleteness).toBe("PARTIAL");

    const reconciliation = reconcile(order);
    expect(reconciliation.rawChildTotal).toBe(rawChildTotal);
    expect(reconciliation.total).toBe(production.eicTotal);
    for (const item of reconciliation.children) {
      const source = order.children.find((entry) => entry.memberId === item.memberId);
      expect(item.supersededRecipes).toEqual([
        {
          recipeId: RCP_PACK_PRODUCT_ID,
          resourceId: packTraces(source!)[0]?.costEvidenceId,
          processIds: [PACK_PRODUCT_ID],
          cost: packTraces(source!)[0]?.cost,
        },
      ]);
      expect(item.unreconciledRecipeIds).toEqual([]);
    }
    expect(reconciliation.unpricedAssemblyOperations.map((item) => item.processId)).toEqual([
      MOUNT_LETTERS_ON_PANEL_ID,
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);

    const finalPack = production.assemblyOperations.filter((item) => item.processId === PACK_PRODUCT_ID);
    expect(finalPack).toHaveLength(1);
    expect(finalPack[0]?.quantities).toEqual([]);
    expect(finalPack[0]?.resourceDemands).toEqual([]);

    const processes = [
      ...production.members.flatMap((member) => member.operations),
      ...production.assemblyOperations,
    ];
    expect(processes.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LETTER_ID)).toHaveLength(0);
  });

  it("keeps retained child fabrication cost and a shared multi-process recipe costed once", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const electrical = lettersChild.productionInput.usedRecipes.filter(
      (trace) => trace.recipeId === RCP_ELECTRICAL_FINISH_ID,
    );
    expect(electrical.length).toBeGreaterThan(1);
    const naiveTraceSum = lettersChild.productionInput.usedRecipes.reduce((sum, trace) => sum + trace.cost, 0);
    const perRecipe = new Map(lettersChild.productionInput.usedRecipes.map((trace) => [trace.recipeId, trace.cost]));
    const dedupedTraceSum = [...perRecipe.values()].reduce((sum, cost) => sum + cost, 0);
    expect(naiveTraceSum - dedupedTraceSum).toBeCloseTo((electrical.length - 1) * (electrical[0]?.cost ?? 0), 10);

    const reconciliation = reconcile(order);
    const lettersResult = reconciliation.children.find((item) => item.memberId === lettersChild.memberId)!;
    expect(lettersResult.supersededRecipes.map((item) => item.recipeId)).toEqual([RCP_PACK_PRODUCT_ID]);
    expect(lettersResult.reconciledEicTotal).toBeCloseTo(
      lettersChild.eicTotal - (packTraces(lettersChild)[0]?.cost ?? 0),
      10,
    );

    const packTrace = packTraces(lettersChild)[0]!;
    const sharedWithSurvivor = withTraces(lettersChild, [
      ...lettersChild.productionInput.usedRecipes,
      { ...packTrace, processId: WIRE_LIGHTING_ID, scope: "LIGHTING" },
    ]);
    const shared = reconcileAssemblyEic({
      members: [{ child: sharedWithSurvivor, retainedOperations: retained(sharedWithSurvivor) }],
      assemblyOperations: [],
    });
    expect(shared.children[0]?.supersededRecipes).toEqual([]);
    expect(shared.children[0]?.reconciledEicTotal).toBe(lettersChild.eicTotal);
  });

  it("removes a dropped-only recipe once even when several removed operations trace it", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const packTrace = packTraces(lettersChild)[0]!;
    const twoRemovedTraces = withTraces(lettersChild, [
      ...lettersChild.productionInput.usedRecipes,
      { ...packTrace, processId: INSPECT_FINISHED_LETTER_ID, scope: "PRODUCT" },
    ]);
    const result = reconcileAssemblyEic({
      members: [{ child: twoRemovedTraces, retainedOperations: retained(twoRemovedTraces) }],
      assemblyOperations: [],
    });
    expect(result.children[0]?.supersededRecipes).toEqual([
      {
        recipeId: RCP_PACK_PRODUCT_ID,
        resourceId: packTrace.costEvidenceId,
        processIds: [PACK_PRODUCT_ID, INSPECT_FINISHED_LETTER_ID],
        cost: packTrace.cost,
      },
    ]);
    expect(result.children[0]?.reconciledEicTotal).toBeCloseTo(lettersChild.eicTotal - packTrace.cost, 10);
  });

  it("subtracts only what standalone EIC charged through the recipe", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const forming = lettersChild.productionInput.usedRecipes.find(
      (trace) => trace.recipeId === RCP_PROFILE_FORMING_ID,
    )!;
    expect(
      lettersChild.productionInput.requirements.some((item) => item.resourceId === forming.costEvidenceId),
    ).toBe(true);
    const result = reconcileAssemblyEic({
      members: [
        {
          child: lettersChild,
          retainedOperations: retained(lettersChild).filter(
            (operation) => operation.processId !== FORM_ALUMINIUM_PROFILE_ID,
          ),
        },
      ],
      assemblyOperations: [],
    });
    expect(result.children[0]?.supersededRecipes.map((item) => item.recipeId)).toEqual([RCP_PACK_PRODUCT_ID]);
  });

  it("keeps cost and reports PARTIAL when frozen traces of one recipe disagree", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const packTrace = packTraces(lettersChild)[0]!;
    const ambiguous = withTraces(lettersChild, [
      ...lettersChild.productionInput.usedRecipes,
      { ...packTrace, processId: INSPECT_FINISHED_LETTER_ID, scope: "PRODUCT", cost: packTrace.cost + 1 },
    ]);
    const result = reconcileAssemblyEic({
      members: [{ child: ambiguous, retainedOperations: retained(ambiguous) }],
      assemblyOperations: [],
    });
    expect(result.children[0]?.supersededRecipes).toEqual([]);
    expect(result.children[0]?.unreconciledRecipeIds).toEqual([RCP_PACK_PRODUCT_ID]);
    expect(result.children[0]?.reconciledEicTotal).toBe(lettersChild.eicTotal);
    expect(result.completeness).toBe("PARTIAL");
  });

  it("is driven by frozen traces, not by current cost evidence", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const historical = withTraces(
      lettersChild,
      lettersChild.productionInput.usedRecipes.map((trace) =>
        trace.recipeId === RCP_PACK_PRODUCT_ID ? { ...trace, rate: 7, cost: 7 } : trace,
      ),
    );
    const result = reconcileAssemblyEic({
      members: [{ child: historical, retainedOperations: retained(historical) }],
      assemblyOperations: [],
    });
    expect(result.children[0]?.supersededRecipes[0]?.cost).toBe(7);
    expect(result.children[0]?.reconciledEicTotal).toBeCloseTo(lettersChild.eicTotal - 7, 10);
    expect(produce(order).eicTotal).toBe(produce(order).eicTotal);
    for (const file of ["./eic.ts", "./composition.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/resources\/catalog|resources\/recipes|resources\/eic|compileEic|costEvidence\b/);
    }
  });

  it("V2 ACM + logo and ACM + letters + logo reconcile generically", () => {
    const logoOnly = acceptedOrder(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, [
      ["SUPPORT_PANEL", acm()],
      ["SIGNAGE_LOGO", logo()],
    ]);
    const logoProduction = produce(logoOnly);
    expect(logoProduction.eicTotal).toBe(expectedReconciledTotal(logoOnly));
    expect(logoProduction.eicCompleteness).toBe("PARTIAL");
    expect(reconcile(logoOnly).unpricedAssemblyOperations.map((item) => item.processId)).toEqual([
      MOUNT_LOGO_ON_PANEL_ID,
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);

    const full = acceptedOrder(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, [
      ["SUPPORT_PANEL", acm()],
      ["SIGNAGE_LOGO", logo()],
      ["SIGNAGE_LETTERS", letters()],
    ]);
    const fullProduction = produce(full);
    expect(fullProduction.eicTotal).toBe(expectedReconciledTotal(full));
    expect(fullProduction.eicTotal).not.toBe(
      round(full.children.reduce((sum, item) => sum + item.eicTotal, 0)),
    );
    expect(fullProduction.eicCompleteness).toBe("PARTIAL");
    expect(reconcile(full).unpricedAssemblyOperations.map((item) => item.processId)).toEqual([
      MOUNT_LETTERS_ON_PANEL_ID,
      MOUNT_LOGO_ON_PANEL_ID,
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);
    const processes = [
      ...fullProduction.members.flatMap((member) => member.operations),
      ...fullProduction.assemblyOperations,
    ];
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LETTER_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);
  });

  it("does not mutate frozen child snapshots, truth, production input, commercial or hashes", () => {
    const members = v1Members();
    const order = deepFreeze(acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, members));
    const before = JSON.stringify(order);
    const production = produce(order);
    reconcile(order);
    expect(JSON.stringify(order)).toBe(before);
    for (const [, source] of members) {
      const frozenChild = order.children.find((item) => item.truthId === source.truthId)!;
      expect(frozenChild.truthHash).toBe(source.truthHash);
      expect(frozenChild.aggregateHash).toBe(source.aggregateHash);
      expect(frozenChild.productionInput.contentHash).toBe(source.productionInput.contentHash);
      expect(frozenChild.childQuoteSnapshotId).toBe(source.childQuoteSnapshotId);
      expect(frozenChild.childQuoteContentHash).toBe(source.childQuoteContentHash);
      expect(frozenChild.eicTotal).toBe(source.eicTotal);
      expect(frozenChild.commercial).toEqual(source.commercial);
      const member = production.members.find((item) => item.memberId === frozenChild.memberId)!;
      expect(member.truthHash).toBe(source.truthHash);
      expect(member.productionInputHash).toBe(source.productionInput.contentHash);
    }
  });

  it("leaves quote/order commercial totals untouched", () => {
    const members = v1Members();
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, members);
    const totalsBefore = { ...order.totals };
    const production = produce(order);
    expect(order.totals).toEqual(totalsBefore);
    expect(order.totals.netPrice).toBe(
      round(members.reduce((sum, [, item]) => sum + (item.commercial?.netPrice ?? 0), 0)),
    );
    expect(JSON.stringify(production)).not.toMatch(/netPrice|grossPrice|vatAmount/);
  });

  it("keeps frozen site-installation EIC on the service line, outside production EIC, exactly once", () => {
    const plain = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const installed = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), true);
    const serviceEicBefore = JSON.stringify(installed.serviceLine?.eic);
    const production = produce(installed);
    expect(production.assemblyOperations.filter((item) => item.processId === INSTALL_AT_SITE_ID)).toHaveLength(1);
    expect(production.eicTotal).toBe(produce(plain).eicTotal);
    expect(JSON.stringify(installed.serviceLine?.eic)).toBe(serviceEicBefore);
    const reconciliation = reconcile(installed);
    expect(reconciliation.siteInstallationEicOutsideTotal).toBe(installed.serviceLine?.eic.total);
    expect(reconciliation.siteInstallationEicOutsideTotal).toBe(150);
    expect(reconciliation.unpricedAssemblyOperations.map((item) => item.processId)).not.toContain(
      INSTALL_AT_SITE_ID,
    );
  });

  it("would be COMPLETE only when no assembly operation is left unpriced", () => {
    const order = acceptedOrder(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const result = reconcileAssemblyEic({
      members: order.children.map((item) => ({ child: item, retainedOperations: retained(item) })),
      assemblyOperations: [],
    });
    expect(result.completeness).toBe("COMPLETE");
    expect(result.total).toBe(expectedReconciledTotal(order));
  });
});
