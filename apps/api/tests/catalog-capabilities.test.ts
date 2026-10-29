import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  INACTIVE_PRODUCT_ENABLEMENT,
  LOGO_PRODUCT_CODE,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
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

const FINANCIAL_KEY = /price|cost|amount|currency|margin|eic/i;

function financialKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      financialKeys(item, found);
    }
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key !== "canViewFinancialAmounts" && FINANCIAL_KEY.test(key)) {
        found.push(key);
      }
      financialKeys(child, found);
    }
  }
  return found;
}

function productsOf(body: JsonObject): JsonObject[] {
  return body.products as JsonObject[];
}

function product(body: JsonObject, code: string): JsonObject {
  const found = productsOf(body).find((item) => item.templateCode === code);
  expect(found).toBeDefined();
  return found!;
}

function enablement(body: JsonObject, code: string): JsonObject {
  return product(body, code).enablement as JsonObject;
}

describe("GET /api/catalog/capabilities", () => {
  it("returns the read-only manifest for the single-plane runtime", async () => {
    const app = createApp();
    const response = await app.request("/api/catalog/capabilities");
    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.schemaVersion).toBe("catalog-capabilities.v1");
    expect(body.readOnly).toBe(true);
    expect(body.mutatesConfiguration).toBe(false);
    expect((body.permissions as JsonObject).canViewFinancialAmounts).toBe(false);
    expect(productsOf(body).map((item) => item.templateCode)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      LOGO_PRODUCT_CODE,
    ]);
    expect(enablement(body, LOGO_PRODUCT_CODE).enabledForNewWork).toBe(false);
    expect(enablement(body, LOGO_PRODUCT_CODE).source).toBe("CODE_DEFAULT");
    expect(enablement(body, CANONICAL_PRODUCT_CODE).enabledForNewWork).toBe(true);
    expect(financialKeys(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("templateStatus");

    const posted = await app.request("/api/catalog/capabilities", { method: "POST" });
    expect(posted.status).toBe(404);
    const again = await readBody(await app.request("/api/admin/product-enablement"));
    expect(again.source).toBe("CODE_DEFAULT");
  });

  it("requires a cloud session and keeps organization selections apart", async () => {
    const fixture = createCloudFixture();
    const orgA = await addOrganization(fixture, "Org A capabilities");
    const orgB = await addOrganization(fixture, "Org B capabilities");
    await addUser(fixture, {
      email: "owner-a@capabilities.test",
      password: OWNER_PASSWORD,
      organizationId: orgA.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@capabilities.test",
      password: MEMBER_PASSWORD,
      organizationId: orgA.organization.organizationId,
      role: "member",
    });
    await addUser(fixture, {
      email: "owner-b@capabilities.test",
      password: OWNER_PASSWORD,
      organizationId: orgB.organization.organizationId,
      role: "owner",
    });

    expect((await fixture.app.request("/api/catalog/capabilities")).status).toBe(401);

    const ownerA = await loginCloud(
      fixture.app,
      "owner-a@capabilities.test",
      OWNER_PASSWORD,
      orgA.organization.organizationId,
    );
    const memberA = await loginCloud(
      fixture.app,
      "member-a@capabilities.test",
      MEMBER_PASSWORD,
      orgA.organization.organizationId,
    );
    const ownerB = await loginCloud(
      fixture.app,
      "owner-b@capabilities.test",
      OWNER_PASSWORD,
      orgB.organization.organizationId,
    );
    const cookieA = { cookie: ownerA.cookie ?? "" };
    const cookieMember = { cookie: memberA.cookie ?? "" };
    const cookieB = { cookie: ownerB.cookie ?? "" };

    const savedA = await fixture.app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieA },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
          { templateCode: LOGO_PRODUCT_CODE, enabled: false },
        ],
      }),
    });
    expect(savedA.status).toBe(200);
    const savedB = await fixture.app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieB },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: false },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
          { templateCode: LOGO_PRODUCT_CODE, enabled: true },
        ],
      }),
    });
    expect(savedB.status).toBe(200);

    const bodyA = await readBody(
      await fixture.app.request("/api/catalog/capabilities", { headers: cookieA }),
    );
    const bodyMember = await readBody(
      await fixture.app.request("/api/catalog/capabilities", { headers: cookieMember }),
    );
    const bodyB = await readBody(
      await fixture.app.request("/api/catalog/capabilities", { headers: cookieB }),
    );

    expect(enablement(bodyA, CANONICAL_PRODUCT_CODE).enabledForNewWork).toBe(true);
    expect(enablement(bodyA, LOGO_PRODUCT_CODE).enabledForNewWork).toBe(false);
    expect(enablement(bodyA, LOGO_PRODUCT_CODE).source).toBe("ORGANIZATION");
    expect(enablement(bodyB, CANONICAL_PRODUCT_CODE).enabledForNewWork).toBe(false);
    expect(enablement(bodyB, LOGO_PRODUCT_CODE).enabledForNewWork).toBe(true);
    expect(enablement(bodyB, ACM_CASSETTE_NONE_PRODUCT_CODE).enabledForNewWork).toBe(true);
    expect(enablement(bodyA, LOGO_PRODUCT_CODE).version).toBe(1);
    expect(enablement(bodyB, LOGO_PRODUCT_CODE).version).toBe(1);
    expect(enablement(bodyA, CANONICAL_PRODUCT_CODE).enabledForNewWork).not.toBe(
      enablement(bodyB, CANONICAL_PRODUCT_CODE).enabledForNewWork,
    );
    expect(product(bodyA, LOGO_PRODUCT_CODE).inPlatformLibrary).toBe(true);
    expect(product(bodyB, LOGO_PRODUCT_CODE).inPlatformLibrary).toBe(true);

    expect((bodyA.permissions as JsonObject).canEditEnablement).toBe(true);
    expect((bodyMember.permissions as JsonObject).canEditEnablement).toBe(false);
    expect((bodyMember.permissions as JsonObject).canViewFinancialAmounts).toBe(false);
    expect(enablement(bodyMember, CANONICAL_PRODUCT_CODE)).toEqual(
      enablement(bodyA, CANONICAL_PRODUCT_CODE),
    );
    expect(financialKeys(bodyA)).toEqual([]);
    expect(financialKeys(bodyMember)).toEqual([]);
    expect(financialKeys(bodyB)).toEqual([]);

    const before = await readBody(
      await fixture.app.request("/api/admin/product-enablement", { headers: cookieA }),
    );
    await fixture.app.request("/api/catalog/capabilities", { headers: cookieA });
    const after = await readBody(
      await fixture.app.request("/api/admin/product-enablement", { headers: cookieA }),
    );
    expect(after.activeVersion).toBe(before.activeVersion);
    expect(after.products).toEqual(before.products);

    const db = openSqliteDatabase(orgA.paths.sqlitePath);
    db.prepare(
      "UPDATE organization_product_enablement_versions SET status = 'RETIRED'",
    ).run();
    db.close();
    const closed = await readBody(
      await fixture.app.request("/api/catalog/capabilities", { headers: cookieA }),
    );
    expect(enablement(closed, CANONICAL_PRODUCT_CODE).enabledForNewWork).toBeNull();
    expect(enablement(closed, CANONICAL_PRODUCT_CODE).error).toBe(INACTIVE_PRODUCT_ENABLEMENT);
    expect(enablement(closed, ACM_CASSETTE_NONE_PRODUCT_CODE).enabledForNewWork).toBeNull();
    expect(enablement(closed, LOGO_PRODUCT_CODE).enabledForNewWork).toBeNull();
    const untouched = await readBody(
      await fixture.app.request("/api/catalog/capabilities", { headers: cookieB }),
    );
    expect(enablement(untouched, LOGO_PRODUCT_CODE).enabledForNewWork).toBe(true);
  });
});
