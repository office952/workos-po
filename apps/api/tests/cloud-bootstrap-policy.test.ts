import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  costEvidence,
  MCH_CNC_4020_ID,
  OWNER_CONFIRMED_SELLER,
  PLEXIGLAS_3MM_OPAL_ID,
} from "@workos-final/domain";
import { PLATFORM_DEFAULT_COST_NOTE } from "../src/resources/store.js";
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

describe("Cloud bootstrap policy", () => {
  it("does not import named TEST COMPANY fixtures into production resource bootstrap", () => {
    const store = readFileSync(new URL("../src/resources/store.ts", import.meta.url), "utf8");
    expect(store).not.toMatch(/TEST_COMPANY|testCompany|cloud\/fixtures/);
  });

  it("keeps NEW_ORGANIZATION free of HUB seller, people, confirmed costs, and machines", async () => {
    const fixture = createCloudFixture();
    try {
    const org = await addOrganization(fixture, "Firma Noua", "NEW_ORGANIZATION");
    const other = await addOrganization(fixture, "Alta Firma", "NEW_ORGANIZATION");
    await addUser(fixture, {
      email: "owner@new.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member@new.test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    await addUser(fixture, {
      email: "other@new.test",
      password: OWNER_PASSWORD,
      organizationId: other.organization.organizationId,
      role: "owner",
    });

    const owner = await loginCloud(
      fixture.app,
      "owner@new.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const headers = { cookie: owner.cookie ?? "" };

    const sellerGet = await fixture.app.request("/api/seller", { headers });
    const sellerBody = (await sellerGet.json()) as { seller: null; configured: boolean };
    expect(sellerGet.status).toBe(200);
    expect(sellerBody.seller).toBeNull();
    expect(sellerBody.configured).toBe(false);

    const sellerAgain = await fixture.app.request("/api/seller", { headers });
    expect(((await sellerAgain.json()) as { seller: null }).seller).toBeNull();

    const people = (await (
      await fixture.app.request("/api/people", { headers })
    ).json()) as { people: Array<{ displayName: string }> };
    expect(people.people).toEqual([]);
    expect(JSON.stringify(people)).not.toMatch(/Florin CNC|Calin|HUB MEDIA|per:legacy/i);

    const skills = (await (
      await fixture.app.request("/api/people/skills", { headers })
    ).json()) as { skills: Array<{ code: string }> };
    expect(skills.skills.map((item) => item.code).sort()).toEqual([
      "SK_ASSEMBLY",
      "SK_CNC_OPERATOR",
      "SK_ELECTRICIAN",
      "SK_LETTER_CANT_OPERATOR",
      "SK_LETTER_MODELING",
    ]);

    const eligibility = (await (
      await fixture.app.request("/api/people/eligibility?capabilityId=CNC_ROUTING", { headers })
    ).json()) as { eligiblePeople: unknown[] };
    expect(eligibility.eligiblePeople).toEqual([]);

    const admin = (await (
      await fixture.app.request("/api/resources-admin", { headers })
    ).json()) as {
      costEvidence: Array<{
        resourceId: string;
        evidenceRowId: string;
        classificationLabel: string;
        sourceLabel: string;
        amount: number;
      }>;
    };
    expect(admin.costEvidence.length).toBeGreaterThan(0);
    expect(
      admin.costEvidence.every(
        (row) =>
          row.classificationLabel !== "Confirmat de owner" &&
          row.sourceLabel !== "Achiziție confirmată de owner" &&
          row.sourceLabel !== "Tarif intern confirmat de owner",
      ),
    ).toBe(true);
    const plexi = admin.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.sourceLabel).toBe("Valoare implicită de platformă");
    expect(plexi?.classificationLabel).toBe("Default de dezvoltare");

    const workcenters = (await (
      await fixture.app.request("/api/workcenters", { headers })
    ).json()) as { machines?: Array<{ id: string }>; workcenters?: Array<{ id: string }> };
    expect(JSON.stringify(workcenters)).not.toContain(MCH_CNC_4020_ID);

    const assign = await fixture.app.request("/api/execution-tasks/task:missing/provider", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect([404, 422]).toContain(assign.status);

    const createdPerson = await fixture.app.request("/api/people", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ana Noua" }),
    });
    expect(createdPerson.status).toBe(201);
    const personBody = (await createdPerson.json()) as { person?: { personId: string } };
    expect(personBody.person?.personId).toBeTruthy();

    const otherOwner = await loginCloud(
      fixture.app,
      "other@new.test",
      OWNER_PASSWORD,
      other.organization.organizationId,
    );
    const otherPeople = (await (
      await fixture.app.request("/api/people", {
        headers: { cookie: otherOwner.cookie ?? "" },
      })
    ).json()) as { people: Array<{ displayName: string }> };
    expect(otherPeople.people.map((item) => item.displayName)).not.toContain("Ana Noua");

    const firstEdit = await fixture.app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ amount: 21, note: "confirmat aici" }),
      },
    );
    expect(firstEdit.status).toBe(200);
    const edited = (await firstEdit.json()) as {
      evidence: { classification: string; source: string; amount: number };
      admin: {
        costEvidence: Array<{
          resourceId: string;
          classificationLabel: string;
          sourceLabel: string;
          amount: number;
        }>;
      };
    };
    expect(edited.evidence.classification).toBe("OWNER_CONFIRMED");
    expect(edited.evidence.source).toBe("OWNER_CONFIRMED_PURCHASE");
    expect(edited.evidence.amount).toBe(21);
    const editedPlexi = edited.admin.costEvidence.find(
      (row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID,
    );
    expect(editedPlexi?.classificationLabel).toBe("Confirmat de owner");
    expect(editedPlexi?.sourceLabel).toBe("Achiziție confirmată de owner");

    const otherAdmin = (await (
      await fixture.app.request("/api/resources-admin", {
        headers: { cookie: otherOwner.cookie ?? "" },
      })
    ).json()) as {
      costEvidence: Array<{
        resourceId: string;
        classificationLabel: string;
        amount: number;
      }>;
    };
    const otherPlexi = otherAdmin.costEvidence.find(
      (row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID,
    );
    expect(otherPlexi?.classificationLabel).toBe("Default de dezvoltare");
    expect(otherPlexi?.amount).not.toBe(21);

    const compiled = await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
      }),
    });
    expect(compiled.status).toBe(200);
    const compiledBody = (await compiled.json()) as {
      definition: unknown;
      reviewId: string;
    };
    const customer = await fixture.app.request("/api/customers", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client Nou" }),
    });
    const customerId = ((await customer.json()) as { customer: { customerId: string } }).customer
      .customerId;
    const blockedQuote = await fixture.app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          definition: compiledBody.definition,
          reviewId: compiledBody.reviewId,
          customerId,
        }),
      },
    );
    expect(blockedQuote.status).toBe(422);
    expect(((await blockedQuote.json()) as { error: string }).error).toBe("seller_unconfigured");

    const member = await loginCloud(
      fixture.app,
      "member@new.test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const memberWrite = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers: {
        cookie: member.cookie ?? "",
        "content-type": "application/json",
      },
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
    expect(memberWrite.status).toBe(403);

    const sellerWrite = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        ...OWNER_CONFIRMED_SELLER,
        legalName: "Atelier Nou SRL",
        brand: "Atelier Nou",
        fiscalId: "RO11111111",
      }),
    });
    expect(sellerWrite.status).toBe(200);
    const savedSeller = (await sellerWrite.json()) as { seller: { legalName: string } };
    expect(savedSeller.seller.legalName).toBe("Atelier Nou SRL");
    expect(savedSeller.seller.legalName).not.toBe(OWNER_CONFIRMED_SELLER.legalName);

    const reopened = (await (
      await fixture.app.request("/api/seller", { headers })
    ).json()) as { seller: { legalName: string }; configured: boolean };
    expect(reopened.configured).toBe(true);
    expect(reopened.seller.legalName).toBe("Atelier Nou SRL");
    } finally {
      fixture.close();
    }
  });

  it("uses the same generic platform defaults as NEW_ORGANIZATION for SYNTHETIC_TEST", async () => {
    const fixture = createCloudFixture();
    try {
    const org = await addOrganization(fixture, "Test Sintetic", "SYNTHETIC_TEST");
    expect((await fixture.app.request("/api/resources-admin")).status).toBe(401);
    await addUser(fixture, {
      email: "synth@test.example",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const rejected = await loginCloud(
      fixture.app,
      "synth@test.example",
      "wrong-password",
      org.organization.organizationId,
    );
    expect(rejected.response.status).toBe(401);
    expect(rejected.cookie).toBeNull();
    expect((await fixture.app.request("/api/resources-admin")).status).toBe(401);
    const login = await loginCloud(
      fixture.app,
      "synth@test.example",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    expect(login.response.status).toBe(200);
    expect(login.cookie).toBeTruthy();
    const headers = { cookie: login.cookie ?? "" };
    const seller = (await (await fixture.app.request("/api/seller", { headers })).json()) as {
      seller: null;
    };
    expect(seller.seller).toBeNull();
    const people = (await (await fixture.app.request("/api/people", { headers })).json()) as {
      people: unknown[];
    };
    expect(people.people).toEqual([]);
    const skills = (await (
      await fixture.app.request("/api/people/skills", { headers })
    ).json()) as { skills: Array<{ code: string }> };
    expect(skills.skills.map((item) => item.code)).toContain("SK_CNC_OPERATOR");
    const admin = (await (
      await fixture.app.request("/api/resources-admin", { headers })
    ).json()) as {
      costEvidence: Array<{
        resourceId: string;
        amount: number;
        classificationLabel: string;
        sourceLabel: string;
        note: string;
      }>;
    };
    expect(
      admin.costEvidence.every((row) => row.classificationLabel === "Default de dezvoltare"),
    ).toBe(true);
    expect(
      admin.costEvidence.every((row) => row.sourceLabel === "Valoare implicită de platformă"),
    ).toBe(true);
    expect(admin.costEvidence.every((row) => row.note === PLATFORM_DEFAULT_COST_NOTE)).toBe(true);
    const plexi = admin.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    const platformPlexi = costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.amount).toBe(platformPlexi?.amount);
    const workcenters = await (
      await fixture.app.request("/api/workcenters", { headers })
    ).text();
    expect(workcenters).not.toContain(MCH_CNC_4020_ID);
    } finally {
      fixture.close();
    }
  });

  it("does not reseed people or costs when a NEW_ORGANIZATION plane is reopened", async () => {
    const fixture = createCloudFixture();
    try {
    const org = await addOrganization(fixture, "Firma Reopen", "NEW_ORGANIZATION");
    await addUser(fixture, {
      email: "reopen@new.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const first = await loginCloud(
      fixture.app,
      "reopen@new.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const headers = { cookie: first.cookie ?? "" };
    const created = await fixture.app.request("/api/people", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Persoana Reopen" }),
    });
    expect(created.status).toBe(201);
    const firstAdmin = (await (
      await fixture.app.request("/api/resources-admin", { headers })
    ).json()) as { costEvidence: Array<{ evidenceRowId: string; sourceLabel: string }> };
    const firstIds = firstAdmin.costEvidence.map((row) => row.evidenceRowId).sort();
    fixture.registry.closeAll();

    const second = await loginCloud(
      fixture.app,
      "reopen@new.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const again = { cookie: second.cookie ?? "" };
    const people = (await (await fixture.app.request("/api/people", { headers: again })).json()) as {
      people: Array<{ displayName: string }>;
    };
    expect(people.people.map((item) => item.displayName)).toEqual(["Persoana Reopen"]);
    const secondAdmin = (await (
      await fixture.app.request("/api/resources-admin", { headers: again })
    ).json()) as { costEvidence: Array<{ evidenceRowId: string; sourceLabel: string }> };
    expect(secondAdmin.costEvidence.map((row) => row.evidenceRowId).sort()).toEqual(firstIds);
    expect(
      secondAdmin.costEvidence.every((row) => row.sourceLabel === "Valoare implicită de platformă"),
    ).toBe(true);
    } finally {
      fixture.close();
    }
  });
});

