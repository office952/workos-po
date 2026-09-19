import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  OWNER_CONFIRMED_SELLER,
  collectFinancialKeys,
  type QuoteSnapshot,
} from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

const readyValues = {
  "root.inscription": "BANI",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function confirmPlatformCostEvidence(
  app: {
    request: (path: string, init?: RequestInit) => Response | Promise<Response>;
  },
  cookie: string,
) {
  const admin = await json(
    await app.request("/api/resources-admin", { headers: { cookie } }),
  );
  const rows = (admin.costEvidence as Array<{ evidenceRowId?: string; amount?: number }>) ?? [];
  for (const row of rows) {
    if (!row.evidenceRowId || typeof row.amount !== "number") {
      continue;
    }
    const written = await app.request(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`,
      {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ amount: row.amount, note: "Confirmat test financiar" }),
      },
    );
    expect(written.status).toBe(200);
  }
}

describe("ALT_B_SCOPED financial access", () => {
  it("filters owner, member-commercial and workshop payloads", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier Bani");
    await addUser(fixture, {
      email: "owner-bani@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-bani@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-bani@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const member = await loginCloud(
      fixture.app,
      "member-bani@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const ownerHeaders = {
      cookie: owner.cookie ?? "",
      "content-type": "application/json",
    };
    const memberHeaders = { cookie: member.cookie ?? "" };

    const seller = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers: ownerHeaders,
      body: JSON.stringify({
        legalName: OWNER_CONFIRMED_SELLER.legalName,
        brand: OWNER_CONFIRMED_SELLER.brand,
        fiscalId: OWNER_CONFIRMED_SELLER.fiscalId,
        tradeRegister: OWNER_CONFIRMED_SELLER.tradeRegister,
        address: OWNER_CONFIRMED_SELLER.address,
        locality: OWNER_CONFIRMED_SELLER.locality,
        iban: OWNER_CONFIRMED_SELLER.iban,
        bank: OWNER_CONFIRMED_SELLER.bank,
      }),
    });
    expect(seller.status).toBe(200);
    await confirmPlatformCostEvidence(fixture.app, owner.cookie ?? "");

    const compiled = await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ values: readyValues }),
    });
    const compiledBody = await json(compiled);
    const confirmOwner = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          definition: compiledBody.definition,
          reviewId: compiledBody.reviewId,
        }),
      },
    );
    const confirmOwnerBody = await json(confirmOwner);
    const ownerConfirmKeys = collectFinancialKeys(confirmOwnerBody);
    expect(ownerConfirmKeys.has("internalCost")).toBe(true);
    expect(ownerConfirmKeys.has("markupPercent")).toBe(true);
    expect(ownerConfirmKeys.has("grossPrice")).toBe(true);

    const confirmMember = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: { ...memberHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          definition: compiledBody.definition,
          reviewId: compiledBody.reviewId,
        }),
      },
    );
    const confirmMemberBody = await json(confirmMember);
    const memberConfirmKeys = collectFinancialKeys(confirmMemberBody);
    expect(memberConfirmKeys.has("grossPrice")).toBe(true);
    expect(memberConfirmKeys.has("netPrice")).toBe(true);
    expect(memberConfirmKeys.has("internalCost")).toBe(false);
    expect(memberConfirmKeys.has("markupPercent")).toBe(false);
    expect(memberConfirmKeys.has("eic")).toBe(false);

    const customer = await fixture.app.request("/api/customers", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ displayName: "Client Bani" }),
    });
    expect(customer.status).toBe(201);
    const customerId = ((await json(customer)).customer as { customerId: string }).customerId;
    const createdQuote = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          definition: compiledBody.definition,
          reviewId: compiledBody.reviewId,
          customerId,
        }),
      },
    );
    const createdQuoteBody = await json(createdQuote);
    expect(createdQuote.status, JSON.stringify(createdQuoteBody)).toBe(200);
    const quoteId = (createdQuoteBody.quoteSnapshot as { quoteSnapshotId: string }).quoteSnapshotId;

    const memberQuote = await json(
      await fixture.app.request(`/api/quotes/${encodeURIComponent(quoteId)}`, {
        headers: memberHeaders,
      }),
    );
    const memberQuoteKeys = collectFinancialKeys(memberQuote);
    expect(memberQuoteKeys.has("grossPrice")).toBe(true);
    expect(memberQuoteKeys.has("internalCost")).toBe(false);
    expect(memberQuoteKeys.has("markupPercent")).toBe(false);
    expect(memberQuoteKeys.has("marginAmount")).toBe(false);
    expect(memberQuoteKeys.has("eic")).toBe(false);
    expect(memberQuoteKeys.has("rate")).toBe(false);
    expect(memberQuoteKeys.has("cost")).toBe(false);

    const ownerQuote = await json(
      await fixture.app.request(`/api/quotes/${encodeURIComponent(quoteId)}`, {
        headers: { cookie: owner.cookie ?? "" },
      }),
    );
    expect(collectFinancialKeys(ownerQuote).has("internalCost")).toBe(true);
    expect(collectFinancialKeys(ownerQuote).has("marginAmount")).toBe(true);

    await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/acceptance`,
      { method: "POST", headers: { cookie: owner.cookie ?? "" } },
    );
    const createdOrder = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/order`,
      { method: "POST", headers: { cookie: owner.cookie ?? "" } },
    );
    const orderId = ((await json(createdOrder)).orderSnapshot as { orderSnapshotId: string })
      .orderSnapshotId;
    const released = await json(
      await fixture.app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(orderId)}/production-release`,
        { method: "POST", headers: { cookie: owner.cookie ?? "" } },
      ),
    );
    const snapshotId = (released.snapshot as { snapshotId: string }).snapshotId;
    const planned = await json(
      await fixture.app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(snapshotId)}/execution-plan`,
        { method: "POST", headers: { cookie: owner.cookie ?? "" } },
      ),
    );
    const planId = (planned.executionPlan as { plan: { planId: string } }).plan.planId;

    const memberJob = await json(
      await fixture.app.request(`/api/jobs/${encodeURIComponent(orderId)}`, {
        headers: memberHeaders,
      }),
    );
    const memberJobKeys = collectFinancialKeys(memberJob);
    expect(memberJobKeys.has("grossPrice")).toBe(true);
    expect(memberJobKeys.has("internalCost")).toBe(false);
    expect(memberJobKeys.has("markupPercent")).toBe(false);
    expect(memberJobKeys.has("eicTotal")).toBe(false);
    expect(memberJobKeys.has("actualInternalCost")).toBe(false);

    const ownerJob = await json(
      await fixture.app.request(`/api/jobs/${encodeURIComponent(orderId)}`, {
        headers: { cookie: owner.cookie ?? "" },
      }),
    );
    expect(collectFinancialKeys(ownerJob).has("internalCost")).toBe(true);
    expect(collectFinancialKeys(ownerJob).has("eicTotal")).toBe(true);

    const memberExecution = await json(
      await fixture.app.request(`/api/execution-plans/${encodeURIComponent(planId)}`, {
        headers: memberHeaders,
      }),
    );
    const workshopKeys = collectFinancialKeys(memberExecution);
    expect(workshopKeys.has("internalCost")).toBe(false);
    expect(workshopKeys.has("markupPercent")).toBe(false);
    expect(workshopKeys.has("marginAmount")).toBe(false);
    expect(workshopKeys.has("netPrice")).toBe(false);
    expect(workshopKeys.has("vatPercent")).toBe(false);
    expect(workshopKeys.has("grossPrice")).toBe(false);
    expect(workshopKeys.has("eicTotal")).toBe(false);
    expect(workshopKeys.has("actualInternalCost")).toBe(false);

    const ownerExecution = await json(
      await fixture.app.request(`/api/execution-plans/${encodeURIComponent(planId)}`, {
        headers: { cookie: owner.cookie ?? "" },
      }),
    );
    expect(collectFinancialKeys(ownerExecution).has("eicTotal")).toBe(false);
    expect(collectFinancialKeys(ownerExecution).has("actualInternalCost")).toBe(false);

    const memberResources = await json(
      await fixture.app.request("/api/resources-admin", { headers: memberHeaders }),
    );
    expect(collectFinancialKeys(memberResources).has("rate")).toBe(false);
    expect(JSON.stringify(memberResources)).not.toContain("\"amount\"");
    expect(JSON.stringify(memberResources)).not.toContain("amountDisplay");
    expect(JSON.stringify(memberResources)).not.toMatch(/\d+,\d{2} EUR/);

    expect((await fixture.app.request("/api/quotes/qts:missing")).status).toBe(401);
    expect((await fixture.app.request("/api/jobs/ord:missing")).status).toBe(401);

    fixture.close();
  });

  it("does not expose persisted v2 service evidence to a commercial member", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Acces V2");
    await addUser(fixture, {
      email: "owner-v2@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-v2@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-v2@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const member = await loginCloud(
      fixture.app,
      "member-v2@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    expect(
      (
        await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}`, {
          headers: { cookie: owner.cookie ?? "" },
        })
      ).status,
    ).toBe(200);
    const runtime = fixture.registry.getOrOpen(org.plane, fixture.cloudRoot);
    runtime.persistQuoteSnapshot(syntheticPersistedQuoteV2());

    const memberResponse = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent("qts:v2-subcontract")}`,
      { headers: { cookie: member.cookie ?? "" } },
    );
    expect(memberResponse.status).toBe(200);
    const memberQuote = await json(memberResponse);
    const snapshot = memberQuote.quoteSnapshot as Record<string, unknown>;
    const lines = (snapshot.lines as Array<Record<string, unknown>>) ?? [];
    const install = lines.find((line) => line.kind === "SITE_INSTALLATION");
    expect(install?.commercial).toMatchObject({ netPrice: 200, grossPrice: 242 });
    expect(install).not.toHaveProperty("evidence");
    expect(install).not.toHaveProperty("eic");
    expect(JSON.stringify(memberQuote)).not.toContain("Montaj Rapid SRL");
    expect(JSON.stringify(memberQuote)).not.toContain("\"amount\":180");
    expect(collectFinancialKeys(memberQuote).has("eic")).toBe(false);

    const ownerResponse = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent("qts:v2-subcontract")}`,
      { headers: { cookie: owner.cookie ?? "" } },
    );
    expect(ownerResponse.status).toBe(200);
    const ownerQuote = await json(ownerResponse);
    const ownerInstall = (
      ((ownerQuote.quoteSnapshot as Record<string, unknown>).lines as Array<
        Record<string, unknown>
      >) ?? []
    ).find((line) => line.kind === "SITE_INSTALLATION");
    expect(ownerInstall?.evidence).toMatchObject({
      amount: 180,
      supplierLabel: "Montaj Rapid SRL",
    });
    fixture.close();
  });

  it("does not expose persisted Order v2 evidence to a commercial member", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Acces Order V2");
    await addUser(fixture, {
      email: "owner-order-v2@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-order-v2@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-order-v2@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const member = await loginCloud(
      fixture.app,
      "member-order-v2@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    expect(
      (
        await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}`, {
          headers: { cookie: owner.cookie ?? "" },
        })
      ).status,
    ).toBe(200);
    const runtime = fixture.registry.getOrOpen(org.plane, fixture.cloudRoot);
    const quote = syntheticPersistedQuoteV2();
    runtime.persistQuoteSnapshot(quote);
    runtime.persistQuoteAcceptance({
      acceptanceId: "qad:v2-subcontract",
      schemaVersion: 1,
      quoteSnapshotId: quote.quoteSnapshotId,
      quoteContentHash: quote.contentHash,
      acceptedAt: "2026-09-04T01:00:00.000Z",
    });
    runtime.persistOrderSnapshot({
      orderSnapshotId: "ord:v2-subcontract",
      schemaVersion: 2,
      status: "FROZEN",
      createdAt: "2026-09-04T00:00:00.000Z",
      sourceQuoteSnapshotId: quote.quoteSnapshotId,
      sourceQuoteContentHash: quote.contentHash,
      sourceAcceptanceId: "qad:v2-subcontract",
      sourceAcceptedAt: "2026-09-04T01:00:00.000Z",
      productCode: quote.productCode,
      productLabel: quote.productLabel,
      inscription: quote.inscription,
      sourceReviewId: quote.sourceReviewId,
      contentHash: "hash-order-v2-subcontract-api",
      truth: quote.truth,
      quantities: quote.quantities,
      eic: quote.eic,
      commercial: quote.commercial,
      productionInput: quote.productionInput,
      lines: quote.lines,
      jobCommercial: quote.jobCommercial,
    });

    const memberResponse = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/ord:v2-subcontract`,
      { headers: { cookie: member.cookie ?? "" } },
    );
    expect(memberResponse.status).toBe(200);
    const memberBody = await json(memberResponse);
    const memberOrder = memberBody.orderSnapshot as Record<string, unknown>;
    const memberInstall = (
      (memberOrder.lines as Array<Record<string, unknown>>) ?? []
    ).find((line) => line.kind === "SITE_INSTALLATION");
    expect(memberOrder.jobCommercial).toMatchObject({ grossPrice: 866.82 });
    expect(memberInstall?.commercial).toMatchObject({ netPrice: 200, grossPrice: 242 });
    expect(memberInstall).not.toHaveProperty("evidence");
    expect(memberInstall).not.toHaveProperty("eic");
    expect(JSON.stringify(memberBody)).not.toContain("Montaj Rapid SRL");
    expect(collectFinancialKeys(memberBody).has("eic")).toBe(false);

    const ownerResponse = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/ord:v2-subcontract`,
      { headers: { cookie: owner.cookie ?? "" } },
    );
    expect(ownerResponse.status).toBe(200);
    const ownerBody = await json(ownerResponse);
    const ownerInstall = (
      (((ownerBody.orderSnapshot as Record<string, unknown>).lines as Array<
        Record<string, unknown>
      >) ?? [])
    ).find((line) => line.kind === "SITE_INSTALLATION");
    expect(ownerInstall?.evidence).toMatchObject({
      amount: 180,
      supplierLabel: "Montaj Rapid SRL",
    });
    fixture.close();
  });
});

function syntheticPersistedQuoteV2() {
  return {
    quoteSnapshotId: "qts:v2-subcontract",
    schemaVersion: 2,
    status: "FROZEN",
    productCode: CANONICAL_PRODUCT_CODE,
    productLabel: "Litere",
    inscription: "ACCESS",
    sourceReviewId: "rev:v2",
    sourceConfirmedAt: "2026-09-02T00:00:00.000Z",
    createdAt: "2026-09-02T00:00:00.000Z",
    contentHash: "hash-v2-subcontract-api",
    truth: {
      templateCode: CANONICAL_PRODUCT_CODE,
      templateVersion: "1",
      familyId: "letters",
      selectedComponentIds: [],
      values: {},
      measurements: [],
    },
    quantities: [],
    eic: { total: 382.5, currency: "EUR", completeness: "COMPLETE", lines: [] },
    commercial: {
      policyId: "policy",
      policyVersion: 1,
      markupPercent: 35,
      markupAmount: 133.88,
      discountPercent: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      netPrice: 516.38,
      vatPercent: 21,
      vatAmount: 108.44,
      grossPrice: 624.82,
      currency: "EUR",
      completeness: "COMPLETE",
    },
    productionInput: {
      schemaVersion: 1,
      requirements: [],
      operations: [],
      usedTechnicalSettings: [],
      usedRecipes: [],
      contentHash: "input",
    },
    lines: [
      {
        kind: "PRODUCT",
        lineVersion: 1,
        commercialStrategy: "PRODUCT_COST_PLUS",
        label: "Litere",
        productCode: CANONICAL_PRODUCT_CODE,
        eic: { total: 382.5, currency: "EUR", completeness: "COMPLETE", lines: [] },
        commercial: {
          policyId: "policy",
          policyVersion: 1,
          markupPercent: 35,
          markupAmount: 133.88,
          discountPercent: 0,
          discountAmount: 0,
          adjustmentAmount: 0,
          netPrice: 516.38,
          vatPercent: 21,
          vatAmount: 108.44,
          grossPrice: 624.82,
          currency: "EUR",
          completeness: "COMPLETE",
        },
      },
      {
        kind: "SITE_INSTALLATION",
        lineVersion: 1,
        scopeId: "SITE_INSTALLATION",
        commercialStrategy: "MANUAL_FIXED_PER_REQUEST",
        providerMode: "SUBCONTRACTED",
        label: "Montaj la locație",
        sourceRequestId: "req:v2-subcontract",
        quantity: 1,
        commercialUnit: "job",
        eic: {
          total: 180,
          currency: "EUR",
          completeness: "COMPLETE",
          lines: [
            {
              resourceId: "SVC-SITE-INSTALL-SUBCONTRACT",
              label: "Montaj la locație subcontractat",
              quantity: 1,
              unit: "job",
              rate: 180,
              currency: "EUR",
              cost: 180,
            },
          ],
        },
        commercial: {
          policyId: "policy",
          policyVersion: 1,
          markupPercent: 0,
          markupAmount: 0,
          discountPercent: 0,
          discountAmount: 0,
          adjustmentAmount: 0,
          netPrice: 200,
          vatPercent: 21,
          vatAmount: 42,
          grossPrice: 242,
          currency: "EUR",
          completeness: "COMPLETE",
        },
        technicalConfiguration: {
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: null,
          plannedDurationHours: null,
        },
        evidence: {
          resourceId: "SVC-SITE-INSTALL-SUBCONTRACT",
          classification: "OWNER_CONFIRMED",
          amount: 180,
          currency: "EUR",
          perUnit: "job",
          supplierLabel: "Montaj Rapid SRL",
          validFrom: "2027-01-01",
          validUntil: "2027-12-31",
        },
      },
    ],
    jobCommercial: {
      netPrice: 716.38,
      vatAmount: 150.44,
      grossPrice: 866.82,
      currency: "EUR",
      completeness: "COMPLETE",
    },
  } as unknown as QuoteSnapshot;
}
