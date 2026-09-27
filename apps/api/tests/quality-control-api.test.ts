import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, INSPECT_FINISHED_LETTER_ID, CUT_SHEET_CNC_ID } from "@workos-final/domain";
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
import { sessionCookieViaHttp } from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "CONTROL",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("quality control API", () => {
  it("rejects bare completion and externalization of a quality task", async () => {
    const app = createApp();
    const preview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const accepted = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues, reviewId: preview.reviewId }),
      }),
    );
    const snapshot = accepted.snapshot as JsonObject;
    const created = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
        { method: "POST" },
      ),
    );
    const executionPlan = created.executionPlan as { tasks: JsonObject[] };
    const qc = executionPlan.tasks.find((task) => task.processId === INSPECT_FINISHED_LETTER_ID);
    const cutting = executionPlan.tasks.find((task) => task.processId === CUT_SHEET_CNC_ID);
    expect(qc?.taskId).toEqual(expect.any(String));
    expect(qc?.canExternalize).toBe(false);
    expect(qc?.qualityControl).toBe(true);

    const anonymous = await app.request(`/api/execution-tasks/${qc?.taskId}/quality-fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "Defect" }),
    });
    expect(anonymous.status).toBe(401);

    const person = await readBody(
      await app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Controlor" }),
      }),
    );
    const personId = (person.person as JsonObject).personId as string;
    const cookie = await sessionCookieViaHttp(app, personId);
    const completed = await app.request(`/api/execution-tasks/${qc?.taskId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(completed.status).toBe(409);
    expect((await readBody(completed)).error).toBe("quality_result_required");

    const externalized = await app.request(`/api/execution-tasks/${qc?.taskId}/external`, {
      method: "POST",
    });
    expect(externalized.status).toBe(409);
    expect((await readBody(externalized)).error).toBe("quality_control_not_externalizable");

    const cuttingExternal = await app.request(`/api/execution-tasks/${cutting?.taskId}/external`, {
      method: "POST",
    });
    expect((await readBody(cuttingExternal)).error).not.toBe("quality_control_not_externalizable");
  });

  it("reserves correction close for the organization owner and hides another organization's task", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, {
      email: "owner-a@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "owner-b@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    const ownerA = await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD);
    const ownerB = await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD);
    const memberA = await loginCloud(
      fixture.app,
      "member-a@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    const memberClose = await fixture.app.request("/api/execution-tasks/task-missing/rework-close", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberA.cookie ?? "" },
      body: JSON.stringify({ note: "Nu eu" }),
    });
    expect(memberClose.status).toBe(403);
    const ownerMissing = await fixture.app.request("/api/execution-tasks/task-missing/rework-close", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerA.cookie ?? "" },
      body: JSON.stringify({ note: "Corectat" }),
    });
    expect(ownerMissing.status).toBe(404);

    const preview = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerA.cookie ?? "" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const accepted = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerA.cookie ?? "" },
        body: JSON.stringify({ values: readyValues, reviewId: preview.reviewId }),
      }),
    );
    const snapshotId = (accepted.snapshot as JsonObject).snapshotId;
    const created = await readBody(
      await fixture.app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
        { method: "POST", headers: { cookie: ownerA.cookie ?? "" } },
      ),
    );
    const planId = ((created.executionPlan as JsonObject).plan as JsonObject).planId;
    const hidden = await fixture.app.request(`/api/execution-plans/${planId}`, {
      headers: { cookie: ownerB.cookie ?? "" },
    });
    expect(hidden.status).toBe(404);
  });
});
