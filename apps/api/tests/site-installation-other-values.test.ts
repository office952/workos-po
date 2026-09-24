import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LAB_SITE_INSTALL_ID,
  SITE_INSTALLATION_SCOPE_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const FACADE_NOTE = "Suprafață sintetică specială";
const FIXING_NOTE = "Fixare sintetică specială";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function createInstallRequest(
  app: ReturnType<typeof createApp>,
  title: string,
  mode: "INTERNAL" | "SUBCONTRACTED",
) {
  const createdCustomer = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Client sintetic montaj" }),
  });
  const customer = (await readBody(createdCustomer)).customer as JsonObject;
  const createdRequest = await app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId: customer.customerId,
      title,
      description: "Cerere sintetică pentru corecția montajului.",
    }),
  });
  const requestId = String(((await readBody(createdRequest)).request as JsonObject).requestId);
  const selected = await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: mode,
    }),
  });
  expect(selected.status).toBe(200);
  return { customerId: String(customer.customerId), requestId };
}

function serviceLine(snapshot: JsonObject): JsonObject {
  const lines = snapshot.lines as JsonObject[];
  const line = lines.find((item) => item.kind === "SITE_INSTALLATION" && item.lineVersion === 2);
  if (!line) {
    throw new Error("missing site installation line");
  }
  return line;
}

describe("site installation other values", () => {
  it("saves OTHER facade and fixing notes and freezes them through production", async () => {
    const app = createApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    expect(enable.status).toBe(200);
    const { customerId, requestId } = await createInstallRequest(
      app,
      "Montaj suprafață specială",
      "INTERNAL",
    );

    const missingNote = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Sintetică 1",
          city: "Oraș Sintetic",
          measurementStatus: "CUSTOMER_PROVIDED",
          facadeType: "OTHER",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "EXCLUDED_CUSTOMER_RESPONSIBILITY",
          crewSize: 2,
          plannedDurationHours: 3,
        }),
      },
    );
    expect(missingNote.status).toBe(400);
    expect((await readBody(missingNote)).error).toBe("other_note_required");

    const facts = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Sintetică 1",
          city: "Oraș Sintetic",
          measurementStatus: "CUSTOMER_PROVIDED",
          facadeType: "OTHER",
          facadeOtherNote: FACADE_NOTE,
          fixingMethod: "OTHER",
          fixingOtherNote: FIXING_NOTE,
          siteElectrical: "EXCLUDED_CUSTOMER_RESPONSIBILITY",
          crewSize: 2,
          plannedDurationHours: 3,
        }),
      },
    );
    expect(facts.status).toBe(200);
    const savedFacts = ((await readBody(facts)).detail as JsonObject).installationFacts as JsonObject;
    expect(savedFacts.facadeOtherNote).toBe(FACADE_NOTE);
    expect(savedFacts.fixingOtherNote).toBe(FIXING_NOTE);

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
    const scope = ((await readBody(price)).detail as JsonObject).installationScope as JsonObject;
    expect(scope.eicCompleteness).toBe("COMPLETE");
    expect(scope.commercialCompleteness).toBe("COMPLETE");
    expect((scope.ownerInternalCost as JsonObject).total).toBe(150);

    const values = { "root.inscription": "ALTUL", ...lettersValues };
    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const reviewId = (await readBody(compile)).reviewId;
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, reviewId, customerId, requestId }),
    });
    expect(frozen.status).toBe(200);
    const quote = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect(quote.schemaVersion).toBe(2);
    expect(JSON.stringify(quote.truth)).not.toContain(FACADE_NOTE);
    const quoteLine = serviceLine(quote);
    expect(quoteLine.hostContext).toMatchObject({
      surfaceType: "OTHER",
      surfaceOtherNote: FACADE_NOTE,
    });
    expect(quoteLine.mountingInterface).toMatchObject({
      fixingMethod: "OTHER",
      fixingOtherNote: FIXING_NOTE,
    });

    const quoteId = String(quote.quoteSnapshotId);
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/acceptance`,
      { method: "POST" },
    );
    expect(accepted.status).toBe(200);
    const ordered = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/order`,
      { method: "POST" },
    );
    expect(ordered.status).toBe(200);
    const order = (await readBody(ordered)).orderSnapshot as JsonObject;
    expect(order.schemaVersion).toBe(2);
    const orderLine = serviceLine(order);
    expect(orderLine.hostContext).toMatchObject({
      surfaceType: "OTHER",
      surfaceOtherNote: FACADE_NOTE,
    });
    expect(orderLine.mountingInterface).toMatchObject({
      fixingMethod: "OTHER",
      fixingOtherNote: FIXING_NOTE,
    });

    const release = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(String(order.orderSnapshotId))}/production-release`,
      { method: "POST" },
    );
    expect(release.status).toBe(200);
    const released = await readBody(release);
    const operations = (released.snapshot as JsonObject).operations as JsonObject[];
    expect(operations.some((operation) => operation.processId === "INSTALL_AT_SITE")).toBe(true);
    const plan = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(String((released.snapshot as JsonObject).snapshotId))}/execution-plan`,
      { method: "POST" },
    );
    expect(plan.status).toBe(200);
    expect(JSON.stringify(await readBody(plan))).toContain("INSTALL_AT_SITE");
  });

  it("freezes a subcontracted quote without crew or duration", async () => {
    const app = createApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "SUBCONTRACTED" }),
    });
    expect(enable.status).toBe(200);
    const { customerId, requestId } = await createInstallRequest(
      app,
      "Montaj subcontractat sintetic",
      "SUBCONTRACTED",
    );
    const facts = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Sintetică 10",
          city: "Oraș Sintetic",
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
        }),
      },
    );
    expect(facts.status).toBe(200);
    const reasons = (
      ((await readBody(facts)).detail as JsonObject).installationScope as JsonObject
    ).incompleteReasons as JsonObject[];
    expect(reasons.map((reason) => reason.id)).not.toContain("MISSING_CREW_SIZE");
    expect(reasons.map((reason) => reason.id)).not.toContain("MISSING_PLANNED_DURATION");

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
    const scope = ((await readBody(price)).detail as JsonObject).installationScope as JsonObject;
    expect(scope.eicCompleteness).toBe("COMPLETE");
    expect(scope.commercialCompleteness).toBe("COMPLETE");

    const values = { "root.inscription": "SUBX", ...lettersValues };
    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const reviewId = (await readBody(compile)).reviewId;
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, reviewId, customerId, requestId }),
    });
    expect(frozen.status).toBe(200);
    const quote = (await readBody(frozen)).quoteSnapshot as JsonObject;
    const line = serviceLine(quote);
    expect(line.siteExecutionContext).not.toHaveProperty("crewSize");
    expect(line.siteExecutionContext).not.toHaveProperty("plannedDurationHours");
    const ordered = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/order`,
      { method: "POST" },
    );
    expect(ordered.status).toBe(422);
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/acceptance`,
      { method: "POST" },
    );
    expect(accepted.status).toBe(200);
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/order`,
      { method: "POST" },
    );
    expect(created.status).toBe(200);
    expect(((await readBody(created)).orderSnapshot as JsonObject).schemaVersion).toBe(2);
  });

  it("ignores stored crew after the mode switches to subcontracted", async () => {
    const app = createApp();
    const enable = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "BOTH" }),
    });
    expect(enable.status).toBe(200);
    const { customerId, requestId } = await createInstallRequest(
      app,
      "Schimbare mod montaj",
      "INTERNAL",
    );
    const facts = await app.request(
      `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 0,
          street: "Strada Sintetică 2",
          city: "Oraș Sintetic",
          measurementStatus: "CUSTOMER_PROVIDED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 2,
          plannedDurationHours: 3,
        }),
      },
    );
    expect(facts.status).toBe(200);
    const switched = await app.request(`/api/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteInstallationMode: "SUBCONTRACTED" }),
    });
    expect(switched.status).toBe(200);
    const switchedScope = ((await readBody(switched)).detail as JsonObject)
      .installationScope as JsonObject;
    const reasonIds = (switchedScope.incompleteReasons as JsonObject[]).map((reason) => reason.id);
    expect(reasonIds).not.toContain("MISSING_CREW_SIZE");
    expect(reasonIds).not.toContain("MISSING_PLANNED_DURATION");

    const evidence = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
        amount: 180,
        note: "Cost subcontractant sintetic după schimbarea modului.",
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
        body: JSON.stringify({ netPrice: 180 }),
      },
    );
    expect(price.status).toBe(200);
    const values = { "root.inscription": "MODX", ...lettersValues };
    const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const reviewId = (await readBody(compile)).reviewId;
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, reviewId, customerId, requestId }),
    });
    expect(frozen.status).toBe(200);
    const line = serviceLine((await readBody(frozen)).quoteSnapshot as JsonObject);
    expect(line.providerMode).toBe("SUBCONTRACTED");
    expect(line.siteExecutionContext).not.toHaveProperty("crewSize");
    expect(line.siteExecutionContext).not.toHaveProperty("plannedDurationHours");
  });
});
