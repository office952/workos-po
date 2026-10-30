import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LOGO_PRODUCT_CODE,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
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
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const MONEY_KEY = /^(rate|currency|amount|price|margin)$/i;

function moneyKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      moneyKeys(item, found);
    }
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (MONEY_KEY.test(key)) {
        found.push(key);
      }
      moneyKeys(child, found);
    }
  }
  return found;
}

function graphOf(body: JsonObject): JsonObject {
  return body.graph as JsonObject;
}

describe("GET /api/catalog/process-graph", () => {
  it("returns the illustrative letters graph and refuses extra job input", async () => {
    const app = createApp();
    const response = await app.request(
      `/api/catalog/process-graph?product=${CANONICAL_PRODUCT_CODE}`,
    );
    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.schemaVersion).toBe("catalog-process-graph.v1");
    expect(body.readOnly).toBe(true);
    expect(body.mutatesConfiguration).toBe(false);
    expect(body.writeState).toBe("NOT_IMPLEMENTED");
    expect(body.status).toBe("READY");
    expect(body.canViewFinancialAmounts).toBe(true);
    expect((body.scenario as JsonObject).illustrative).toBe(true);
    expect((body.scenario as JsonObject).id).toBe("letters-finish-none");
    const graph = graphOf(body);
    expect(graph.directEdgeIds).toHaveLength(14);
    expect(graph.simplifiedEdgeIds).toHaveLength(11);
    expect(graph.hiddenEdgeCount).toBe(3);
    expect(JSON.stringify(body)).not.toContain('"cost":');

    const again = await readBody(
      await app.request(`/api/catalog/process-graph?product=${CANONICAL_PRODUCT_CODE}`),
    );
    expect(again).toEqual(body);
    const enablement = await readBody(await app.request("/api/admin/product-enablement"));
    expect(enablement.source).toBe("CODE_DEFAULT");

    expect((await app.request("/api/catalog/process-graph", { method: "POST" })).status).toBe(404);
    expect(
      (await app.request("/api/catalog/process-graph?product=")).status,
    ).toBe(400);
    expect(
      (await app.request("/api/catalog/process-graph?product=NO-SUCH")).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/api/catalog/process-graph?product=${CANONICAL_PRODUCT_CODE}&scenario=missing`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/api/catalog/process-graph?product=${CANONICAL_PRODUCT_CODE}&values=%7B%7D`,
        )
      ).status,
    ).toBe(400);
  });

  it("keeps ACM free of lighting and logo on its own scenario", async () => {
    const app = createApp();
    const acm = await readBody(
      await app.request(`/api/catalog/process-graph?product=${ACM_CASSETTE_NONE_PRODUCT_CODE}`),
    );
    const logo = await readBody(
      await app.request(`/api/catalog/process-graph?product=${LOGO_PRODUCT_CODE}`),
    );
    expect((acm.scenario as JsonObject).id).toBe("acm-cassette-proof");
    expect(JSON.stringify(graphOf(acm))).not.toContain("PLACE_LED_MODULES");
    expect(JSON.stringify(graphOf(acm))).not.toContain("Montare module LED");
    expect((logo.scenario as JsonObject).id).toBe("logo-finish-none");
    expect(logo.productCode).not.toBe(acm.productCode);
  });

  it("redacts rates for a member and keeps organizations apart", async () => {
    const fixture = createCloudFixture();
    const orgA = await addOrganization(fixture, "Org A graph");
    const orgB = await addOrganization(fixture, "Org B graph");
    await addUser(fixture, {
      email: "owner-a@graph.test",
      password: OWNER_PASSWORD,
      organizationId: orgA.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@graph.test",
      password: MEMBER_PASSWORD,
      organizationId: orgA.organization.organizationId,
      role: "member",
    });
    await addUser(fixture, {
      email: "owner-b@graph.test",
      password: OWNER_PASSWORD,
      organizationId: orgB.organization.organizationId,
      role: "owner",
    });
    expect((await fixture.app.request("/api/catalog/process-graph?product=x")).status).toBe(401);

    const ownerA = await loginCloud(
      fixture.app,
      "owner-a@graph.test",
      OWNER_PASSWORD,
      orgA.organization.organizationId,
    );
    const memberA = await loginCloud(
      fixture.app,
      "member-a@graph.test",
      MEMBER_PASSWORD,
      orgA.organization.organizationId,
    );
    const ownerB = await loginCloud(
      fixture.app,
      "owner-b@graph.test",
      OWNER_PASSWORD,
      orgB.organization.organizationId,
    );
    const path = `/api/catalog/process-graph?product=${CANONICAL_PRODUCT_CODE}`;
    const ownerBody = await readBody(
      await fixture.app.request(path, { headers: { cookie: ownerA.cookie ?? "" } }),
    );
    const memberBody = await readBody(
      await fixture.app.request(path, { headers: { cookie: memberA.cookie ?? "" } }),
    );
    const otherBody = await readBody(
      await fixture.app.request(path, { headers: { cookie: ownerB.cookie ?? "" } }),
    );
    expect(ownerBody.canViewFinancialAmounts).toBe(true);
    expect(moneyKeys(ownerBody).length).toBeGreaterThan(0);
    expect(memberBody.canViewFinancialAmounts).toBe(false);
    expect(moneyKeys(memberBody)).toEqual([]);
    expect(JSON.stringify(memberBody)).not.toContain('"rate"');
    expect(otherBody.productCode).toBe(ownerBody.productCode);
    expect((otherBody.graph as JsonObject).topologicalOrder).toEqual(
      (ownerBody.graph as JsonObject).topologicalOrder,
    );
  });
});
