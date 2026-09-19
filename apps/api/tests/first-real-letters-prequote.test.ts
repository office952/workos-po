import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LAB_SITE_INSTALL_ID,
  SITE_INSTALLATION_SCOPE_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
} from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

const isolatedRuntimes: Array<{ close: () => void; dir: string }> = [];

afterEach(() => {
  for (const item of isolatedRuntimes.splice(0)) {
    item.close();
    rmSync(item.dir, { recursive: true, force: true });
  }
});

function isolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-prequote-atom-"));
  const productSystem = createProductSystemRuntime(join(dir, "product-system.sqlite"));
  isolatedRuntimes.push({ close: () => productSystem.close(), dir });
  return createApp({ productSystem });
}

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("first real letters pre-quote API", () => {
  it("lets the owner complete INTERNAL install preview and refuses live v2 freeze", async () => {
    const app = createApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    expect(enable.status).toBe(200);

    const createdCustomer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client prequote" }),
    });
    const customer = (await readBody(createdCustomer)).customer as JsonObject;
    const createdRequest = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: customer.customerId,
        title: "Litere cu montaj",
        description: "Cerere sintetică pre-ofertă.",
      }),
    });
    const request = (await readBody(createdRequest)).request as JsonObject;
    const requestId = String(request.requestId);

    const selected = await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);

    const facts = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Fabricii 10",
          city: "București",
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 3,
          plannedDurationHours: 4,
        }),
      },
    );
    expect(facts.status).toBe(200);

    const evidence = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: LAB_SITE_INSTALL_ID,
        amount: 25,
        note: "Tarif sintetic owner pentru montaj intern.",
      }),
    });
    expect(evidence.status).toBe(201);

    const price = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-price`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ netPrice: 200 }),
      },
    );
    expect(price.status).toBe(200);
    const priced = await readBody(price);
    const detail = priced.detail as JsonObject;
    const installationScope = detail.installationScope as JsonObject;
    expect(installationScope.eicCompleteness).toBe("COMPLETE");
    expect(installationScope.commercialCompleteness).toBe("COMPLETE");
    expect(installationScope.commercialGrossPrice).toBe(242);
    expect((installationScope.ownerInternalCost as JsonObject).total).toBe(300);
    expect((installationScope.ownerInternalCost as JsonObject).label).toBe(
      "Cost intern estimat montaj",
    );
    expect((installationScope.ownerInternalCost as JsonObject).quantity).toBe(12);
    expect((installationScope.ownerInternalCost as JsonObject).rate).toBe(25);

    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { "root.inscription": "PREQ", ...lettersValues } }),
    });
    const compiled = await readBody(compile);
    const confirmed = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        requestId,
      }),
    });
    expect(confirmed.status).toBe(200);
    const confirmedBody = await readBody(confirmed);
    expect((confirmedBody.jobCommercial as JsonObject).grossPrice).toBe(866.82);
    expect(
      ((confirmedBody.installationScope as JsonObject).ownerInternalCost as JsonObject).total,
    ).toBe(300);
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId: customer.customerId,
        requestId,
      }),
    });
    expect(frozen.status).toBe(422);
    const refused = await readBody(frozen);
    expect(refused.error).toBe("service_quote_freeze_not_authorized");
    expect(refused.reasons).toEqual([
      "Previzualizarea ofertei cu montaj este pregătită. Înghețarea acestei oferte nu este activată în această etapă.",
    ]);

    const productOnlyCompile = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { "root.inscription": "ONLY", ...lettersValues } }),
      },
    );
    const productCompiled = await readBody(productOnlyCompile);
    const productFrozen = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: productCompiled.definition,
          reviewId: productCompiled.reviewId,
          customerId: customer.customerId,
        }),
      },
    );
    expect(productFrozen.status).toBe(200);
    expect(((await readBody(productFrozen)).quoteSnapshot as JsonObject).schemaVersion).toBe(1);
  });

  it("lets the owner complete SUBCONTRACTED install preview and refuses live v2 freeze", async () => {
    const app = createApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "SUBCONTRACTED" }),
    });
    expect(enable.status).toBe(200);

    const createdCustomer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client subcontract" }),
    });
    const customer = (await readBody(createdCustomer)).customer as JsonObject;
    const createdRequest = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: customer.customerId,
        title: "Litere montaj subcontractat",
        description: "Cerere sintetică subcontract.",
      }),
    });
    const requestId = String(((await readBody(createdRequest)).request as JsonObject).requestId);

    const selected = await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);

    const facts = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Fabricii 10",
          city: "București",
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
        }),
      },
    );
    expect(facts.status).toBe(200);

    const evidence = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
        amount: 180,
        note: "Cost subcontractant sintetic, nu prețul clientului.",
        supplierLabel: "Montaj Rapid SRL",
        validUntil: "2027-12-31",
      }),
    });
    expect(evidence.status).toBe(201);

    const price = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-price`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ netPrice: 200 }),
      },
    );
    expect(price.status).toBe(200);
    const installationScope = (await readBody(price)).detail as JsonObject;
    const scope = installationScope.installationScope as JsonObject;
    expect(scope.eicCompleteness).toBe("COMPLETE");
    expect(scope.commercialGrossPrice).toBe(242);
    expect((scope.ownerInternalCost as JsonObject).total).toBe(180);
    expect((scope.ownerInternalCost as JsonObject).label).toBe("Cost subcontractat montaj");

    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { "root.inscription": "SUBC", ...lettersValues } }),
    });
    const compiled = await readBody(compile);
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId: customer.customerId,
        requestId,
      }),
    });
    expect(frozen.status).toBe(422);
    expect((await readBody(frozen)).error).toBe("service_quote_freeze_not_authorized");
  });
});

describe("first real letters pre-quote owner writes", () => {
  afterEach(() => {
    resetCloudLoginAttemptGuard();
    cleanupCloudTemps();
  });

  it("refuses a Cloud member price write and first install evidence write", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Prequote");
    await addUser(fixture, {
      email: "owner-prequote@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-prequote@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(fixture.app, "owner-prequote@example.test", OWNER_PASSWORD);
    const member = await loginCloud(
      fixture.app,
      "member-prequote@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    expect(owner.response.status).toBe(200);
    expect(member.response.status).toBe(200);

    const enable = await fixture.app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    expect(enable.status).toBe(200);

    const createdCustomer = await fixture.app.request("/api/customers", {
      method: "POST",
      headers: {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ displayName: "Client cloud prequote" }),
    });
    const customer = (await readBody(createdCustomer)).customer as JsonObject;
    const createdRequest = await fixture.app.request("/api/requests", {
      method: "POST",
      headers: {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customerId: customer.customerId,
        title: "Litere cloud",
        description: "Cerere pentru poarta owner.",
      }),
    });
    const requestId = String(((await readBody(createdRequest)).request as JsonObject).requestId);
    await fixture.app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });

    const memberPrice = await fixture.app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-price`,
      {
        method: "PATCH",
        headers: {
          cookie: member.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ netPrice: 200 }),
      },
    );
    expect(memberPrice.status).toBe(403);

    const memberEvidence = await fixture.app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: {
        cookie: member.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        resourceId: LAB_SITE_INSTALL_ID,
        amount: 25,
        note: "Încercare membru.",
      }),
    });
    expect(memberEvidence.status).toBe(403);
    fixture.close();
  });

  it("does not expose live installation EIC to a commercial member", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Prequote Leak");
    await addUser(fixture, {
      email: "owner-prequote-leak@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-prequote-leak@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-prequote-leak@example.test",
      OWNER_PASSWORD,
    );
    const member = await loginCloud(
      fixture.app,
      "member-prequote-leak@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    const ownerHeaders = {
      cookie: owner.cookie ?? "",
      "content-type": "application/json",
    };
    await fixture.app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: ownerHeaders,
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    const createdCustomer = await fixture.app.request("/api/customers", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ displayName: "Client leak" }),
    });
    const customerId = String(
      ((await readBody(createdCustomer)).customer as JsonObject).customerId,
    );
    const createdRequest = await fixture.app.request("/api/requests", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        customerId,
        title: "Litere leak",
        description: "Cerere pentru separare financiară.",
      }),
    });
    const requestId = String(((await readBody(createdRequest)).request as JsonObject).requestId);
    await fixture.app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: ownerHeaders,
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    await fixture.app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Test 10",
          city: "Oraș Test",
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 3,
          plannedDurationHours: 4,
        }),
      },
    );
    await fixture.app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        resourceId: LAB_SITE_INSTALL_ID,
        amount: 25,
        note: "Tarif leak.",
      }),
    });
    await fixture.app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-price`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        body: JSON.stringify({ netPrice: 200 }),
      },
    );
    const ownerDetail = await readBody(
      await fixture.app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
        headers: { cookie: owner.cookie ?? "" },
      }),
    );
    expect(
      (((ownerDetail.detail as JsonObject).installationScope as JsonObject)
        .ownerInternalCost as JsonObject).total,
    ).toBe(300);
    const memberDetail = await readBody(
      await fixture.app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
        headers: { cookie: member.cookie ?? "" },
      }),
    );
    const memberScope = (memberDetail.detail as JsonObject).installationScope as JsonObject;
    expect(memberScope.commercialGrossPrice).toBe(242);
    expect(memberScope.ownerInternalCost).toBeUndefined();
    expect(JSON.stringify(memberDetail)).not.toContain("\"total\":300");
    expect(JSON.stringify(memberDetail)).not.toContain("\"rate\":25");
    const compile = await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ values: { "root.inscription": "LEAK", ...lettersValues } }),
    });
    const compiled = await readBody(compile);
    const memberConfirm = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: {
          cookie: member.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          definition: compiled.definition,
          reviewId: compiled.reviewId,
          requestId,
        }),
      }),
    );
    expect(
      (memberConfirm.installationScope as JsonObject | undefined)?.ownerInternalCost,
    ).toBeUndefined();
    expect(JSON.stringify(memberConfirm)).not.toContain("\"total\":300");
    fixture.close();
  });
});

describe("cost evidence supersede atomicity", () => {
  async function activeSubcontract(app: ReturnType<typeof createApp>) {
    const admin = await readBody(await app.request("/api/resources-admin"));
    return ((admin.costEvidence as Array<JsonObject>) ?? []).filter(
      (row) => row.resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID,
    );
  }

  async function seedSubcontract(app: ReturnType<typeof createApp>) {
    const created = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
        amount: 180,
        note: "Evidență activă.",
        supplierLabel: "Montaj Rapid SRL",
        validFrom: "2026-01-01",
        validUntil: "2026-12-31",
      }),
    });
    expect(created.status).toBe(201);
    return (await readBody(created)).evidence as JsonObject;
  }

  it("refuses invalid replacements without superseding the old row", async () => {
    const app = isolatedApp();
    const evidence = await seedSubcontract(app);
    const rowId = String(evidence.evidenceRowId);
    const refusals: Array<{ body: JsonObject; status: number }> = [];
    for (const body of [
      { amount: 180, note: "x", supplierLabel: 12 },
      { amount: 180, note: "x", supplierLabel: "", validUntil: "2026-12-31" },
      { amount: 180, note: "x", supplierLabel: "X", validUntil: "2026-02-30" },
      {
        amount: 180,
        note: "x",
        supplierLabel: "X",
        validFrom: "2026-12-31",
        validUntil: "2026-01-01",
      },
      { amount: -1, note: "x", supplierLabel: "X", validUntil: "2026-12-31" },
      { amount: 180, note: 9, supplierLabel: "X", validUntil: "2026-12-31" },
    ]) {
      refusals.push({
        status: (
          await app.request(
            `/api/resources-admin/cost-evidence/${encodeURIComponent(rowId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
          )
        ).status,
        body,
      });
    }
    expect(refusals.every((item) => item.status >= 400)).toBe(true);
    const active = await activeSubcontract(app);
    expect(active).toHaveLength(1);
    expect(active[0]?.evidenceRowId).toBe(rowId);
    expect(active[0]?.amount).toBe(180);
    expect(active[0]?.supplierLabel).toBe("Montaj Rapid SRL");
  });

  it("supersedes exactly once on a valid subcontract renewal", async () => {
    const app = isolatedApp();
    const evidence = await seedSubcontract(app);
    const rowId = String(evidence.evidenceRowId);
    const renewed = await app.request(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(rowId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 175,
          note: "Reînnoit.",
          supplierLabel: "Montaj Nou SRL",
          validFrom: "2026-06-01",
          validUntil: "2027-06-01",
        }),
      },
    );
    expect(renewed.status).toBe(200);
    const next = (await readBody(renewed)).evidence as JsonObject;
    expect(next.evidenceRowId).not.toBe(rowId);
    const active = await activeSubcontract(app);
    expect(active).toHaveLength(1);
    expect(active[0]?.evidenceRowId).toBe(next.evidenceRowId);
    expect(active[0]?.amount).toBe(175);
    expect(active[0]?.supplierLabel).toBe("Montaj Nou SRL");
    expect(active[0]?.validUntil).toBe("2027-06-01");
  });

  it("renews expired subcontract evidence to COMPLETE without a second active row", async () => {
    const app = isolatedApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "SUBCONTRACTED" }),
    });
    expect(enable.status).toBe(200);
    const createdCustomer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client reînnoire" }),
    });
    const customerId = String(
      ((await readBody(createdCustomer)).customer as JsonObject).customerId,
    );
    const createdRequest = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId,
        title: "Litere evidență expirată",
        description: "Cerere sintetică pentru reînnoire.",
      }),
    });
    const requestId = String(((await readBody(createdRequest)).request as JsonObject).requestId);
    expect(
      (
        await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              expectedVersion: 0,
              street: "Strada Fabricii 10",
              city: "București",
              measurementStatus: "OFFICE_MEASURED",
              facadeType: "CONCRETE",
              fixingMethod: "MECHANICAL_ANCHOR",
              siteElectrical: "NOT_APPLICABLE",
            }),
          },
        )
      ).status,
    ).toBe(200);
    const expired = await seedSubcontract(app);
    const expiredId = String(expired.evidenceRowId);
    const stale = await app.request(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(expiredId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 180,
          note: "Expirat.",
          supplierLabel: "Montaj Rapid SRL",
          validFrom: "2020-01-01",
          validUntil: "2020-06-01",
        }),
      },
    );
    expect(stale.status).toBe(200);
    const priced = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-price`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ netPrice: 200 }),
      },
    );
    expect(priced.status).toBe(200);
    expect(
      (((await readBody(priced)).detail as JsonObject).installationScope as JsonObject)
        .eicCompleteness,
    ).toBe("PARTIAL");
    const renewedId = String(((await readBody(stale)).evidence as JsonObject).evidenceRowId);
    const renewed = await app.request(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(renewedId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 180,
          note: "Reînnoit prin admin.",
          supplierLabel: "Montaj Rapid SRL",
          validFrom: "2026-01-01",
          validUntil: "2027-12-31",
        }),
      },
    );
    expect(renewed.status).toBe(200);
    const after = await readBody(
      await app.request(`/api/requests/${encodeURIComponent(requestId)}`),
    );
    expect(((after.detail as JsonObject).installationScope as JsonObject).eicCompleteness).toBe(
      "COMPLETE",
    );
    const active = await activeSubcontract(app);
    expect(active).toHaveLength(1);
    expect(active[0]?.evidenceRowId).not.toBe(expiredId);
  });
});
