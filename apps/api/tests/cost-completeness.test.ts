import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { CANONICAL_PRODUCT_CODE, PLEXIGLAS_3MM_OPAL_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
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

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "COST",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const vinylValues = {
  ...readyValues,
  "face.finish": "vinyl",
  "face.color": "alb",
};

describe("cost completeness transport", () => {
  it("gives the owner structured issues and keeps them off member confirm", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier Cost");
    await addUser(fixture, {
      email: "owner-cost@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-cost@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-cost@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const member = await loginCloud(
      fixture.app,
      "member-cost@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const compiled = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { cookie: owner.cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({ values: vinylValues }),
      }),
    );
    const ownerConfirm = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({
          values: vinylValues,
          reviewId: compiled.reviewId,
        }),
      }),
    );
    const issues = ownerConfirm.costCompletenessIssues as Array<JsonObject>;
    const eic = ownerConfirm.eic as JsonObject;
    const commercialPrice = ownerConfirm.commercialPrice as JsonObject;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.calculationStatus).toBe("CALCULABLE");
    expect(eic.verificationStatus).toBe("NEEDS_VERIFICATION");
    expect(ownerConfirm.calculatedPriceAvailable).toBe(true);
    expect(commercialPrice.completeness).toBe("COMPLETE");
    expect(typeof commercialPrice.netPrice).toBe("number");
    expect(typeof commercialPrice.grossPrice).toBe("number");
    expect(issues.some((issue) => issue.type === "PROVISIONAL_COST_EVIDENCE")).toBe(true);
    expect(issues.some((issue) => issue.impact === "REQUIRES_VERIFICATION")).toBe(true);
    expect(issues.some((issue) => typeof issue.resourceId === "string")).toBe(true);
    expect(issues.some((issue) => issue.reason === "Cost existent, dar neconfirmat")).toBe(
      true,
    );
    expect(JSON.stringify(issues)).not.toMatch(/Tarif lipsă/);

    const memberConfirm = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { cookie: member.cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({
          values: vinylValues,
          reviewId: compiled.reviewId,
        }),
      }),
    );
    expect(memberConfirm.costCompletenessIssues).toBeUndefined();
    expect(memberConfirm.eic).toBeUndefined();
    fixture.close();
  });

  it("returns no unresolved issues for a complete owner confirm", async () => {
    const app = createApp();
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const confirmed = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: readyValues,
          reviewId: compiled.reviewId,
        }),
      }),
    );
    expect((confirmed.eic as JsonObject).completeness).toBe("COMPLETE");
    expect(confirmed.costCompletenessIssues).toEqual([]);
  });

  it("blocks cost-plus when a required numeric tariff is missing", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier Lipsa");
    await addUser(fixture, {
      email: "owner-lipsa@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const db = new Database(org.paths.sqlitePath);
    db.prepare(
      `
      UPDATE resource_cost_evidence
      SET superseded_at = ?
      WHERE resource_id = ? AND superseded_at IS NULL
    `,
    ).run(new Date().toISOString(), PLEXIGLAS_3MM_OPAL_ID);
    db.close();
    const owner = await loginCloud(
      fixture.app,
      "owner-lipsa@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const compiled = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { cookie: owner.cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const confirmed = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie ?? "", "content-type": "application/json" },
        body: JSON.stringify({
          values: readyValues,
          reviewId: compiled.reviewId,
        }),
      }),
    );
    const eic = confirmed.eic as JsonObject;
    const issues = confirmed.costCompletenessIssues as Array<JsonObject>;
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.calculationStatus).toBe("UNAVAILABLE");
    expect(confirmed.calculatedPriceAvailable).toBe(false);
    expect(issues.some((issue) => issue.resourceId === PLEXIGLAS_3MM_OPAL_ID)).toBe(true);
    expect(issues.some((issue) => issue.label === "Plexiglas 3 mm opal")).toBe(true);
    expect(issues.some((issue) => issue.impact === "BLOCKS_CALCULATION")).toBe(true);
    expect(
      issues.some(
        (issue) => issue.resourceId === PLEXIGLAS_3MM_OPAL_ID && issue.rate !== undefined,
      ),
    ).toBe(false);
    fixture.close();
  });
});
