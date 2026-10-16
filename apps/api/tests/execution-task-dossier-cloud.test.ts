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
});

async function buildJob(app: ReturnType<typeof createCloudFixture>["app"], cookie: string): Promise<string> {
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
  const planned = await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/execution-plan",
    { method: "POST", headers: { cookie } },
  );
  expect(planned.status).toBe(200);
  return orderId;
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
