import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import type { QuoteCommercialTerms } from "../commercial/quoteTerms.js";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "../product/acmCassetteNone.js";
import { compileAcceptedProductEvaluation } from "../product/acceptedEvaluation.js";
import { compileDefinition, confirmReviewedDefinition } from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import {
  LOGO_PRODUCT_CODE,
  logoFrontlitPlexiAl06FormSchema,
  logoFrontlitPlexiAl06Template,
  logoReadyValues,
} from "../product/logoFrontlitPlexiAl06.js";
import {
  productEnablementEntries,
  type ProductEnablementResolution,
} from "../product/productEnablement.js";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import type { DraftValues, FormSchema, ProductTemplate } from "../product/types.js";
import { costEvidence } from "../resources/catalog.js";
import {
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import { SIGN_ASSEMBLY_ACM_SIGNAGE_V2 } from "./contract.js";
import {
  acceptAssemblyQuote,
  assemblyAvailableForNewWork,
  assemblyV2AvailableForNewWork,
  attachConfirmedChild,
  confirmAssembly,
  createAssemblyDefinition,
  freezeAssemblyQuote,
  hashProductAggregate,
  hashProductTruth,
  projectAssemblyProduction,
  type ConfirmedChildProduct,
} from "./index.js";

const ORG = "org-logo-assembly";
const lettersValues: DraftValues = {
  "root.inscription": "LITERE",
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

function child(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
  truthId: string,
  quoteTerms?: QuoteCommercialTerms,
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
    projectCommercialPrice(compiled.eic, DEFAULT_COMMERCIAL_POLICY, quoteTerms),
    { createdAt: "2026-09-24T00:00:00.000Z" },
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

function openV2(codes: readonly string[]) {
  return createAssemblyDefinition({
    assemblyId: "asm-v2",
    organizationId: ORG,
    requestId: "req-v2",
    customerId: "cus-v2",
    resolution: resolution(codes),
    createdAt: "2026-09-24T00:00:00.000Z",
    kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  });
}

describe("product assembly v2", () => {
  const acm = () => child(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues, "child-acm");
  const logo = () =>
    child(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, logoReadyValues, "child-logo");
  const letters = () =>
    child(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, lettersValues, "child-letters");

  it("accepts ACM plus logo without letters", () => {
    const created = openV2([ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE]);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(assemblyAvailableForNewWork(resolution([ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE]))).toBe(
      false,
    );
    expect(assemblyV2AvailableForNewWork(resolution([ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE]))).toBe(
      true,
    );
    const panel = acm();
    const mark = logo();
    const withPanel = attachConfirmedChild(created.definition, panel, "SUPPORT_PANEL", created.definition.createdAt);
    const withLogo = withPanel.ok
      ? attachConfirmedChild(withPanel.definition, mark, "SIGNAGE_LOGO", created.definition.createdAt)
      : withPanel;
    expect(withLogo.ok).toBe(true);
    if (!withLogo.ok) {
      return;
    }
    expect(withLogo.definition.members.map((item) => item.role).sort()).toEqual([
      "SIGNAGE_LOGO",
      "SUPPORT_PANEL",
    ]);
    expect(withLogo.definition.relations.map((item) => item.kind)).toEqual(["LOGO_ON_ACM_PANEL"]);
    const confirmed = confirmAssembly(withLogo.definition, [panel, mark], [], "2026-09-24T01:00:00.000Z");
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) {
      return;
    }
    expect(JSON.stringify(confirmed.truth)).not.toMatch(/childQuoteSnapshotId|childQuoteContentHash/);
    const quote = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-logo",
      truth: confirmed.truth,
      children: [panel, mark],
      createdAt: "2026-09-24T01:10:00.000Z",
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) {
      return;
    }
    expect(quote.quote.label).toBe("Panou ACM + logo volumetric");
    expect(quote.quote.members.map((item) => item.role)).toEqual(["SUPPORT_PANEL", "SIGNAGE_LOGO"]);
    expect(quote.quote.relationCommercialPrice).toBeNull();
    const order = acceptAssemblyQuote({
      orderSnapshotId: "asmo-logo",
      quote: quote.quote,
      children: [panel, mark],
      createdAt: "2026-09-24T01:20:00.000Z",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) {
      return;
    }
    const production = projectAssemblyProduction(order.order, {
      snapshotId: "asmp-logo",
      createdAt: "2026-09-24T01:30:00.000Z",
    });
    expect(production.ok).toBe(true);
    if (!production.ok) {
      return;
    }
    const processes = [
      ...production.snapshot.members.flatMap((member) => member.operations),
      ...production.snapshot.assemblyOperations,
    ];
    expect(processes.filter((item) => item.processId === MOUNT_LOGO_ON_PANEL_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    const logoMount = production.snapshot.assemblyOperations.find(
      (item) => item.processId === MOUNT_LOGO_ON_PANEL_ID,
    );
    const supportIds = new Set(
      production.snapshot.members
        .find((member) => member.role === "SUPPORT_PANEL")
        ?.operations.map((item) => item.id),
    );
    const logoIds = new Set(
      production.snapshot.members
        .find((member) => member.role === "SIGNAGE_LOGO")
        ?.operations.map((item) => item.id),
    );
    expect(logoMount?.dependsOn.every((id) => supportIds.has(id) || logoIds.has(id))).toBe(true);
    expect(logoMount?.dependsOn.some((id) => supportIds.has(id))).toBe(true);
    expect(logoMount?.dependsOn.some((id) => logoIds.has(id))).toBe(true);
  });

  it("accepts ACM, letters, and logo with independent mount dependencies", () => {
    const created = openV2([
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      LOGO_PRODUCT_CODE,
      CANONICAL_PRODUCT_CODE,
    ]);
    if (!created.ok) {
      throw new Error(created.error);
    }
    const panel = acm();
    const mark = logo();
    const text = letters();
    let definition = created.definition;
    for (const [role, item] of [
      ["SUPPORT_PANEL", panel],
      ["SIGNAGE_LOGO", mark],
      ["SIGNAGE_LETTERS", text],
    ] as const) {
      const attached = attachConfirmedChild(definition, item, role, definition.updatedAt);
      if (!attached.ok) {
        throw new Error(attached.error);
      }
      definition = attached.definition;
    }
    const confirmed = confirmAssembly(definition, [panel, mark, text], [], "2026-09-24T02:00:00.000Z");
    if (!confirmed.ok) {
      throw new Error(confirmed.error);
    }
    const quote = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-full",
      truth: confirmed.truth,
      children: [panel, mark, text],
      createdAt: "2026-09-24T02:10:00.000Z",
    });
    if (!quote.ok) {
      throw new Error(quote.error);
    }
    expect(quote.quote.label).toBe("Panou ACM + litere + logo volumetric");
    expect(quote.quote.members.map((item) => item.role)).toEqual([
      "SUPPORT_PANEL",
      "SIGNAGE_LETTERS",
      "SIGNAGE_LOGO",
    ]);
    const order = acceptAssemblyQuote({
      orderSnapshotId: "asmo-full",
      quote: quote.quote,
      children: [panel, mark, text],
      createdAt: "2026-09-24T02:20:00.000Z",
    });
    if (!order.ok) {
      throw new Error(order.error);
    }
    const production = projectAssemblyProduction(order.order, {
      snapshotId: "asmp-full",
      createdAt: "2026-09-24T02:30:00.000Z",
    });
    if (!production.ok) {
      throw new Error(production.error);
    }
    const processes = [
      ...production.snapshot.members.flatMap((member) => member.operations),
      ...production.snapshot.assemblyOperations,
    ];
    expect(processes.filter((item) => item.processId === MOUNT_LOGO_ON_PANEL_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_LETTER_ID)).toHaveLength(0);
    expect(processes.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    expect(processes.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    const idsFor = (role: string) =>
      new Set(
        production.snapshot.members
          .find((member) => member.role === role)
          ?.operations.map((item) => item.id) ?? [],
      );
    const supportIds = idsFor("SUPPORT_PANEL");
    const logoIds = idsFor("SIGNAGE_LOGO");
    const letterIds = idsFor("SIGNAGE_LETTERS");
    const logoMount = production.snapshot.assemblyOperations.find(
      (item) => item.processId === MOUNT_LOGO_ON_PANEL_ID,
    );
    const lettersMount = production.snapshot.assemblyOperations.find(
      (item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID,
    );
    expect(logoMount?.dependsOn.some((id) => letterIds.has(id))).toBe(false);
    expect(lettersMount?.dependsOn.some((id) => logoIds.has(id))).toBe(false);
    expect(logoMount?.dependsOn.some((id) => supportIds.has(id))).toBe(true);
    expect(logoMount?.dependsOn.some((id) => logoIds.has(id))).toBe(true);
    expect(lettersMount?.dependsOn.some((id) => supportIds.has(id))).toBe(true);
    expect(lettersMount?.dependsOn.some((id) => letterIds.has(id))).toBe(true);
    const qc = production.snapshot.assemblyOperations.find(
      (item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID,
    );
    expect(qc?.dependsOn).toEqual(
      expect.arrayContaining([logoMount?.id, lettersMount?.id].filter((id): id is string => Boolean(id))),
    );
  });

  it("rejects invalid cardinality, templates, relations, and cross-organization children", () => {
    const created = openV2([
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      LOGO_PRODUCT_CODE,
      CANONICAL_PRODUCT_CODE,
    ]);
    if (!created.ok) {
      throw new Error(created.error);
    }
    const panel = acm();
    const mark = logo();
    const text = letters();
    const wrongLogoRole = attachConfirmedChild(
      created.definition,
      text,
      "SIGNAGE_LOGO",
      created.definition.createdAt,
    );
    expect(wrongLogoRole.ok).toBe(false);
    const foreign = { ...panel, organizationId: "org-other" };
    const cross = attachConfirmedChild(created.definition, foreign, "SUPPORT_PANEL", created.definition.createdAt);
    expect(cross.ok).toBe(false);
    let definition = created.definition;
    for (const [role, item] of [
      ["SUPPORT_PANEL", panel],
      ["SIGNAGE_LOGO", mark],
    ] as const) {
      const attached = attachConfirmedChild(definition, item, role, definition.updatedAt);
      if (!attached.ok) {
        throw new Error(attached.error);
      }
      definition = attached.definition;
    }
    const missingLogo = confirmAssembly(
      { ...definition, members: definition.members.filter((item) => item.role !== "SIGNAGE_LOGO"), relations: [] },
      [panel, mark],
      [],
      "2026-09-24T03:00:00.000Z",
    );
    expect(missingLogo.ok).toBe(false);
    const logoMember = definition.members.find((item) => item.role === "SIGNAGE_LOGO");
    if (!logoMember) {
      throw new Error("missing logo member");
    }
    const duplicated = confirmAssembly(
      {
        ...definition,
        members: [...definition.members, { ...logoMember, memberId: "member:signage-logo-2" }],
      },
      [panel, mark],
      [],
      "2026-09-24T03:00:00.000Z",
    );
    expect(duplicated.ok).toBe(false);
    const self = confirmAssembly(
      {
        ...definition,
        relations: definition.relations.map((relation) => ({
          ...relation,
          targetMemberId: relation.sourceMemberId,
        })),
      },
      [panel, mark],
      [],
      "2026-09-24T03:00:00.000Z",
    );
    expect(self.ok).toBe(false);
    const missingRelation = confirmAssembly(
      { ...definition, relations: [] },
      [panel, mark],
      [],
      "2026-09-24T03:00:00.000Z",
    );
    expect(missingRelation.ok).toBe(false);
    const withLetters = attachConfirmedChild(definition, text, "SIGNAGE_LETTERS", definition.updatedAt);
    if (!withLetters.ok) {
      throw new Error(withLetters.error);
    }
    const missingLettersRelation = confirmAssembly(
      {
        ...withLetters.definition,
        relations: withLetters.definition.relations.filter((item) => item.kind !== "LETTERS_ON_ACM_PANEL"),
      },
      [panel, mark, text],
      [],
      "2026-09-24T03:00:00.000Z",
    );
    expect(missingLettersRelation.ok).toBe(false);
  });

  it("keeps assembly truth stable when only logo commercial terms change", () => {
    const created = openV2([ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE]);
    if (!created.ok) {
      throw new Error(created.error);
    }
    const panel = acm();
    const mark = logo();
    const repriced = child(
      logoFrontlitPlexiAl06Template,
      logoFrontlitPlexiAl06FormSchema,
      logoReadyValues,
      mark.truthId,
      { markupPercent: 80, discountPercent: 0, adjustmentAmount: 0 },
    );
    let definition = created.definition;
    for (const [role, item] of [
      ["SUPPORT_PANEL", panel],
      ["SIGNAGE_LOGO", mark],
    ] as const) {
      const attached = attachConfirmedChild(definition, item, role, definition.updatedAt);
      if (!attached.ok) {
        throw new Error(attached.error);
      }
      definition = attached.definition;
    }
    const first = confirmAssembly(definition, [panel, mark], [], "2026-09-24T04:00:00.000Z");
    const second = confirmAssembly(definition, [panel, repriced], [], "2026-09-24T04:05:00.000Z");
    if (!first.ok || !second.ok) {
      throw new Error("confirm failed");
    }
    expect(second.truth.contentHash).toBe(first.truth.contentHash);
    const quoteA = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-a",
      truth: first.truth,
      children: [panel, mark],
      createdAt: "2026-09-24T04:10:00.000Z",
    });
    const quoteB = freezeAssemblyQuote({
      quoteSnapshotId: "asmq-b",
      truth: first.truth,
      children: [panel, repriced],
      createdAt: "2026-09-24T04:10:00.000Z",
    });
    if (!quoteA.ok || !quoteB.ok) {
      throw new Error("quote failed");
    }
    expect(quoteA.quote.contentHash).not.toBe(quoteB.quote.contentHash);
    expect(quoteA.quote.totals.grossPrice).not.toBe(quoteB.quote.totals.grossPrice);
  });

  it("marks a confirmed assembly stale when logo truth changes and keeps the previous truth", () => {
    const created = openV2([ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE]);
    if (!created.ok) {
      throw new Error(created.error);
    }
    const panel = acm();
    const mark = logo();
    let definition = created.definition;
    for (const [role, item] of [
      ["SUPPORT_PANEL", panel],
      ["SIGNAGE_LOGO", mark],
    ] as const) {
      const attached = attachConfirmedChild(definition, item, role, definition.updatedAt);
      if (!attached.ok) {
        throw new Error(attached.error);
      }
      definition = attached.definition;
    }
    const first = confirmAssembly(definition, [panel, mark], [], "2026-09-24T05:00:00.000Z");
    if (!first.ok) {
      throw new Error(first.error);
    }
    const frozen = { ...first.truth, members: first.truth.members.map((item) => ({ ...item })) };
    const changed = child(
      logoFrontlitPlexiAl06Template,
      logoFrontlitPlexiAl06FormSchema,
      { ...logoReadyValues, "volume.confirmedPerimeterMm": 9000 },
      "child-logo-next",
    );
    const stale = attachConfirmedChild(first.definition, changed, "SIGNAGE_LOGO", "2026-09-24T05:10:00.000Z");
    expect(stale.ok && stale.definition.status).toBe("STALE");
    expect(first.truth).toEqual(frozen);
  });
});
