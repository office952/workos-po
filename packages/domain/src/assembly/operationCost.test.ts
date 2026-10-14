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
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  INSTALL_AT_SITE_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import {
  LAB_SITE_INSTALL_ID,
  LAB_WORKSHOP_LABOR_ID,
  SVC_PACK_PRODUCT_ID,
  costEvidence,
  type CostEvidence,
} from "../resources/catalog.js";
import { RCP_PACK_PRODUCT_ID } from "../resources/recipes.js";
import { contentHash } from "./canonical.js";
import {
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  type AssemblyKind,
  type AssemblyMemberRole,
} from "./contract.js";
import {
  acceptAssemblyQuote,
  assemblyQuoteContentHashMatches,
  assessAssemblyRateAcknowledgement,
  attachConfirmedChild,
  confirmAssembly,
  createAssemblyDefinition,
  evaluateAssemblyOperationCosts,
  freezeAssemblyQuote,
  hashProductAggregate,
  hashProductTruth,
  projectAssemblyProduction,
  reconcileAssemblyEic,
  setAssemblyOperationEstimates,
  type AssemblyDefinition,
  type AssemblyOperationCostPolicyVersion,
  type AssemblyOperationEstimate,
  type ConfirmedChildProduct,
  type FrozenAssemblyOperationCost,
  type FrozenAssemblyOperationCostLine,
} from "./index.js";
import { operationCostEvidenceHash } from "./operationCostEvidence.js";
import type { AssemblyOrderChild, AssemblyOrderSnapshot } from "./snapshots.js";

const ORG = "org-assembly-operation-cost";
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

const WORKSHOP_LABOR: CostEvidence = {
  resourceId: LAB_WORKSHOP_LABOR_ID,
  amount: 30,
  currency: "EUR",
  perUnit: "person_hour",
  source: "OWNER_CONFIRMED_WORKSHOP",
  classification: "OWNER_CONFIRMED",
  note: "Tarif sintetic de atelier.",
  evidenceRowId: "cev:synthetic:workshop-labor",
  createdAt: "2026-10-10T07:00:00.000Z",
};
const UNCONFIRMED_WORKSHOP_LABOR: CostEvidence = {
  ...WORKSHOP_LABOR,
  source: "PILOT_INTERNAL_EVIDENCE",
  classification: "DEVELOPMENT_DEFAULT",
  evidenceRowId: "cev:synthetic:workshop-labor-pilot",
};
const WITH_LABOR = [...costEvidence, WORKSHOP_LABOR];

const AUTHOR = "usr:synthetic-owner";
const ESTIMATED_AT = "2026-10-10T08:25:00.000Z";

function policy(
  finalInspectionMode: AssemblyOperationCostPolicyVersion["finalInspectionMode"],
  finalPackagingMode: AssemblyOperationCostPolicyVersion["finalPackagingMode"],
  version = 1,
): AssemblyOperationCostPolicyVersion {
  return {
    version,
    finalInspectionMode,
    finalPackagingMode,
    updatedAt: "2026-10-10T07:30:00.000Z",
    updatedBy: AUTHOR,
  };
}

function estimate(processId: AssemblyOperationEstimate["processId"], personHours: number) {
  return { processId, personHours, authorUserId: AUTHOR, recordedAt: ESTIMATED_AT };
}

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
    unconfirmedRates: [],
  };
}

const acm = () => child(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues, "child-acm");
const letters = () =>
  child(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, lettersValues, "child-letters");
const logo = () =>
  child(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, logoReadyValues, "child-logo");

type Members = ReadonlyArray<readonly [AssemblyMemberRole, ConfirmedChildProduct]>;

const v1Members = (): Members => [
  ["SUPPORT_PANEL", acm()],
  ["SIGNAGE_LETTERS", letters()],
];
const v2FullMembers = (): Members => [
  ["SUPPORT_PANEL", acm()],
  ["SIGNAGE_LOGO", logo()],
  ["SIGNAGE_LETTERS", letters()],
];

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
    requestId: "req-op",
    facts: {
      ...blankSiteInstallationFacts({ requestId: "req-op", createdAt: "2026-10-10T08:00:00.000Z" }),
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

type Scenario = {
  policy?: AssemblyOperationCostPolicyVersion | null;
  estimates?: readonly AssemblyOperationEstimate[];
  evidenceRows?: readonly CostEvidence[];
  withInstallation?: boolean;
  /** `false` freezes a quote exactly as before V4 (no operation evidence). */
  withEvidence?: boolean;
};

function confirmedDefinition(kind: AssemblyKind, members: Members) {
  const codes = members.map(([, item]) => item.productCode);
  const created = createAssemblyDefinition({
    assemblyId: `asm-op-${kind}`,
    organizationId: ORG,
    requestId: "req-op",
    customerId: "cus-op",
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
  return { definition: confirmed.definition, truth: confirmed.truth, children };
}

function evaluate(kind: AssemblyKind, members: Members, scenario: Scenario = {}) {
  return evaluateAssemblyOperationCosts({
    kind,
    members: members.map(([role, item]) => ({
      memberId: role,
      role,
      productionInput: item.productionInput,
    })),
    policy: scenario.policy === undefined ? policy("INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA") : scenario.policy,
    estimates: scenario.estimates ?? [
      estimate(MOUNT_LETTERS_ON_PANEL_ID, 2.5),
      estimate(MOUNT_LOGO_ON_PANEL_ID, 1.25),
    ],
    evidenceRows: scenario.evidenceRows ?? WITH_LABOR,
  });
}

function flow(kind: AssemblyKind, members: Members, scenario: Scenario = {}) {
  const { truth, children } = confirmedDefinition(kind, members);
  const memberIds = new Map(truth.members.map((member) => [member.confirmedTruthId, member.memberId]));
  const operationCost =
    scenario.withEvidence === false
      ? undefined
      : evaluateAssemblyOperationCosts({
          kind,
          members: members.map(([role, item]) => ({
            memberId: memberIds.get(item.truthId) ?? role,
            role,
            productionInput: item.productionInput,
          })),
          policy:
            scenario.policy === undefined
              ? policy("INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA")
              : scenario.policy,
          estimates: scenario.estimates ?? [
            estimate(MOUNT_LETTERS_ON_PANEL_ID, 2.5),
            estimate(MOUNT_LOGO_ON_PANEL_ID, 1.25),
          ],
          evidenceRows: scenario.evidenceRows ?? WITH_LABOR,
        });
  const quote = freezeAssemblyQuote({
    quoteSnapshotId: `asmq-op-${kind}`,
    truth,
    children,
    createdAt: "2026-10-10T08:30:00.000Z",
    ...(scenario.withInstallation ? { serviceLine: installationLine() } : {}),
    ...(operationCost ? { operationCost } : {}),
  });
  if (!quote.ok) {
    throw new Error(quote.error);
  }
  const order = acceptAssemblyQuote({
    orderSnapshotId: `asmo-op-${kind}`,
    quote: quote.quote,
    children,
    createdAt: "2026-10-10T08:40:00.000Z",
  });
  if (!order.ok) {
    throw new Error(order.error);
  }
  return { quote: quote.quote, order: order.order, production: produce(order.order), children };
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

function reconcile(
  order: AssemblyOrderSnapshot,
  operationCost: FrozenAssemblyOperationCost | null | undefined = order.operationCost,
) {
  const production = produce({ ...order, operationCost: undefined });
  return reconcileAssemblyEic({
    members: order.children.map((item) => ({ child: item, retainedOperations: retained(item) })),
    assemblyOperations: production.assemblyOperations,
    ...(order.serviceLine ? { serviceLine: order.serviceLine } : {}),
    ...(operationCost ? { operationCost } : {}),
  });
}

function reconciledChildTotal(order: AssemblyOrderSnapshot): number {
  return order.children.reduce((sum, item) => {
    const traces = item.productionInput.usedRecipes.filter((trace) => trace.recipeId === RCP_PACK_PRODUCT_ID);
    expect(traces).toHaveLength(1);
    return sum + item.eicTotal - (traces[0]?.cost ?? 0);
  }, 0);
}

function line(evidence: FrozenAssemblyOperationCost | undefined, processId: string) {
  return evidence?.lines.find((item) => item.processId === processId);
}

function resealed(
  evidence: FrozenAssemblyOperationCost,
  lines: FrozenAssemblyOperationCostLine[],
): FrozenAssemblyOperationCost {
  return { ...evidence, lines, evidenceHash: operationCostEvidenceHash(evidence.policy, lines) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function supportPackArea(members: Members): number {
  const support = members.find(([role]) => role === "SUPPORT_PANEL")?.[1];
  const trace = support?.productionInput.usedRecipes.find((item) => item.recipeId === RCP_PACK_PRODUCT_ID);
  if (!trace) {
    throw new Error("support panel has no packaging trace");
  }
  return trace.quantity;
}

describe("assembly operation cost evaluator", () => {
  it("1. costs letter mounting as estimated person-hours × confirmed workshop rate", () => {
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    expect(line(evidence, MOUNT_LETTERS_ON_PANEL_ID)).toEqual({
      operationId: `ANSAMBLARE:${MOUNT_LETTERS_ON_PANEL_ID}`,
      processId: MOUNT_LETTERS_ON_PANEL_ID,
      outcome: "COSTED",
      resourceId: LAB_WORKSHOP_LABOR_ID,
      resourceLabel: "Manoperă atelier",
      recipeId: null,
      quantity: 2.5,
      unit: "person_hour",
      rate: 30,
      currency: "EUR",
      cost: 75,
      evidenceRowId: "cev:synthetic:workshop-labor",
      evidenceSource: "OWNER_CONFIRMED_WORKSHOP",
      evidenceClassification: "OWNER_CONFIRMED",
      quantityProvenance: { kind: "OPERATOR_ESTIMATE", authorUserId: AUTHOR, recordedAt: ESTIMATED_AT },
    });
    expect(evidence.lines.map((item) => item.processId)).toEqual([
      MOUNT_LETTERS_ON_PANEL_ID,
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);
    expect(evidence.policy.version).toBe(1);
  });

  it("2. keeps letters and logo mounting as separate processes with separate hours", () => {
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, v2FullMembers());
    const lettersLine = line(evidence, MOUNT_LETTERS_ON_PANEL_ID);
    const logoLine = line(evidence, MOUNT_LOGO_ON_PANEL_ID);
    expect(lettersLine).toMatchObject({ outcome: "COSTED", quantity: 2.5, cost: 75 });
    expect(logoLine).toMatchObject({ outcome: "COSTED", quantity: 1.25, cost: 37.5 });
    const logoOnly = evaluate(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, [
      ["SUPPORT_PANEL", acm()],
      ["SIGNAGE_LOGO", logo()],
    ]);
    expect(line(logoOnly, MOUNT_LETTERS_ON_PANEL_ID)).toBeUndefined();
    expect(line(logoOnly, MOUNT_LOGO_ON_PANEL_ID)).toMatchObject({ outcome: "COSTED", cost: 37.5 });
  });

  it("3. counts each workshop labor line exactly once in production EIC", () => {
    const members = v2FullMembers();
    const { order, production } = flow(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, members);
    const packCost = supportPackArea(members) * 10;
    expect(production.operationCost?.pricedProcessIds).toEqual([
      MOUNT_LETTERS_ON_PANEL_ID,
      MOUNT_LOGO_ON_PANEL_ID,
      PACK_PRODUCT_ID,
    ]);
    expect(production.operationCost?.total).toBe(round(75 + 37.5 + packCost));
    expect(production.eicTotal).toBe(round(reconciledChildTotal(order) + 75 + 37.5 + packCost));
  });

  it("4. records INCLUDED final inspection with its policy version", () => {
    const { order, production } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      policy: policy("INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA", 3),
    });
    expect(line(order.operationCost, INSPECT_FINISHED_ASSEMBLY_ID)).toEqual({
      operationId: `ANSAMBLARE:${INSPECT_FINISHED_ASSEMBLY_ID}`,
      processId: INSPECT_FINISHED_ASSEMBLY_ID,
      outcome: "INCLUDED",
      policyMode: "INCLUDED_IN_OTHER_OPERATIONS",
    });
    expect(order.operationCost?.policy).toMatchObject({ version: 3, updatedBy: AUTHOR });
    expect(production.operationCost).toMatchObject({
      policyVersion: 3,
      includedProcessIds: [INSPECT_FINISHED_ASSEMBLY_ID],
      unpricedProcessIds: [],
    });
  });

  it("5. leaves final inspection PARTIAL when the policy is not configured", () => {
    const { production } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      policy: policy("NOT_CONFIGURED", "PANEL_FACE_AREA"),
    });
    expect(production.eicCompleteness).toBe("PARTIAL");
    expect(production.operationCost?.unpricedProcessIds).toEqual([INSPECT_FINISHED_ASSEMBLY_ID]);
    const unconfigured = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), { policy: null });
    expect(unconfigured.policy).toEqual({
      version: null,
      finalInspectionMode: "NOT_CONFIGURED",
      finalPackagingMode: "NOT_CONFIGURED",
      updatedAt: null,
      updatedBy: null,
    });
    expect(unconfigured.lines.filter((item) => item.outcome === "MISSING_POLICY").map((item) => item.processId)).toEqual([
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);
    expect(unconfigured.completeness).toBe("PARTIAL");
  });

  it("6. costs SEPARATE_LABOR final inspection from its own estimated hours", () => {
    const separate = policy("SEPARATE_LABOR", "PANEL_FACE_AREA");
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      policy: separate,
      estimates: [estimate(MOUNT_LETTERS_ON_PANEL_ID, 2), estimate(INSPECT_FINISHED_ASSEMBLY_ID, 0.5)],
    });
    expect(line(evidence, INSPECT_FINISHED_ASSEMBLY_ID)).toMatchObject({
      outcome: "COSTED",
      resourceId: LAB_WORKSHOP_LABOR_ID,
      quantity: 0.5,
      cost: 15,
    });
    const missing = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      policy: separate,
      estimates: [estimate(MOUNT_LETTERS_ON_PANEL_ID, 2)],
    });
    expect(line(missing, INSPECT_FINISHED_ASSEMBLY_ID)?.outcome).toBe("MISSING_QUANTITY");
  });

  it("7. prices final packaging from the frozen support-panel face area", () => {
    const members = v1Members();
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, members);
    const support = members[0]![1];
    expect(supportPackArea(members)).toBe(0.5);
    expect(line(evidence, PACK_PRODUCT_ID)).toMatchObject({
      outcome: "COSTED",
      resourceId: SVC_PACK_PRODUCT_ID,
      recipeId: RCP_PACK_PRODUCT_ID,
      quantity: 0.5,
      unit: "m2",
      rate: 10,
      cost: 5,
      quantityProvenance: {
        kind: "SUPPORT_PANEL_FACE_AREA",
        memberId: "SUPPORT_PANEL",
        productionInputHash: support.productionInput.contentHash,
        recipeId: RCP_PACK_PRODUCT_ID,
      },
    });
  });

  it("8. keeps packaging PARTIAL without a valid panel-area basis", () => {
    const members = v1Members();
    const support = members[0]![1];
    const withoutArea: Members = [
      [
        "SUPPORT_PANEL",
        {
          ...support,
          productionInput: {
            ...support.productionInput,
            usedRecipes: support.productionInput.usedRecipes.filter(
              (trace) => trace.recipeId !== RCP_PACK_PRODUCT_ID,
            ),
          },
        },
      ],
      members[1]!,
    ];
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, withoutArea);
    expect(line(evidence, PACK_PRODUCT_ID)?.outcome).toBe("MISSING_QUANTITY");
    expect(evidence.completeness).toBe("PARTIAL");
    const noPackPolicy = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, members, {
      policy: policy("INCLUDED_IN_OTHER_OPERATIONS", "NOT_CONFIGURED"),
    });
    expect(line(noPackPolicy, PACK_PRODUCT_ID)?.outcome).toBe("MISSING_POLICY");
  });

  it("9. refuses an incompatible packaging rate unit", () => {
    const rows = [
      ...WITH_LABOR.filter((row) => row.resourceId !== SVC_PACK_PRODUCT_ID),
      { ...costEvidence.find((row) => row.resourceId === SVC_PACK_PRODUCT_ID)!, perUnit: "buc" as const },
    ];
    const evidence = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), { evidenceRows: rows });
    expect(line(evidence, PACK_PRODUCT_ID)?.outcome).toBe("INCOMPATIBLE_UNIT");
    expect(evidence.knownTotal).toBe(75);
  });

  it("10. removes each child's superseded packaging once and adds assembly packaging once", () => {
    const members = v1Members();
    const { order, production } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, members);
    const result = reconcile(order);
    expect(result.children.every((item) => item.supersededRecipes.map((recipe) => recipe.recipeId).join() === RCP_PACK_PRODUCT_ID)).toBe(true);
    expect(result.pricedAssemblyOperations.filter((item) => item.processId === PACK_PRODUCT_ID)).toEqual([
      { operationId: `ANSAMBLARE:${PACK_PRODUCT_ID}`, processId: PACK_PRODUCT_ID, cost: 5 },
    ]);
    expect(production.eicTotal).toBe(round(reconciledChildTotal(order) + 75 + 5));
  });

  it("11. leaves child reconciliation identical with or without operation evidence", () => {
    const { order } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    expect(reconcile(order).children).toEqual(reconcile(order, null).children);
    expect(reconcile(order, null).operationEvidence).toBe("ABSENT");
  });

  it("12. stays PARTIAL with ambiguous frozen child traces even when operations are priced", () => {
    const { order } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const lettersChild = order.children.find((item) => item.role === "SIGNAGE_LETTERS")!;
    const packTrace = lettersChild.productionInput.usedRecipes.find((trace) => trace.recipeId === RCP_PACK_PRODUCT_ID)!;
    const ambiguous: AssemblyOrderSnapshot = {
      ...order,
      children: order.children.map((item) =>
        item === lettersChild
          ? {
              ...item,
              productionInput: {
                ...item.productionInput,
                usedRecipes: [
                  ...item.productionInput.usedRecipes,
                  { ...packTrace, processId: INSPECT_FINISHED_LETTER_ID, scope: "PRODUCT", cost: packTrace.cost + 1 },
                ],
              },
            }
          : item,
      ),
    };
    const result = reconcile(ambiguous);
    expect(result.operationEvidence).toBe("VALID");
    expect(result.unpricedAssemblyOperations).toEqual([]);
    expect(result.completeness).toBe("PARTIAL");
  });

  it("13. keeps a missing workshop rate PARTIAL and never prices it as zero", () => {
    const { production, order } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      evidenceRows: costEvidence,
    });
    expect(line(order.operationCost, MOUNT_LETTERS_ON_PANEL_ID)).toMatchObject({
      outcome: "MISSING_RATE",
      reason: "Tarif lipsă pentru Manoperă atelier",
    });
    expect(production.eicCompleteness).toBe("PARTIAL");
    expect(production.operationCost?.unpricedProcessIds).toEqual([MOUNT_LETTERS_ON_PANEL_ID]);
    expect(production.operationCost?.total).toBe(5);
  });

  it("14. carries an unconfirmed rate as calculable with verification status and disclosure", () => {
    const rows = [...costEvidence, UNCONFIRMED_WORKSHOP_LABOR];
    const { quote, production, children } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      evidenceRows: rows,
    });
    expect(line(quote.operationCost, MOUNT_LETTERS_ON_PANEL_ID)).toMatchObject({
      outcome: "UNCONFIRMED_RATE",
      cost: 75,
      evidenceClassification: "DEVELOPMENT_DEFAULT",
    });
    expect(quote.operationCost?.verification).toBe("NEEDS_VERIFICATION");
    expect(production.operationCost?.pricedProcessIds).toContain(MOUNT_LETTERS_ON_PANEL_ID);
    const assessed = assessAssemblyRateAcknowledgement({ candidate: quote, children });
    expect(assessed.ok && assessed.requirement.status).toBe("DISCLOSURE_ONLY");
    expect(assessed.ok && assessed.requirement.rates).toEqual([
      expect.objectContaining({
        resourceId: LAB_WORKSHOP_LABOR_ID,
        memberLabel: "Ansamblare",
        amount: 30,
        quantity: 2.5,
        evidenceRowId: "cev:synthetic:workshop-labor-pilot",
      }),
    ]);
    const confirmed = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const notRequired = assessAssemblyRateAcknowledgement({ candidate: confirmed.quote, children });
    expect(notRequired.ok && notRequired.requirement.status).toBe("NOT_REQUIRED");
  });

  it("15. distinguishes INCLUDED zero additional cost from unknown cost", () => {
    const included = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const unknown = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      policy: policy("NOT_CONFIGURED", "PANEL_FACE_AREA"),
    });
    expect(included.production.eicTotal).toBe(unknown.production.eicTotal);
    expect(included.production.eicCompleteness).toBe("COMPLETE");
    expect(unknown.production.eicCompleteness).toBe("PARTIAL");
    expect(included.production.operationCost?.includedProcessIds).toEqual([INSPECT_FINISHED_ASSEMBLY_ID]);
    expect(unknown.production.operationCost?.unpricedProcessIds).toEqual([INSPECT_FINISHED_ASSEMBLY_ID]);
  });

  it("16-17. leaves product EIC and customer commercial totals unchanged", () => {
    const members = v1Members();
    const withEvidence = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, members);
    const legacy = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, members, { withEvidence: false });
    for (const [, source] of members) {
      expect(withEvidence.order.children.find((item) => item.truthId === source.truthId)?.eicTotal).toBe(
        source.eicTotal,
      );
    }
    expect(withEvidence.quote.totals).toEqual(legacy.quote.totals);
    expect(withEvidence.quote.members).toEqual(legacy.quote.members);
    expect(withEvidence.order.totals).toEqual(legacy.order.totals);
    expect(JSON.stringify(withEvidence.quote.operationCost)).not.toMatch(/netPrice|grossPrice|vatAmount|discount/);
  });

  it("18. consumes only frozen evidence at production release", () => {
    const { order } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const repriced = evaluate(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), {
      evidenceRows: [...costEvidence, { ...WORKSHOP_LABOR, amount: 99 }],
    });
    expect(line(repriced, MOUNT_LETTERS_ON_PANEL_ID)).toMatchObject({ cost: 247.5 });
    expect(produce(order).operationCost?.total).toBe(80);
    for (const file of ["./eic.ts", "./composition.ts", "./operationCostEvidence.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/^import \{[^}]*\} from "\.\.\/resources\//m);
      expect(source).not.toMatch(/compileEic|lookupCostEvidence|costEvidence\b/);
    }
  });

  it("19. keeps an order frozen before V4 readable, PARTIAL and byte-identical in shape", () => {
    const { order, production } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), { withEvidence: false });
    expect(order).not.toHaveProperty("operationCost");
    expect(production).not.toHaveProperty("operationCost");
    expect(production.eicCompleteness).toBe("PARTIAL");
    expect(production.eicTotal).toBe(round(reconciledChildTotal(order)));
    expect(reconcile(order).unpricedAssemblyOperations.map((item) => item.processId)).toEqual([
      MOUNT_LETTERS_ON_PANEL_ID,
      INSPECT_FINISHED_ASSEMBLY_ID,
      PACK_PRODUCT_ID,
    ]);
    const { snapshotId: _id, createdAt: _at, contentHash: stored, ...body } = production;
    expect(contentHash(body)).toBe(stored);
  });

  it("20. binds evidence into new quote, order and production hashes with consistent links", () => {
    const { quote, order, production } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const legacy = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), { withEvidence: false });
    expect(assemblyQuoteContentHashMatches(quote)).toBe(true);
    expect(quote.contentHash).not.toBe(legacy.quote.contentHash);
    expect(quote.quoteSnapshotId).toBe(legacy.quote.quoteSnapshotId);
    expect(order.operationCost).toEqual(quote.operationCost);
    expect(order.sourceQuoteContentHash).toBe(quote.contentHash);
    expect(production.sourceOrderContentHash).toBe(order.contentHash);
    expect(production.operationCost?.evidenceHash).toBe(quote.operationCost?.evidenceHash);
    const { orderSnapshotId: _o, createdAt: _c, contentHash: orderHash, ...orderBody } = order;
    expect(contentHash(orderBody)).toBe(orderHash);
    const tamperedQuote = {
      ...quote,
      operationCost: { ...quote.operationCost!, knownTotal: 0 },
    };
    expect(assemblyQuoteContentHashMatches(tamperedQuote)).toBe(false);
  });

  it("21. never reaches COMPLETE from tampered or contradictory evidence", () => {
    const { order } = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    expect(reconcile(order).completeness).toBe("COMPLETE");
    const evidence = order.operationCost!;
    const lines = [...evidence.lines];
    const mount = lines[0]!;
    const pack = lines[2]!;
    const variants: FrozenAssemblyOperationCost[] = [
      { ...evidence, lines: lines.map((item) => (item === mount ? { ...item, cost: 1 } : item)) },
      resealed(evidence, lines.map((item) => (item === mount ? { ...item, cost: 1 } : item))),
      resealed(evidence, [
        mount,
        lines[1]!,
        { operationId: pack.operationId, processId: PACK_PRODUCT_ID, outcome: "INCLUDED", policyMode: "INCLUDED_IN_OTHER_OPERATIONS" } as unknown as FrozenAssemblyOperationCostLine,
      ]),
      resealed(evidence, [...lines, mount]),
      resealed(
        evidence,
        lines.map((item) =>
          item === pack && "quantityProvenance" in item
            ? { ...item, quantityProvenance: { ...item.quantityProvenance, productionInputHash: "forged" } }
            : item,
        ),
      ),
      resealed(evidence, lines.map((item) => (item === mount ? { ...item, operationId: "ANSAMBLARE:OTHER" } : item))),
      { ...evidence, schema: "assembly-operation-cost-v0" as never },
      resealed(
        { ...evidence, policy: { ...evidence.policy, finalInspectionMode: "NOT_CONFIGURED" } },
        lines,
      ),
    ];
    for (const tampered of variants) {
      const result = reconcile(order, tampered);
      expect(result.operationEvidence).toBe("INVALID");
      expect(result.completeness).toBe("PARTIAL");
      expect(result.operationCostTotal).toBe(0);
      const production = produce({ ...order, operationCost: tampered });
      expect(production.eicCompleteness).toBe("PARTIAL");
      expect(production.operationCost?.evidenceStatus).toBe("INVALID");
    }
  });

  it("22. keeps site installation on its own frozen service line", () => {
    const plain = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members());
    const installed = flow(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members(), { withInstallation: true });
    const result = reconcile(installed.order);
    expect(result.siteInstallationEicOutsideTotal).toBe(150);
    expect(installed.production.eicTotal).toBe(plain.production.eicTotal);
    expect(installed.production.eicCompleteness).toBe("COMPLETE");
    expect(installed.production.operationCost?.unpricedProcessIds).not.toContain(INSTALL_AT_SITE_ID);
    expect(installed.production.operationCost?.pricedProcessIds).not.toContain(INSTALL_AT_SITE_ID);
  });

  it("reaches COMPLETE only when every child and assembly operation is accounted for", () => {
    const members = v2FullMembers();
    const { production, order } = flow(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, members);
    const childrenComplete = order.children.every((item) => item.eicCompleteness === "COMPLETE");
    expect(production.eicCompleteness).toBe(childrenComplete ? "COMPLETE" : "PARTIAL");
    const missingLogoHours = flow(SIGN_ASSEMBLY_ACM_SIGNAGE_V2, members, {
      estimates: [estimate(MOUNT_LETTERS_ON_PANEL_ID, 2.5)],
    });
    expect(missingLogoHours.production.eicCompleteness).toBe("PARTIAL");
    expect(missingLogoHours.production.operationCost?.unpricedProcessIds).toEqual([MOUNT_LOGO_ON_PANEL_ID]);
  });
});

describe("assembly operation estimates", () => {
  const actor = { userId: AUTHOR, at: "2026-10-10T09:00:00.000Z" };

  function draft(): AssemblyDefinition {
    return confirmedDefinition(SIGN_ASSEMBLY_ACM_LETTERS_V1, v1Members()).definition;
  }

  it("records hours with server-supplied author and time, outside the confirmed truth", () => {
    const definition = draft();
    const result = setAssemblyOperationEstimates(
      definition,
      [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 1.75 }],
      actor,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.operationEstimates).toEqual([
      { processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 1.75, authorUserId: AUTHOR, recordedAt: actor.at },
    ]);
    expect(result.definition.status).toBe(definition.status);
    expect(result.definition.confirmedTruthHash).toBe(definition.confirmedTruthHash);
    expect(result.definition.members).toEqual(definition.members);
  });

  it("keeps author and time for unchanged values and removes an estimate with null", () => {
    const first = setAssemblyOperationEstimates(
      draft(),
      [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 2 }],
      actor,
    );
    if (!first.ok) throw new Error("estimate failed");
    const unchanged = setAssemblyOperationEstimates(
      first.definition,
      [
        { processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 2 },
        { processId: INSPECT_FINISHED_ASSEMBLY_ID, personHours: 0.5 },
      ],
      { userId: "usr:other-owner", at: "2026-10-10T10:00:00.000Z" },
    );
    if (!unchanged.ok) throw new Error("estimate failed");
    expect(unchanged.definition.operationEstimates?.find((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toMatchObject({
      authorUserId: AUTHOR,
      recordedAt: actor.at,
    });
    const removed = setAssemblyOperationEstimates(
      unchanged.definition,
      [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: null }],
      actor,
    );
    if (!removed.ok) throw new Error("estimate failed");
    expect(removed.definition.operationEstimates?.map((item) => item.processId)).toEqual([
      INSPECT_FINISHED_ASSEMBLY_ID,
    ]);
  });

  it.each([
    [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 0 }],
    [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: -1 }],
    [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 1000.5 }],
    [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 1.234 }],
    [{ processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: Number.NaN }],
    [{ processId: MOUNT_LOGO_ON_PANEL_ID, personHours: 1 }],
    [{ processId: PACK_PRODUCT_ID, personHours: 1 }],
    [{ processId: "UNKNOWN", personHours: 1 }],
  ])("refuses an invalid estimate %j", (edit) => {
    const result = setAssemblyOperationEstimates(draft(), [edit], actor);
    expect(result.ok).toBe(false);
  });

  it("refuses duplicate edits for one process", () => {
    const result = setAssemblyOperationEstimates(
      draft(),
      [
        { processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 1 },
        { processId: MOUNT_LETTERS_ON_PANEL_ID, personHours: 2 },
      ],
      actor,
    );
    expect(result.ok).toBe(false);
  });
});
