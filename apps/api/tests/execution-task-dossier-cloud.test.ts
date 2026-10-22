import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { afterEach, describe, expect, it } from "vitest";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  OWNER_PASSWORD,
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
} from "./cloud-harness.js";

type Obj = Record<string, unknown>;

const values = {
  "root.inscription": "MEM",
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

describe("task dossier cloud tenancy", () => {
  it("keeps files inside the organization that uploaded them", async () => {
    const fixture = createCloudFixture();
    try {
      const alpha = await addOrganization(fixture, "Atelier Dossier Alpha");
      const beta = await addOrganization(fixture, "Atelier Dossier Beta");
      await addUser(fixture, {
        email: "owner-a-dossier@example.test",
        password: OWNER_PASSWORD,
        organizationId: alpha.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "owner-b-dossier@example.test",
        password: OWNER_PASSWORD,
        organizationId: beta.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app, "owner-a-dossier@example.test", OWNER_PASSWORD, alpha.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app, "owner-b-dossier@example.test", OWNER_PASSWORD, beta.organization.organizationId,
      );
      const cookieA = ownerA.cookie ?? "";
      const cookieB = ownerB.cookie ?? "";
      for (const [cookie, legalName] of [
        [cookieA, "Atelier Dossier Alpha SRL"],
        [cookieB, "Atelier Dossier Beta SRL"],
      ] as const) {
        const seller = await fixture.app.request("/api/seller", {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ legalName }),
        });
        expect(seller.status).toBe(200);
      }
      const jobA = await buildJob(fixture.app, cookieA);
      const jobB = await buildJob(fixture.app, cookieB);
      const taskA = await firstTaskId(fixture.app, jobA, cookieA);
      const taskB = await firstTaskId(fixture.app, jobB, cookieB);

      const upload = new FormData();
      upload.set("file", new File(["traseu"], "debitare.nc", { type: "text/plain" }));
      upload.set("purpose", "WORKING");
      const stored = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(taskA)}/artifacts`, {
        method: "POST",
        headers: { cookie: cookieA },
        body: upload,
      });
      expect(stored.status).toBe(200);
      const dossier = ((await stored.json()) as Obj).dossier as Obj;
      const file = (dossier.files as Obj[])[0];
      expect(file?.jobId).toBe(jobA);
      expect(file?.purpose).toBe("WORKING");
      expect(file?.usedAt).toBeNull();
      const artifactId = String(file?.artifactId);

      const ownRecord = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobA)}/record`, { headers: { cookie: cookieA } });
      expect(ownRecord.status).toBe(200);
      const ownFiles = (((await ownRecord.json()) as Obj).record as Obj).files as Obj[];
      expect(ownFiles.map(f => f.artifactId)).toContain(artifactId);
      expect((await fixture.app.request(`/api/jobs/${encodeURIComponent(jobA)}/record`, { headers: { cookie: cookieB } })).status).toBe(404);
      const otherRecord = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobB)}/record`, { headers: { cookie: cookieB } });
      expect(((((await otherRecord.json()) as Obj).record as Obj).files as Obj[]).map(f => f.artifactId)).not.toContain(artifactId);

      const foreignDownload = await fixture.app.request(
        `/api/execution-artifacts/${encodeURIComponent(artifactId)}/download`,
        { headers: { cookie: cookieB } },
      );
      expect(foreignDownload.status).toBe(404);

      const foreignDossier = await fixture.app.request(
        `/api/execution-tasks/${encodeURIComponent(taskA)}/dossier`,
        { headers: { cookie: cookieB } },
      );
      expect(foreignDossier.status).toBe(404);

      const foreignLink = await fixture.app.request(
        `/api/execution-tasks/${encodeURIComponent(taskB)}/artifact-links`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieB },
          body: JSON.stringify({ artifactId }),
        },
      );
      expect(foreignLink.status).toBe(404);

      const ownDownload = await fixture.app.request(
        `/api/execution-artifacts/${encodeURIComponent(artifactId)}/download`,
        { headers: { cookie: cookieA } },
      );
      expect(ownDownload.status).toBe(200);
      expect(await ownDownload.text()).toBe("traseu");
    } finally {
      fixture.close();
    }
  });

  it("keeps a job file before the plan and scopes usage to one operation", async () => {
    const fixture = createCloudFixture();
    try {
      const alpha = await addOrganization(fixture, "Atelier Arhiva Alpha");
      const beta = await addOrganization(fixture, "Atelier Arhiva Beta");
      await addUser(fixture, {
        email: "owner-a-archive@example.test",
        password: OWNER_PASSWORD,
        organizationId: alpha.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "owner-b-archive@example.test",
        password: OWNER_PASSWORD,
        organizationId: beta.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app, "owner-a-archive@example.test", OWNER_PASSWORD, alpha.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app, "owner-b-archive@example.test", OWNER_PASSWORD, beta.organization.organizationId,
      );
      const cookieA = ownerA.cookie ?? "";
      const cookieB = ownerB.cookie ?? "";
      const seller = await fixture.app.request("/api/seller", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ legalName: "Atelier Arhiva Alpha SRL" }),
      });
      expect(seller.status).toBe(200);
      const jobId = await releaseJob(fixture.app, cookieA);
      const beforePlan = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: { cookie: cookieA },
      });
      expect(((await beforePlan.json()) as Obj).execution).toBeNull();

      const upload = new FormData();
      upload.set("file", new File(["schița"], "schita.txt", { type: "text/plain" }));
      upload.set("purpose", "WORKING");
      upload.set("note", "Contur pentru debitare.");
      const stored = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/files`, {
        method: "POST",
        headers: { cookie: cookieA },
        body: upload,
      });
      expect(stored.status).toBe(200);
      const archive = ((await stored.json()) as Obj).archive as Obj;
      const original = (archive.files as Obj[])[0];
      const artifactId = String(original?.artifactId);
      expect(original?.planId).toBeNull();
      expect(original?.purpose).toBe("WORKING");

      const planned = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/execution-plan`, {
        method: "POST",
        headers: { cookie: cookieA },
      });
      expect(planned.status).toBe(200);
      const kept = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/files`, {
        headers: { cookie: cookieA },
      });
      const keptFiles = (((await kept.json()) as Obj).archive as Obj).files as Obj[];
      expect(keptFiles.some((item) => item.artifactId === artifactId)).toBe(true);

      const version = new FormData();
      version.set("file", new File(["schița v2"], "schita-v2.txt", { type: "text/plain" }));
      version.set("supersedesArtifactId", artifactId);
      const versioned = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/files`, {
        method: "POST",
        headers: { cookie: cookieA },
        body: version,
      });
      expect(versioned.status).toBe(200);
      const versions = (((await versioned.json()) as Obj).archive as Obj).files as Obj[];
      expect(versions.some((item) => item.artifactId === artifactId)).toBe(true);
      expect(versions.some((item) => item.supersedesArtifactId === artifactId)).toBe(true);

      const tasks = await taskIds(fixture.app, jobId, cookieA);
      expect(tasks.length).toBeGreaterThan(1);
      const [taskA, taskB] = tasks;
      const linkA = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/file-links`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ artifactId, taskId: taskA }),
      });
      const linkB = await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/file-links`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ artifactId, taskId: taskB }),
      });
      expect(linkA.status).toBe(200);
      expect(linkB.status).toBe(200);
      expect((((await linkA.json()) as Obj).dossier as Obj).taskStatus).toBe("PLANNED");

      const marked = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(taskA)}/artifact-use`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ artifactId }),
      });
      expect(marked.status).toBe(200);
      const markedFiles = (((await marked.json()) as Obj).dossier as Obj).files as Obj[];
      expect(markedFiles.find((item) => item.artifactId === artifactId)?.usedAt).toEqual(expect.any(String));
      const other = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(taskB)}/dossier`, {
        headers: { cookie: cookieA },
      });
      const otherFiles = (((await other.json()) as Obj).dossier as Obj).files as Obj[];
      expect(otherFiles.find((item) => item.artifactId === artifactId)?.usedAt).toBeNull();

      const download = await fixture.app.request(
        `/api/execution-artifacts/${encodeURIComponent(artifactId)}/download`,
        { headers: { cookie: cookieA } },
      );
      expect(await download.text()).toBe("schița");
      expect((await fixture.app.request(`/api/jobs/${encodeURIComponent(jobId)}/files`, {
        headers: { cookie: cookieB },
      })).status).toBe(404);
      expect((await fixture.app.request(`/api/execution-artifacts/${encodeURIComponent(artifactId)}/download`, {
        headers: { cookie: cookieB },
      })).status).toBe(404);
    } finally {
      fixture.close();
    }
  });
});

async function releaseJob(app: ReturnType<typeof createCloudFixture>["app"], cookie: string): Promise<string> {
  const headers = { "content-type": "application/json", cookie };
  const compiled = (await (await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/preview",
    { method: "POST", headers, body: JSON.stringify({ values }) },
  )).json()) as Obj;
  const customer = (await (await app.request("/api/customers", {
    method: "POST", headers, body: JSON.stringify({ displayName: "Client memorie" }),
  })).json()) as Obj;
  const quoted = (await (await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        manualProductNetPrice: 400,
        values,
        reviewId: compiled.reviewId,
        customerId: (customer.customer as Obj).customerId,
      }),
    },
  )).json()) as Obj;
  expect(quoted.quoteSnapshot, JSON.stringify(quoted)).toBeTruthy();
  const quoteId = (quoted.quoteSnapshot as Obj).quoteSnapshotId as string;
  expect((await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/acceptance",
    { method: "POST", headers: { cookie } },
  )).status).toBe(200);
  const order = (await (await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/order",
    { method: "POST", headers: { cookie } },
  )).json()) as Obj;
  const orderId = (order.orderSnapshot as Obj).orderSnapshotId as string;
  const released = await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/production-release",
    { method: "POST", headers: { cookie } },
  );
  expect(released.status).toBe(200);
  return orderId;
}

async function buildJob(app: ReturnType<typeof createCloudFixture>["app"], cookie: string): Promise<string> {
  const orderId = await releaseJob(app, cookie);
  const planned = await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/execution-plan",
    { method: "POST", headers: { cookie } },
  );
  expect(planned.status).toBe(200);
  return orderId;
}

async function taskIds(
  app: ReturnType<typeof createCloudFixture>["app"],
  jobId: string,
  cookie: string,
): Promise<string[]> {
  const planned = (await (await app.request(
    "/api/jobs/" + encodeURIComponent(jobId) + "/execution-plan",
    { method: "POST", headers: { cookie } },
  )).json()) as Obj;
  const planId = ((planned.executionPlan as Obj).plan as Obj).planId as string;
  const view = (await (await app.request(
    "/api/execution-plans/" + encodeURIComponent(planId),
    { headers: { cookie } },
  )).json()) as Obj;
  const tasks = ((view.executionPlan as Obj).tasks ?? (view.plan as Obj | undefined)?.tasks ?? []) as Obj[];
  return tasks.map((item) => String(item.taskId)).filter((item) => item !== "");
}

async function firstTaskId(
  app: ReturnType<typeof createCloudFixture>["app"],
  jobId: string,
  cookie: string,
): Promise<string> {
  const planned = (await (await app.request(
    "/api/jobs/" + encodeURIComponent(jobId) + "/execution-plan",
    { method: "POST", headers: { cookie } },
  )).json()) as Obj;
  const planId = ((planned.executionPlan as Obj).plan as Obj).planId as string;
  const view = (await (await app.request(
    "/api/execution-plans/" + encodeURIComponent(planId),
    { headers: { cookie } },
  )).json()) as Obj;
  const tasks = ((view.executionPlan as Obj).tasks ?? (view.plan as Obj | undefined)?.tasks) as Obj[] | undefined;
  const taskId = String((tasks ?? [])[0]?.taskId ?? "");
  expect(taskId).not.toBe("");
  return taskId;
}
