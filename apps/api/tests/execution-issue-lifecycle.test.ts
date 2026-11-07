import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE, CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
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
import { acceptCurrentAssemblyQuote } from "./fixtures/assemblyAcceptance.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";
import { sessionCookieViaHttp } from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;
type TestApp = ReturnType<typeof createApp>;

const readyValues = {
  "root.inscription": "VIBRAȚIE",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const temps: string[] = [];
const runtimes: Array<{ close(): void }> = [];

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
  for (const runtime of runtimes.splice(0)) {
    runtime.close();
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createIsolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-issue-lifecycle-"));
  temps.push(dir);
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"), {
    documentsRoot: join(dir, "documents"),
  });
  runtimes.push(runtime);
  runtime.materializeTrustedWorkforce();
  return { app: createApp({ productSystem: runtime }), runtime };
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function headers(cookie = ""): Record<string, string> {
  return cookie ? { "content-type": "application/json", cookie } : { "content-type": "application/json" };
}

async function createReleasedJob(app: TestApp, cookie = "") {
  const reviewed = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({ values: readyValues }),
    }),
  );
  const customer = await readBody(
    await app.request("/api/customers", {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({ displayName: "Client vibrație" }),
    }),
  );
  const frozen = await freezeAcknowledgingRates(
    (body) =>
      app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: headers(cookie),
        body: JSON.stringify(body),
      }),
    {
      values: readyValues,
      reviewId: reviewed.reviewId,
      manualProductNetPrice: 400,
      customerId: (customer.customer as JsonObject).customerId,
    },
  );
  expect(frozen.status, JSON.stringify(await frozen.clone().json())).toBe(200);
  const quoteId = String(((await readBody(frozen)).quoteSnapshot as JsonObject).quoteSnapshotId);
  const order = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/confirm-order`, {
      method: "POST",
      headers: headers(cookie),
    }),
  );
  const jobId = String((order.orderSnapshot as JsonObject).orderSnapshotId);
  const produced = await app.request(`/api/jobs/${encodeURIComponent(jobId)}/production`, {
    method: "POST",
    headers: headers(cookie),
  });
  expect(produced.status).toBe(200);
  const detail = await readBody(await app.request(`/api/jobs/${encodeURIComponent(jobId)}`, { headers: headers(cookie) }));
  const planId = String((detail.execution as JsonObject).planId);
  const plan = await readBody(await app.request(`/api/execution-plans/${encodeURIComponent(planId)}`, { headers: headers(cookie) }));
  const tasks = (plan.executionPlan as { tasks: JsonObject[] }).tasks;
  const task = tasks.find((item) => item.processLabel === "Debitare foaie CNC") ?? tasks[0];
  return { jobId, planId, taskId: String((task as JsonObject).taskId) };
}

async function operatorCookie(app: TestApp, runtime: ReturnType<typeof createProductSystemRuntime>) {
  const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
  expect(florin).toBeTruthy();
  return sessionCookieViaHttp(app, florin!.personId);
}

describe("operational issue visibility", () => {
  it("persists a report, raises job attention, and keeps the issue after task and job completion", async () => {
    const { app, runtime } = createIsolatedApp();
    const cookie = await operatorCookie(app, runtime);
    const released = await createReleasedJob(app);
    const jobsBefore = await readBody(await app.request("/api/jobs"));
    const before = ((jobsBefore.overview as JsonObject).jobs as JsonObject[]).find((item) => item.jobId === released.jobId);
    expect(before?.needsAttention).toBe(false);

    const reported = await app.request(`/api/execution-tasks/${released.taskId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ reason: "MACHINE", text: "Vibrație anormală CNC. Am oprit lucrul." }),
    });
    expect(reported.status).toBe(200);
    const issue = (((await readBody(reported)).dossier as JsonObject).issues as JsonObject[])[0];
    expect(issue).toMatchObject({
      status: "OPEN",
      statusLabel: "Deschisă",
      reasonCode: "MACHINE",
      body: "Vibrație anormală CNC. Am oprit lucrul.",
      canAcknowledge: true,
      canResolve: true,
    });
    expect(
      runtime.readExecutionPlanByTaskId(released.taskId)?.tasks.find((item) => item.taskId === released.taskId)?.status,
    ).toBe("PLANNED");

    const second = await app.request(`/api/execution-tasks/${released.taskId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ reason: "QUALITY", text: "A doua semnalare pe aceeași lucrare." }),
    });
    expect(second.status).toBe(200);

    const jobsAfter = await readBody(await app.request("/api/jobs"));
    const listed = ((jobsAfter.overview as JsonObject).jobs as JsonObject[]).find((item) => item.jobId === released.jobId);
    expect(listed).toMatchObject({
      needsAttention: true,
      attentionLabel: "Probleme semnalate",
      activeIssueCount: 2,
    });
    const record = await readBody(await app.request(`/api/jobs/${encodeURIComponent(released.jobId)}/record`));
    expect(((record.record as JsonObject).issues as JsonObject[]).length).toBe(2);

    const acknowledged = await app.request(
      `/api/execution-tasks/${released.taskId}/issues/${encodeURIComponent(String(issue.entryId))}/acknowledge`,
      { method: "POST" },
    );
    expect(acknowledged.status).toBe(200);
    expect((((await readBody(acknowledged)).dossier as JsonObject).issues as JsonObject[])[0]).toMatchObject({
      status: "ACKNOWLEDGED",
      statusLabel: "Preluată",
      canAcknowledge: false,
      canResolve: true,
    });

    runtime
      .assemblyPlane()
      .db.prepare(`UPDATE execution_tasks SET status = 'COMPLETED', completed_at = ? WHERE task_id = ?`)
      .run("2026-11-07T10:00:00.000Z", released.taskId);
    const afterTask = await readBody(await app.request(`/api/execution-tasks/${released.taskId}/dossier`));
    expect(((afterTask.dossier as JsonObject).issues as JsonObject[])[0]?.status).toBe("ACKNOWLEDGED");

    runtime
      .assemblyPlane()
      .db.prepare(`UPDATE execution_tasks SET status = 'COMPLETED', completed_at = ? WHERE plan_id = ?`)
      .run("2026-11-07T11:00:00.000Z", released.planId);
    const afterJob = await readBody(await app.request("/api/jobs"));
    const completed = ((afterJob.overview as JsonObject).jobs as JsonObject[]).find((item) => item.jobId === released.jobId);
    expect(completed).toMatchObject({
      stage: "EXECUTION_COMPLETED",
      needsAttention: true,
      attentionLabel: "Probleme semnalate",
      activeIssueCount: 2,
    });

    const resolved = await app.request(
      `/api/execution-tasks/${released.taskId}/issues/${encodeURIComponent(String(issue.entryId))}/resolve`,
      { method: "POST" },
    );
    expect(resolved.status).toBe(200);
    const remaining = await readBody(await app.request("/api/jobs"));
    const afterResolve = ((remaining.overview as JsonObject).jobs as JsonObject[]).find(
      (item) => item.jobId === released.jobId,
    );
    expect(afterResolve?.activeIssueCount).toBe(1);
    expect(afterResolve?.needsAttention).toBe(true);
  });

  it("keeps legacy reports accessible as open attention", async () => {
    const { app, runtime } = createIsolatedApp();
    const cookie = await operatorCookie(app, runtime);
    const released = await createReleasedJob(app);
    const reported = await readBody(
      await app.request(`/api/execution-tasks/${released.taskId}/issues`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ reason: "OTHER", text: "Raport vechi fără ciclu." }),
      }),
    );
    const entryId = String(((reported.dossier as JsonObject).issues as JsonObject[])[0]?.entryId);
    runtime.assemblyPlane().db.prepare(`DELETE FROM execution_task_issue_lifecycle WHERE entry_id = ?`).run(entryId);
    const dossier = await readBody(await app.request(`/api/execution-tasks/${released.taskId}/dossier`));
    expect(((dossier.dossier as JsonObject).issues as JsonObject[])[0]).toMatchObject({
      status: "OPEN",
      statusLabel: "Deschisă",
    });
    const jobs = await readBody(await app.request("/api/jobs"));
    const listed = ((jobs.overview as JsonObject).jobs as JsonObject[]).find((item) => item.jobId === released.jobId);
    expect(listed?.attentionLabel).toBe("Problemă semnalată");
  });

  it("rejects unauthorized transitions and hides another organization's issue", async () => {
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
      email: "member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    await addUser(fixture, {
      email: "owner-b@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    const ownerA = await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD);
    const memberA = await loginCloud(
      fixture.app,
      "member-a@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    const ownerB = await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD);
    const ownerCookie = ownerA.cookie ?? "";
    expect(
      (
        await fixture.app.request("/api/seller", {
          method: "PATCH",
          headers: headers(ownerCookie),
          body: JSON.stringify({ legalName: "Atelier Alpha SRL" }),
        })
      ).status,
    ).toBe(200);

    const createdPerson = await readBody(
      await fixture.app.request("/api/people", {
        method: "POST",
        headers: headers(ownerCookie),
        body: JSON.stringify({ displayName: "Operator Alpha" }),
      }),
    );
    const operator = await sessionCookieViaHttp(
      fixture.app,
      String((createdPerson.person as JsonObject).personId),
      "246810",
      ownerCookie,
    );
    const released = await createReleasedJob(fixture.app, ownerCookie);
    const reported = await fixture.app.request(`/api/execution-tasks/${released.taskId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${ownerCookie}; ${operator}` },
      body: JSON.stringify({ reason: "MACHINE", text: "Vibrație." }),
    });
    expect(reported.status).toBe(200);
    const entryId = String((((await readBody(reported)).dossier as JsonObject).issues as JsonObject[])[0]?.entryId);

    const memberAck = await fixture.app.request(
      `/api/execution-tasks/${released.taskId}/issues/${encodeURIComponent(entryId)}/acknowledge`,
      { method: "POST", headers: { cookie: memberA.cookie ?? "" } },
    );
    expect(memberAck.status).toBe(403);

    const foreign = await fixture.app.request(
      `/api/execution-tasks/${released.taskId}/issues/${encodeURIComponent(entryId)}/acknowledge`,
      { method: "POST", headers: { cookie: ownerB.cookie ?? "" } },
    );
    expect(foreign.status).toBe(404);

    const ownerAck = await fixture.app.request(
      `/api/execution-tasks/${released.taskId}/issues/${encodeURIComponent(entryId)}/acknowledge`,
      { method: "POST", headers: { cookie: ownerCookie } },
    );
    expect(ownerAck.status).toBe(200);
  });

  it("raises assembly job attention from a reported issue", async () => {
    const { app, runtime } = createIsolatedApp();
    const cookie = await operatorCookie(app, runtime);
    const customer = await readBody(
      await app.request("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Assembly Demo" }),
      }),
    );
    const request = await readBody(
      await app.request("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: (customer.customer as JsonObject).customerId,
          title: "Panou ACM + litere",
          description: "Ansamblu demonstrativ",
        }),
      }),
    );
    const created = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: (request.request as JsonObject).requestId }),
    });
    expect(created.status).toBe(201);
    const assemblyId = String(((await readBody(created)).assembly as JsonObject).assemblyId);
    const acmReview = await readBody(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: {
            "root.inscription": "PANOU ACM",
            "face.widthMm": 1000,
            "face.heightMm": 500,
            "face.cassetteDepthMm": 40,
          },
        }),
      }),
    );
    const lettersReview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(
      (
        await app.request(`/api/assemblies/${assemblyId}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            manualProductNetPrice: 400,
            role: "SUPPORT_PANEL",
            values: {
              "root.inscription": "PANOU ACM",
              "face.widthMm": 1000,
              "face.heightMm": 500,
              "face.cassetteDepthMm": 40,
            },
            reviewId: acmReview.reviewId,
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/assemblies/${assemblyId}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            manualProductNetPrice: 400,
            role: "SIGNAGE_LETTERS",
            values: readyValues,
            reviewId: lettersReview.reviewId,
          }),
        })
      ).status,
    ).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/confirm`, { method: "POST" })).status).toBe(200);
    expect(
      (
        await freezeAcknowledgingRates((body) =>
          app.request(`/api/assemblies/${assemblyId}/quote`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(200);
    expect((await acceptCurrentAssemblyQuote(app, assemblyId)).status).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/production`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/execution-plan`, { method: "POST" })).status).toBe(200);
    const listed = await readBody(await app.request("/api/jobs"));
    const job = ((listed.overview as JsonObject).jobs as JsonObject[]).find((item) => item.kind === "ASSEMBLY");
    expect(job).toBeTruthy();
    const assemblyView = await readBody(await app.request(`/api/assemblies/${assemblyId}`));
    const executionPlanId = String((assemblyView.assembly as JsonObject).executionPlanId);
    const plan = await readBody(await app.request(`/api/execution-plans/${encodeURIComponent(executionPlanId)}`));
    const taskId = String(((plan.executionPlan as { tasks: JsonObject[] }).tasks[0] as JsonObject).taskId);
    const reported = await app.request(`/api/execution-tasks/${taskId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ reason: "MACHINE", text: "Vibrație pe ansamblu." }),
    });
    expect(reported.status).toBe(200);
    const after = await readBody(await app.request("/api/jobs"));
    const listedJob = ((after.overview as JsonObject).jobs as JsonObject[]).find((item) => item.jobId === job?.jobId);
    expect(listedJob).toMatchObject({
      kind: "ASSEMBLY",
      needsAttention: true,
      attentionLabel: "Problemă semnalată",
      activeIssueCount: 1,
    });
  });
});
