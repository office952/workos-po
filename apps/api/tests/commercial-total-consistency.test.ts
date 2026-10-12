import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LAB_SITE_INSTALL_ID,
  OWNER_CONFIRMED_SELLER,
  SITE_INSTALLATION_SCOPE_ID,
  projectQuoteDocument,
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

type JsonObject = Record<string, unknown>;
type App = ReturnType<typeof createCloudFixture>["app"];

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

function client(app: App, cookie: string) {
  const headers = { cookie, "content-type": "application/json" };
  return {
    get: (path: string) => app.request(path, { headers: { cookie } }),
    send: (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

async function freezeQuote(
  api: ReturnType<typeof client>,
  inscription: string,
  customerId: string,
  requestId?: string,
): Promise<QuoteSnapshot> {
  const values = { "root.inscription": inscription, ...lettersValues };
  const preview = await readBody(
    await api.send("POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values }),
  );
  const frozen = await api.send(
    "POST",
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
    {
      values,
      reviewId: preview.reviewId,
      customerId,
      ...(requestId ? { requestId } : {}),
    },
  );
  expect(frozen.status).toBe(200);
  return (await readBody(frozen)).quoteSnapshot as QuoteSnapshot;
}

async function registryRows(api: ReturnType<typeof client>) {
  const response = await api.get("/api/quotes");
  expect(response.status).toBe(200);
  const overview = (await readBody(response)).overview as { quotes: JsonObject[] };
  return Object.fromEntries(overview.quotes.map((row) => [row.inscription, row]));
}

describe("commercial total consistency for standalone quotes with site installation", () => {
  afterEach(() => {
    resetCloudLoginAttemptGuard();
    cleanupCloudTemps();
  });

  it("shows the frozen job total in Oferte, the quote document and the order, per tenant", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Total Alpha");
    const beta = await addOrganization(fixture, "Atelier Total Beta");
    await addUser(fixture, {
      email: "owner-total@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-total@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    await addUser(fixture, {
      email: "owner-total-beta@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    const ownerLogin = await loginCloud(fixture.app, "owner-total@example.test", OWNER_PASSWORD);
    const memberLogin = await loginCloud(
      fixture.app,
      "member-total@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    const betaLogin = await loginCloud(
      fixture.app,
      "owner-total-beta@example.test",
      OWNER_PASSWORD,
    );
    const owner = client(fixture.app, ownerLogin.cookie ?? "");
    const member = client(fixture.app, memberLogin.cookie ?? "");
    const betaOwner = client(fixture.app, betaLogin.cookie ?? "");

    const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } =
      OWNER_CONFIRMED_SELLER;
    expect(
      (await owner.send("PATCH", "/api/seller", {
        legalName,
        brand,
        fiscalId,
        tradeRegister,
        address,
        locality,
        iban,
        bank,
      })).status,
    ).toBe(200);
    const admin = await readBody(await owner.get("/api/resources-admin"));
    for (const row of (admin.costEvidence as JsonObject[] | undefined) ?? []) {
      if (typeof row.evidenceRowId !== "string" || typeof row.amount !== "number") {
        continue;
      }
      expect(
        (await owner.send(
          "PATCH",
          `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`,
          { amount: row.amount, note: "Confirmat test total comercial" },
        )).status,
      ).toBe(200);
    }
    expect(
      (await owner.send("PATCH", "/api/operational-services/SITE_INSTALLATION", {
        offerMode: "INTERNAL",
      })).status,
    ).toBe(200);
    const customerId = String(
      ((await readBody(
        await owner.send("POST", "/api/customers", { displayName: "Client total" }),
      )).customer as JsonObject).customerId,
    );
    const requestId = String(
      ((await readBody(
        await owner.send("POST", "/api/requests", {
          customerId,
          title: "Litere cu montaj",
          description: "Cerere sintetică pentru total comercial.",
        }),
      )).request as JsonObject).requestId,
    );
    const requestPath = `/api/requests/${encodeURIComponent(requestId)}`;
    expect(
      (await owner.send("PATCH", requestPath, {
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      })).status,
    ).toBe(200);
    expect(
      (await owner.send("PATCH", `${requestPath}/installation-facts`, {
        expectedVersion: 0,
        street: "Strada Fabricii 10",
        city: "București",
        measurementStatus: "OFFICE_MEASURED",
        facadeType: "CONCRETE",
        fixingMethod: "MECHANICAL_ANCHOR",
        siteElectrical: "NOT_APPLICABLE",
        crewSize: 3,
        plannedDurationHours: 4,
      })).status,
    ).toBe(200);
    const installRate = await owner.send("POST", "/api/resources-admin/cost-evidence", {
      resourceId: LAB_SITE_INSTALL_ID,
      amount: 25,
      note: "Tarif sintetic montaj intern.",
    });
    expect(installRate.status).toBe(201);
    const installRateRowId = String(
      ((await readBody(installRate)).evidence as JsonObject).evidenceRowId,
    );
    expect(
      (await owner.send("PATCH", `${requestPath}/installation-price`, { netPrice: 200 })).status,
    ).toBe(200);

    const withInstallation = await freezeQuote(owner, "MONTAJ", customerId, requestId);
    const productOnly = await freezeQuote(owner, "PRODUS", customerId);
    expect(withInstallation.schemaVersion).toBe(2);
    expect(withInstallation.commercial.grossPrice).toBe(624.82);
    expect(withInstallation.jobCommercial?.grossPrice).toBe(866.82);
    expect(productOnly.schemaVersion).toBe(1);
    expect(productOnly.jobCommercial).toBeUndefined();

    const installationDocument = projectQuoteDocument(withInstallation);
    const productDocument = projectQuoteDocument(productOnly);
    expect(installationDocument.commercial.grossDisplay).toBe("866,82");
    expect(productDocument.commercial.grossDisplay).toBe("624,82");
    const pdf = await owner.get(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(withInstallation.quoteSnapshotId)}/document`,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");

    const ownerRows = await registryRows(owner);
    expect(ownerRows.MONTAJ?.grossDisplay).toBe(installationDocument.commercial.grossDisplay);
    expect(ownerRows.PRODUS?.grossDisplay).toBe(productDocument.commercial.grossDisplay);
    const memberRows = await registryRows(member);
    expect(memberRows.MONTAJ?.grossDisplay).toBe("866,82");
    expect(memberRows.PRODUS?.grossDisplay).toBe("624,82");
    expect(JSON.stringify(memberRows)).not.toMatch(/"rate"|ownerInternalCost|"total":300/);

    const requestDetail = await readBody(await owner.get(requestPath));
    expect(JSON.stringify(requestDetail)).toContain("\"grossDisplay\":\"866,82\"");
    expect(JSON.stringify(requestDetail)).not.toContain("\"grossDisplay\":\"624,82\"");

    expect(
      (await owner.send("PATCH", `${requestPath}/installation-price`, { netPrice: 500 })).status,
    ).toBe(409);
    expect(
      (await owner.send(
        "PATCH",
        `/api/resources-admin/cost-evidence/${encodeURIComponent(installRateRowId)}`,
        { amount: 60, note: "Tarif curent schimbat după înghețare." },
      )).status,
    ).toBe(200);
    expect((await registryRows(owner)).MONTAJ?.grossDisplay).toBe("866,82");
    expect(projectQuoteDocument(
      (await readBody(
        await owner.get(`/api/quotes/${encodeURIComponent(withInstallation.quoteSnapshotId)}`),
      )).quoteSnapshot as QuoteSnapshot,
    ).commercial.grossDisplay).toBe("866,82");

    const quotePath = `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(withInstallation.quoteSnapshotId)}`;
    expect((await owner.send("POST", `${quotePath}/acceptance`)).status).toBe(200);
    const ordered = await owner.send("POST", `${quotePath}/order`);
    expect(ordered.status).toBe(200);
    const order = (await readBody(ordered)).orderSnapshot as JsonObject;
    expect((order.jobCommercial as JsonObject).grossPrice).toBe(866.82);
    expect((order.commercial as JsonObject).grossPrice).toBe(624.82);
    const orderedRow = (await registryRows(owner)).MONTAJ;
    expect(orderedRow).toMatchObject({ stage: "ORDER_CREATED", grossDisplay: "866,82" });

    expect(await registryRows(betaOwner)).toEqual({});
    fixture.close();
  });
});
