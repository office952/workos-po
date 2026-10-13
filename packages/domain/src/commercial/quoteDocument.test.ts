import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "../product/acmCassetteNone.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { DEFAULT_COMMERCIAL_POLICY, type CommercialPolicy } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import type { AssemblyQuoteSnapshot } from "../assembly/snapshots.js";
import {
  formatCustomerMoneyAmount,
  projectAssemblyQuoteDocument,
  projectQuoteDocument,
} from "./quoteDocument.js";
import { freezeQuoteSnapshot, type QuoteSnapshot } from "./quoteSnapshot.js";

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
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": ACM_GOLDEN_DEPTH_MM,
};

function freezeLetters(values: DraftValues = lettersValues, createdAt = "2026-08-17T00:00:00.000Z") {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed LETTERS truth");
  }
  const aggregate = compileAggregate(truth, frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, seededDisplayLabelCatalog(), { formulaVersionsForType: starterFormulaVersionsForType });
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template, undefined, { formulaVersionsForType: starterFormulaVersionsForType });
  const eic = compileEic(aggregate, composition);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt },
  );
  if (!frozen.ok) {
    throw new Error(frozen.error);
  }
  return frozen.snapshot;
}

function freezeAcm(createdAt = "2026-08-17T00:00:00.000Z") {
  const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
    templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    values: acmValues,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed ACM truth");
  }
  const aggregate = compileAggregate(
    truth,
    acmCassetteNoneTemplate,
    acmCassetteNoneFormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, acmCassetteNoneTemplate);
  const eic = compileEic(aggregate, composition);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt },
  );
  if (!frozen.ok) {
    throw new Error(frozen.error);
  }
  return frozen.snapshot;
}

function documentText(snapshot: QuoteSnapshot): string {
  return JSON.stringify(projectQuoteDocument(snapshot));
}

function assemblyFixture() {
  const acm = freezeAcm();
  const letters = freezeLetters();
  const member = (
    snapshot: QuoteSnapshot,
    role: "SUPPORT_PANEL" | "SIGNAGE_LETTERS",
    roleLabel: string,
  ) => ({
    memberId: `mem:${role}`,
    role,
    roleLabel,
    productCode: snapshot.productCode,
    productLabel: snapshot.productLabel,
    inscription: snapshot.inscription,
    childQuoteSnapshotId: snapshot.quoteSnapshotId,
    childQuoteContentHash: snapshot.contentHash,
    confirmedTruthId: `truth:${role}`,
    confirmedTruthHash: snapshot.contentHash,
    commercial: snapshot.commercial,
  });
  const quote: AssemblyQuoteSnapshot = {
    quoteSnapshotId: "asmq:fixture",
    schemaVersion: 1,
    status: "FROZEN",
    organizationId: "org:fixture",
    requestId: null,
    assemblyKind: "SIGN_ASSEMBLY_ACM_SIGNAGE_V2",
    assemblyContractVersion: "product-assembly-v2",
    assemblyId: "asm:fixture",
    assemblyTruthId: "asmt:fixture",
    assemblyTruthHash: "hash",
    label: "Panou ACM + litere volumetrice",
    createdAt: "2026-09-02T08:00:00.000Z",
    contentHash: "47542fbce58a9891e8d82519",
    members: [
      member(letters, "SIGNAGE_LETTERS", "Litere"),
      member(acm, "SUPPORT_PANEL", "Panou ACM"),
    ],
    relationCommercialPrice: null,
    totals: {
      netPrice: 614.45,
      vatAmount: 129.03,
      grossPrice: 743.48,
      currency: "EUR",
      completeness: "COMPLETE",
    },
  };
  const memberTruths = new Map([
    ["truth:SIGNAGE_LETTERS", letters.truth],
    ["truth:SUPPORT_PANEL", acm.truth],
  ]);
  return { quote, memberTruths };
}

describe("assembly quote document projection", () => {
  it("projects one section per frozen member with its confirmed configuration and price", () => {
    const { quote, memberTruths } = assemblyFixture();
    const document = projectAssemblyQuoteDocument({
      quote,
      memberTruths,
      customerDisplayName: "Nord Market Demo SRL",
      seller: { legalName: "HUB MEDIA PRODUCTION S.R.L.", fiscalId: "RO54481582" },
    });
    expect(document.reference).toBe("OF-47542FBC");
    expect(document.issuedOn).toBe("02.09.2026");
    expect(document.productName).toBe("Panou ACM + litere volumetrice");
    expect(document.customerDisplayName).toBe("Nord Market Demo SRL");
    expect(document.issuerName).toBe("HUB MEDIA PRODUCTION S.R.L.");
    expect(document.configuration).toEqual([]);
    expect(document.sections?.map((section) => section.title)).toEqual(["Litere", "Panou ACM"]);
    const [letters, acm] = document.sections ?? [];
    expect(letters?.inscription).toBe("WORKOS");
    expect(letters?.configuration).toEqual(
      expect.arrayContaining([{ label: "Adâncime volum", value: "60 mm" }]),
    );
    expect(letters?.price).toEqual({ label: "Preț net", value: "516,38 EUR" });
    expect(acm?.productName).toBe("Panou ACM casetat");
    expect(acm?.technicalSummary).toEqual(
      expect.arrayContaining([{ label: "Lățime exterioară", value: "1.000 mm" }]),
    );
    expect(acm?.price).toEqual({ label: "Preț net", value: "98,07 EUR" });
    expect(document.commercial).toMatchObject({
      netLabel: "Total ofertă",
      netDisplay: "614,45",
      vatLabel: "TVA 21%",
      vatDisplay: "129,03",
      grossDisplay: "743,48",
      vatPercent: 21,
    });
    expect(document.filename).toBe("Oferta-OF-47542FBC.pdf");
  });

  it("omits the seller and customer when the registry has none instead of inventing them", () => {
    const { quote, memberTruths } = assemblyFixture();
    const document = projectAssemblyQuoteDocument({ quote, memberTruths });
    expect(document.seller).toBeUndefined();
    expect(document.customerDisplayName).toBeUndefined();
  });

  it("does not print a single VAT rate when sections carry different rates", () => {
    const { quote, memberTruths } = assemblyFixture();
    const [first, second] = quote.members;
    const mixed: AssemblyQuoteSnapshot = {
      ...quote,
      members: [first!, { ...second!, commercial: { ...second!.commercial, vatPercent: 9 } }],
    };
    const document = projectAssemblyQuoteDocument({ quote: mixed, memberTruths });
    expect(document.commercial.vatLabel).toBe("TVA");
    expect(document.commercial.vatPercent).toBeNull();
  });

  it("excludes internal cost, provenance and identity leakage", () => {
    const { quote, memberTruths } = assemblyFixture();
    const text = JSON.stringify(projectAssemblyQuoteDocument({ quote, memberTruths }));
    expect(text).not.toMatch(/382\.5|72\.644|EIC|markup|asmq:|asm:|truth:|qts:|contentHash|policyId/i);
    expect(text).not.toMatch(/PRD-LETTERS|PRD-ACM|SUPPORT_PANEL|SIGNAGE_LETTERS/);
  });
});

describe("quote document projection", () => {
  it("projects LETTERS customer facts from the frozen snapshot only", () => {
    const snapshot = freezeLetters();
    const document = projectQuoteDocument(snapshot);
    expect(document.title).toBe("Ofertă");
    expect(document.issuerName).toBe("WorkOS Final");
    expect(document.status).toBe("Ofertă");
    expect(document.reference).toMatch(/^OF-[0-9A-F]{8}$/);
    expect(document.reference).toBe(`OF-${snapshot.contentHash.slice(0, 8).toUpperCase()}`);
    expect(document.issuedOn).toBe("17.08.2026");
    expect(document.productName).toContain("Litere volumetrice luminoase");
    expect(document.inscription).toBe("WORKOS");
    expect(document.configuration).toEqual(
      expect.arrayContaining([
        { label: "Finisaj față", value: "Fără finisaj" },
        { label: "Adâncime volum", value: "60 mm" },
        { label: "Finisaj volum", value: "Fără finisaj" },
      ]),
    );
    expect(document.technicalSummary).toEqual(
      expect.arrayContaining([
        { label: "Suprafață confirmată față", value: "250.000 mm²" },
        { label: "Perimetru confirmat volum", value: "12.500 mm" },
      ]),
    );
    expect(document.commercial).toMatchObject({
      netLabel: "Subtotal",
      netDisplay: "516,38",
      vatLabel: "TVA 21%",
      vatDisplay: "108,44",
      grossLabel: "Total",
      grossDisplay: "624,82",
      currency: "EUR",
      netPrice: 516.38,
      vatAmount: 108.44,
      vatPercent: 21,
      grossPrice: 624.82,
    });
    expect(document.filename).toBe(`Oferta-${document.reference}.pdf`);
    expect(document.customerDisplayName).toBeUndefined();
  });

  it("projects the frozen customer display name and ignores a later rename", () => {
    const snapshot = freezeLetters();
    const withCustomer: QuoteSnapshot = {
      ...snapshot,
      customer: { customerId: "cus:letters", displayName: "Client Demo LETTERS" },
    };
    const renamedLive: QuoteSnapshot = {
      ...withCustomer,
      customer: { customerId: "cus:letters", displayName: "Client Demo NOU" },
    };
    expect(projectQuoteDocument(withCustomer).customerDisplayName).toBe("Client Demo LETTERS");
    expect(projectQuoteDocument(snapshot).customerDisplayName).toBeUndefined();
    expect(projectQuoteDocument(renamedLive).customerDisplayName).toBe("Client Demo NOU");
  });

  it("projects frozen seller identity and ignores a later live rename", () => {
    const snapshot = freezeLetters();
    const withSeller: QuoteSnapshot = {
      ...snapshot,
      seller: {
        legalName: "HUB MEDIA PRODUCTION S.R.L.",
        brand: "HUB MEDIA PRODUCTION",
        fiscalId: "RO54481582",
        address: "Șos. Sălaj, Nr. 351-353, Bl. 5, Et. 2, Ap. 22, Sector 5",
        locality: "București",
        iban: "RO81RZBR0000060030657337",
        bank: "RAIFFEISEN BANK",
      },
    };
    const document = projectQuoteDocument(withSeller);
    expect(document.issuerName).toBe("HUB MEDIA PRODUCTION S.R.L.");
    expect(document.seller?.fiscalId).toBe("RO54481582");
    expect(document.seller?.iban).toBe("RO81RZBR0000060030657337");
    expect(projectQuoteDocument(snapshot).seller).toBeUndefined();
    expect(projectQuoteDocument(snapshot).issuerName).toBe("WorkOS Final");
  });

  it("projects ACM customer facts without a product-code branch", () => {
    const snapshot = freezeAcm();
    const document = projectQuoteDocument(snapshot);
    expect(document.productName).toBe("Panou ACM casetat");
    expect(document.inscription).toBe("PANOU ACM");
    expect(document.configuration).toEqual(
      expect.arrayContaining([
        { label: "Finisaj față", value: "Fără finisaj" },
      ]),
    );
    expect(document.configuration).not.toEqual(
      expect.arrayContaining([
        { label: "Prindere", value: "Cornier oțel" },
        { label: "Îndoituri", value: "2" },
      ]),
    );
    expect(document.technicalSummary).toEqual(
      expect.arrayContaining([
        { label: "Lățime exterioară", value: "1.000 mm" },
        { label: "Înălțime exterioară", value: "500 mm" },
        { label: "Adâncime casetă / prima întoarcere", value: "40 mm" },
      ]),
    );
    expect(document.commercial.grossPrice).toBe(118.66);
    expect(document.commercial.grossDisplay).toBe("118,66");
    expect(document.commercial.netDisplay).toBe("98,07");
    expect(document.commercial.vatDisplay).toBe("20,59");
    expect(document.commercial.currency).toBe("EUR");
  });

  it("keeps frozen commercial values after the live policy changes", () => {
    const snapshot = freezeLetters();
    const laterPolicy: CommercialPolicy = {
      ...DEFAULT_COMMERCIAL_POLICY,
      version: 2,
      markupPercent: 70,
      vatPercent: 19,
    };
    const live = projectCommercialPrice(
      { total: snapshot.eic.total, currency: snapshot.eic.currency, completeness: "COMPLETE" },
      laterPolicy,
    );
    expect(live.grossPrice).not.toBe(624.82);
    const document = projectQuoteDocument(snapshot);
    expect(document.commercial.grossPrice).toBe(624.82);
    expect(document.commercial.vatPercent).toBe(21);
    expect(document.issuedOn).toBe("17.08.2026");
  });

  it("uses the frozen createdAt date, not the current clock", () => {
    const snapshot = freezeLetters(lettersValues, "2026-01-05T23:15:00.000Z");
    expect(projectQuoteDocument(snapshot).issuedOn).toBe("05.01.2026");
  });

  it("omits empty inscription instead of inventing a client", () => {
    const snapshot = { ...freezeLetters(), inscription: "   " };
    expect(projectQuoteDocument(snapshot).inscription).toBeUndefined();
  });

  it("sanitizes control characters in inscription", () => {
    const snapshot = freezeLetters({
      ...lettersValues,
      "root.inscription": "Ofertă\u0000 <script> & „WORKOS”",
    });
    expect(projectQuoteDocument(snapshot).inscription).toBe("Ofertă <script> & „WORKOS”");
  });

  it("excludes internal cost, provenance, and identity leakage", () => {
    const letters = documentText(freezeLetters());
    const acm = documentText(freezeAcm());
    for (const text of [letters, acm]) {
      expect(text).not.toMatch(/382\.5|72\.644|EIC|AI_DECISION|markup|qts:|contentHash|schemaVersion/i);
      expect(text).not.toMatch(/PRD-LETTERS|PRD-ACM|resourceId|recipe|ExecutionPlan|provider/i);
      expect(text).not.toMatch(/DEFAULT_COMMERCIAL_POLICY|policyId|policyVersion/);
    }
  });

  it("prints Romanian amounts with a visible EUR unit", () => {
    expect(formatCustomerMoneyAmount(624.82)).toBe("624,82 EUR");
    expect(formatCustomerMoneyAmount(382.5)).toBe("382,50 EUR");
  });

  it("does not branch on product codes in the projection source", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "quoteDocument.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/PRD-LETTERS|PRD-ACM|productCode/);
    expect(source).not.toMatch(/projectCommercialPrice|compileEic|getProductTemplate/);
  });
});
