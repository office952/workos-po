import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  MCH_CNC_4020_ID,
  PLEXIGLAS_3MM_OPAL_ID,
} from "@workos-final/domain";
import {
  ALPHA_ATTACHMENT_BYTES,
  ALPHA_PIN,
  TEST_COMPANY_ATTACHMENT_BYTES,
  TEST_COMPANY_PIN,
} from "./fixtures/cloudIsolation.js";
import { OPERATOR_SESSION_COOKIE } from "../src/operator/store.js";
import { cleanupCloudTemps } from "./cloud-harness.js";
import {
  provisionHostileIsolationWorld,
  type IsolationPlaneIds,
} from "./cloud-isolation-fixture.js";
import type { CloudFixture } from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

type Attack = {
  name: string;
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: (foreign: IsolationPlaneIds) => string;
  body?: unknown | ((foreign: IsolationPlaneIds) => unknown);
  form?: boolean;
};

const READ_ATTACKS: Attack[] = [
  { name: "CUSTOMER", method: "GET", path: (id) => `/api/customers/${id.customerId}` },
  {
    name: "CUSTOMER_WORKSPACE",
    method: "GET",
    path: (id) => `/api/customers/${id.customerId}/workspace`,
  },
  { name: "REQUEST", method: "GET", path: (id) => `/api/requests/${id.requestId}` },
  {
    name: "ATTACHMENT_META",
    method: "GET",
    path: (id) => `/api/requests/${id.requestId}/attachments`,
  },
  {
    name: "ATTACHMENT_DOWNLOAD",
    method: "GET",
    path: (id) => `/api/requests/${id.requestId}/attachments/${id.attachmentId}/download`,
  },
  {
    name: "QUOTE",
    method: "GET",
    path: (id) => `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${id.quoteId}`,
  },
  {
    name: "QUOTE_STABLE",
    method: "GET",
    path: (id) => `/api/quotes/${id.quoteId}`,
  },
  {
    name: "JOB_STABLE",
    method: "GET",
    path: (id) => `/api/jobs/${id.orderId}`,
  },
  {
    name: "QUOTE_PDF",
    method: "GET",
    path: (id) => `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${id.quoteId}/document`,
  },
  {
    name: "ORDER",
    method: "GET",
    path: (id) => `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${id.orderId}`,
  },
  {
    name: "PRODUCTION_RELEASE",
    method: "GET",
    path: (id) =>
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${id.orderId}/production-release`,
  },
  { name: "EXECUTION_PLAN", method: "GET", path: (id) => `/api/execution-plans/${id.planId}` },
  { name: "PEOPLE", method: "GET", path: (id) => `/api/people/${id.personId}` },
];

const WRITE_ATTACKS: Attack[] = [
  {
    name: "CUSTOMER_PATCH",
    method: "PATCH",
    path: (id) => `/api/customers/${id.customerId}`,
    body: { displayName: "Furat" },
  },
  {
    name: "REQUEST_PATCH",
    method: "PATCH",
    path: (id) => `/api/requests/${id.requestId}`,
    body: { title: "Furat" },
  },
  {
    name: "REQUEST_QUOTE_LINK",
    method: "POST",
    path: (id) => `/api/requests/${id.requestId}/quotes`,
    body: (foreign: IsolationPlaneIds) => ({ quoteSnapshotId: foreign.quoteId }),
  },
  {
    name: "QUOTE_ACCEPT",
    method: "POST",
    path: (id) =>
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${id.quoteId}/acceptance`,
    body: {},
  },
  {
    name: "ORDER_FROM_QUOTE",
    method: "POST",
    path: (id) => `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${id.quoteId}/order`,
    body: {},
  },
  {
    name: "RELEASE_FROM_ORDER",
    method: "POST",
    path: (id) =>
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${id.orderId}/production-release`,
    body: {},
  },
  {
    name: "TASK_PROVIDER",
    method: "POST",
    path: (id) => `/api/execution-tasks/${id.taskId}/provider`,
    body: { providerId: MCH_CNC_4020_ID },
  },
  {
    name: "TASK_START",
    method: "POST",
    path: (id) => `/api/execution-tasks/${id.taskId}/start`,
    body: {},
  },
  {
    name: "PEOPLE_PATCH",
    method: "PATCH",
    path: (id) => `/api/people/${id.personId}`,
    body: { displayName: "Furat" },
  },
  {
    name: "PEOPLE_PIN",
    method: "PUT",
    path: (id) => `/api/people/${id.personId}/operator-pin`,
    body: { pin: "9999", confirmPin: "9999" },
  },
  {
    name: "COST_EVIDENCE",
    method: "PATCH",
    path: (id) => `/api/resources-admin/cost-evidence/${id.costEvidenceRowId}`,
    body: { amount: 99, note: "furat" },
  },
];

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie, "content-type": "application/json" };
}

function operatorCookieFrom(response: Response): string {
  const line = response.headers
    .getSetCookie()
    .find((item) => item.startsWith(`${OPERATOR_SESSION_COOKIE}=`));
  return line?.split(";", 1)[0] ?? "";
}

async function expectForeignMiss(
  app: CloudFixture["app"],
  cookie: string,
  attack: Attack,
  foreign: IsolationPlaneIds,
) {
  const init: RequestInit = {
    method: attack.method,
    headers: cookieHeader(cookie),
  };
  if (attack.body !== undefined) {
    init.body = JSON.stringify(
      typeof attack.body === "function" ? attack.body(foreign) : attack.body,
    );
  }
  const response = await app.request(attack.path(foreign), init);
  const text = await response.text();
  expect(response.status, `${attack.name} ${attack.method} ${attack.path(foreign)}`).toBe(404);
  expect(text).not.toContain(foreign.customerName);
  expect(text).not.toContain(foreign.personName);
  expect(text).not.toContain(foreign.sellerLegalName);
  expect(text).not.toContain(foreign.planeId);
  expect(text).not.toContain(foreign.planeRoot);
  expect(text).not.toContain(foreign.documentsRoot);
}

describe("Cloud two-organization hostile isolation", () => {
  it("keeps private operational truth inside the active plane", { timeout: 15_000 }, async () => {
    const world = await provisionHostileIsolationWorld();
    try {
      const { fixture, alpha, testCompany, cookies } = world;
      expect(alpha.planeRoot).not.toBe(testCompany.planeRoot);
      expect(alpha.documentsRoot).not.toBe(testCompany.documentsRoot);
      expect(alpha.customerId).not.toBe(testCompany.customerId);
      expect(alpha.personId).not.toBe(testCompany.personId);
      expect(alpha.plexiAmount).not.toBe(testCompany.plexiAmount);

      const sellerA = (await (
        await fixture.app.request("/api/seller", { headers: { cookie: cookies.userA } })
      ).json()) as { seller: { legalName: string }; configured: boolean };
      const sellerB = (await (
        await fixture.app.request("/api/seller", { headers: { cookie: cookies.userB } })
      ).json()) as { seller: { legalName: string }; configured: boolean };
      expect(sellerA.configured).toBe(true);
      expect(sellerB.configured).toBe(true);
      expect(sellerA.seller.legalName).toBe(alpha.sellerLegalName);
      expect(sellerB.seller.legalName).toBe(testCompany.sellerLegalName);

      const customersA = (await (
        await fixture.app.request("/api/customers", { headers: { cookie: cookies.userA } })
      ).json()) as { customers: Array<{ displayName: string }> };
      const customersB = (await (
        await fixture.app.request("/api/customers", { headers: { cookie: cookies.userB } })
      ).json()) as { customers: Array<{ displayName: string }> };
      expect(customersA.customers.map((item) => item.displayName)).toEqual([alpha.customerName]);
      expect(customersB.customers.map((item) => item.displayName)).toEqual([
        testCompany.customerName,
      ]);

      const peopleA = (await (
        await fixture.app.request("/api/people", { headers: { cookie: cookies.userA } })
      ).json()) as { people: Array<{ displayName: string }> };
      const peopleB = (await (
        await fixture.app.request("/api/people", { headers: { cookie: cookies.userB } })
      ).json()) as { people: Array<{ displayName: string }> };
      expect(peopleA.people.map((item) => item.displayName)).toEqual([alpha.personName]);
      expect(peopleB.people.map((item) => item.displayName)).toEqual([testCompany.personName]);

      const adminA = (await (
        await fixture.app.request("/api/resources-admin", { headers: { cookie: cookies.userA } })
      ).json()) as {
        costEvidence: Array<{ resourceId: string; amount: number; classificationLabel: string }>;
      };
      const adminB = (await (
        await fixture.app.request("/api/resources-admin", { headers: { cookie: cookies.userB } })
      ).json()) as {
        costEvidence: Array<{ resourceId: string; amount: number; classificationLabel: string }>;
      };
      const plexiA = adminA.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
      const plexiB = adminB.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
      expect(plexiA?.amount).toBe(alpha.plexiAmount);
      expect(plexiA?.classificationLabel).toBe("Confirmat de owner");
      expect(plexiB?.amount).toBe(testCompany.plexiAmount);
      expect(plexiB?.classificationLabel).toBe("Confirmat de owner");
      expect(plexiA?.amount).not.toBe(plexiB?.amount);

      const stockA = (await (
        await fixture.app.request(`/api/inventory/${PLEXIGLAS_3MM_OPAL_ID}`, {
          headers: { cookie: cookies.userA },
        })
      ).json()) as { item: { balance: number } };
      const stockB = (await (
        await fixture.app.request(`/api/inventory/${PLEXIGLAS_3MM_OPAL_ID}`, {
          headers: { cookie: cookies.userB },
        })
      ).json()) as { item: { balance: number } };
      expect(stockA.item.balance).not.toBe(stockB.item.balance);

      const labelsA = (await (
        await fixture.app.request("/api/product-system-admin", { headers: { cookie: cookies.userA } })
      ).json()) as { admin?: { families?: Array<{ displayLabel: string }> } };
      const labelsB = (await (
        await fixture.app.request("/api/product-system-admin", { headers: { cookie: cookies.userB } })
      ).json()) as { admin?: { families?: Array<{ displayLabel: string }> } };
      expect(JSON.stringify(labelsA)).toContain("Familie Alpha");
      expect(JSON.stringify(labelsB)).toContain("Familie Test");
      expect(JSON.stringify(labelsB)).not.toContain("Familie Alpha");

      const workcentersB = await (
        await fixture.app.request("/api/workcenters", { headers: { cookie: cookies.userB } })
      ).text();
      expect(workcentersB).not.toContain(MCH_CNC_4020_ID);
      const workcentersA = await (
        await fixture.app.request("/api/workcenters", { headers: { cookie: cookies.userA } })
      ).text();
      expect(workcentersA).toContain(MCH_CNC_4020_ID);

      const identifyA = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userA),
        body: JSON.stringify({ personId: alpha.personId, pin: ALPHA_PIN }),
      });
      const identifyB = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userB),
        body: JSON.stringify({ personId: testCompany.personId, pin: TEST_COMPANY_PIN }),
      });
      expect(identifyA.status).toBe(200);
      expect(identifyB.status).toBe(200);
      const cookieA = `${cookies.userA}; ${operatorCookieFrom(identifyA)}`;
      const cookieB = `${cookies.userB}; ${operatorCookieFrom(identifyB)}`;

      const hubAssign = await fixture.app.request(
        `/api/execution-tasks/${testCompany.taskId}/provider`,
        {
          method: "POST",
          headers: cookieHeader(cookies.userB),
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        },
      );
      expect(hubAssign.status).toBe(422);
      expect(((await hubAssign.json()) as { error: string }).error).toBe("ineligible_provider");

      for (const attack of [...READ_ATTACKS, ...WRITE_ATTACKS]) {
        await expectForeignMiss(fixture.app, cookieA, attack, testCompany);
        await expectForeignMiss(fixture.app, cookieB, attack, alpha);
      }

      const headerSpoof = await fixture.app.request("/api/cloud/session", {
        headers: {
          cookie: cookies.userA,
          "x-organization-id": testCompany.organizationId,
        },
      });
      const spoofBody = (await headerSpoof.json()) as {
        organization: { organizationId: string };
      };
      expect(spoofBody.organization.organizationId).toBe(alpha.organizationId);

      const forbiddenSwitch = await fixture.app.request("/api/cloud/active-organization", {
        method: "POST",
        headers: cookieHeader(cookies.userA),
        body: JSON.stringify({ organizationId: testCompany.organizationId }),
      });
      expect(forbiddenSwitch.status).toBe(403);
      const stillA = (await (
        await fixture.app.request("/api/cloud/session", { headers: { cookie: cookies.userA } })
      ).json()) as { organization: { organizationId: string } };
      expect(stillA.organization.organizationId).toBe(alpha.organizationId);

      const memberSeller = await fixture.app.request("/api/seller", {
        method: "PATCH",
        headers: cookieHeader(cookies.memberB),
        body: JSON.stringify({
          legalName: "Nu trebuie",
          brand: "",
          fiscalId: "",
          tradeRegister: "",
          address: "",
          locality: "",
          iban: "",
          bank: "",
        }),
      });
      expect(memberSeller.status).toBe(403);

      const bytesA = await (
        await fixture.app.request(
          `/api/requests/${alpha.requestId}/attachments/${alpha.attachmentId}/download`,
          { headers: { cookie: cookies.userA } },
        )
      ).text();
      const bytesB = await (
        await fixture.app.request(
          `/api/requests/${testCompany.requestId}/attachments/${testCompany.attachmentId}/download`,
          { headers: { cookie: cookies.userB } },
        )
      ).text();
      expect(bytesA).toBe(ALPHA_ATTACHMENT_BYTES);
      expect(bytesB).toBe(TEST_COMPANY_ATTACHMENT_BYTES);
      expect(bytesA).not.toBe(bytesB);

      const traversal = await fixture.app.request(
        `/api/requests/${testCompany.requestId}/attachments/..%2F${testCompany.attachmentId}/download`,
        { headers: { cookie: cookies.userA } },
      );
      expect(traversal.status).toBeGreaterThanOrEqual(400);

      const quoteHashBefore = alpha.quoteHash;
      await fixture.app.request(
        `/api/resources-admin/cost-evidence/${testCompany.costEvidenceRowId}`,
        {
          method: "PATCH",
          headers: cookieHeader(cookies.userB),
          body: JSON.stringify({ amount: 13.25, note: "test edit izolat" }),
        },
      );
      const plexiAAfterB = (
        (await (
          await fixture.app.request("/api/resources-admin", {
            headers: { cookie: cookies.userA },
          })
        ).json()) as {
          costEvidence: Array<{ resourceId: string; amount: number }>;
        }
      ).costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
      expect(plexiAAfterB?.amount).toBe(alpha.plexiAmount);
      const quoteA = (await (
        await fixture.app.request(
          `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${alpha.quoteId}`,
          { headers: { cookie: cookies.userA } },
        )
      ).json()) as { quoteSnapshot: { contentHash: string } };
      expect(quoteA.quoteSnapshot.contentHash).toBe(quoteHashBefore);

      const querySpoof = await fixture.app.request(
        `/api/customers?organizationId=${testCompany.organizationId}&planeKey=..`,
        { headers: { cookie: cookies.userA } },
      );
      const queryBody = (await querySpoof.json()) as {
        customers: Array<{ displayName: string }>;
      };
      expect(queryBody.customers.map((item) => item.displayName)).toEqual([
        alpha.customerName,
      ]);

      const memberCost = await fixture.app.request(
        `/api/resources-admin/cost-evidence/${testCompany.costEvidenceRowId}`,
        {
          method: "PATCH",
          headers: cookieHeader(cookies.memberB),
          body: JSON.stringify({ amount: 99, note: "membru" }),
        },
      );
      expect(memberCost.status).toBe(403);
    } finally {
      world.fixture.close();
    }
  });

  it("clears OperatorSession on org switch and rejects replay in the other plane", async () => {
    const world = await provisionHostileIsolationWorld();
    try {
      const { fixture, alpha, testCompany, cookies } = world;
      const identify = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userCAlpha),
        body: JSON.stringify({ personId: alpha.personId, pin: ALPHA_PIN }),
      });
      expect(identify.status).toBe(200);
      const operatorLine = identify.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${OPERATOR_SESSION_COOKIE}=`));
      expect(operatorLine).toBeTruthy();
      const operatorCookie = operatorLine?.split(";", 1)[0] ?? "";

      const switched = await fixture.app.request("/api/cloud/active-organization", {
        method: "POST",
        headers: cookieHeader(cookies.userCAlpha),
        body: JSON.stringify({ organizationId: testCompany.organizationId }),
      });
      expect(switched.status).toBe(200);
      const switchCookies = switched.headers.getSetCookie().join(";");
      expect(switchCookies).toMatch(new RegExp(`${OPERATOR_SESSION_COOKIE}=;`));

      const replay = await fixture.app.request("/api/operator-session", {
        headers: { cookie: `${cookies.userCTest}; ${operatorCookie}` },
      });
      const replayBody = (await replay.json()) as { operator: { personId: string } | null };
      expect(replayBody.operator).toBeNull();

      const identifyForeign = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userCTest),
        body: JSON.stringify({ personId: alpha.personId, pin: ALPHA_PIN }),
      });
      expect(identifyForeign.status).toBe(404);

      const identifyB = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userCTest),
        body: JSON.stringify({ personId: testCompany.personId, pin: TEST_COMPANY_PIN }),
      });
      expect(identifyB.status).toBe(200);
    } finally {
      world.fixture.close();
    }
  });

  it("clears OperatorSession on Cloud logout", async () => {
    const world = await provisionHostileIsolationWorld();
    try {
      const { fixture, alpha, cookies } = world;
      const identify = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: cookieHeader(cookies.userCAlpha),
        body: JSON.stringify({ personId: alpha.personId, pin: ALPHA_PIN }),
      });
      expect(identify.status).toBe(200);
      const operatorLine = identify.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${OPERATOR_SESSION_COOKIE}=`));
      const operatorCookie = operatorLine?.split(";", 1)[0] ?? "";
      const loggedOut = await fixture.app.request("/api/cloud/logout", {
        method: "POST",
        headers: { cookie: `${cookies.userCAlpha}; ${operatorCookie}` },
      });
      expect(loggedOut.status).toBe(200);
      const replay = await fixture.app.request("/api/operator-session", {
        headers: { cookie: operatorCookie },
      });
      expect(replay.status).toBe(401);
      const replayBody = (await replay.json()) as {
        operator?: { personId: string } | null;
        error?: string;
      };
      expect(replayBody.operator ?? null).toBeNull();
      expect(replayBody.error).toBe("invalid_session");
    } finally {
      world.fixture.close();
    }
  });
});
