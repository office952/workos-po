import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { cleanupCloudTemps } from "./cloud-harness.js";
import { sessionCookieViaHttp } from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const isolatedRoots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
  for (const dir of isolatedRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function createExecutionPlan(app: ReturnType<typeof createApp>) {
  const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: readyValues }),
  });
  const reviewId = (await readBody(preview)).reviewId as string;
  const customer = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Client execuție" }),
  });
  const customerId = ((await readBody(customer)).customer as JsonObject).customerId as string;
  const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manualProductNetPrice: 400, values: readyValues, reviewId, customerId }),
  });
  const quoteId = ((await readBody(quote)).quoteSnapshot as JsonObject).quoteSnapshotId as string;
  await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
    { method: "POST" },
  );
  const order = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
    { method: "POST" },
  );
  const orderId = ((await readBody(order)).orderSnapshot as JsonObject).orderSnapshotId as string;
  const released = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderId}/production-release`,
    { method: "POST" },
  );
  const snapshotId = ((await readBody(released)).snapshot as JsonObject).snapshotId as string;
  const planned = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
    { method: "POST" },
  );
  return (await readBody(planned)).executionPlan as { plan: JsonObject; tasks: JsonObject[] };
}

function providersOf(task: JsonObject): JsonObject[] {
  return (task.eligibleProviders as JsonObject[] | undefined) ?? [];
}

describe("job record and individual work participation", () => {
  it("persists joining, leaving, cross-job exclusion and immutable file-use evidence", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-21T07:00:00.000Z"));
    const root = mkdtempSync(join(tmpdir(), "workos-job-record-")); isolatedRoots.push(root);
    const runtime = createProductSystemRuntime(join(root, "organization.sqlite")); const app = createApp({ productSystem: runtime });
    try {
      const first = await createExecutionPlan(app); const second = await createExecutionPlan(app);
      const task = first.tasks.find(t => providersOf(t).some(p => p.id === MCH_CNC_4020_ID))!;
      const other = second.tasks.find(t => providersOf(t).some(p => p.id === MCH_CNC_4020_ID))!;
      async function operator(name: string) { const res = await readBody(await app.request('/api/people', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name }) }));
        const id = (res.person as JsonObject).personId as string; return { id, cookie: await sessionCookieViaHttp(app, id) }; }
      const ion = await operator('Ion sesiuni'); const maria = await operator('Maria sesiuni');
      const stamp = (at: string, id: string) => ({ source: 'AUTO_UNIQUE' as const, boundAt: at, accountId: 'test', operatorId: id });
      const startAt = '2026-10-21T08:00:00.000Z';
      expect(runtime.claimAndStartExecutionTask(String(task.taskId), ion.id, stamp(startAt, ion.id)).ok).toBe(true);
      expect(runtime.claimAndStartExecutionTask(String(task.taskId), maria.id, stamp('2026-10-21T08:05:00.000Z', maria.id)).ok).toBe(true);
      const retry = runtime.claimAndStartExecutionTask(String(task.taskId), maria.id, stamp('2026-10-21T08:06:00.000Z', maria.id));
      expect(retry.ok && retry.alreadyApplied).toBe(true);
      const viewed = await readBody(await app.request('/api/execution-plans/' + first.plan.planId, { headers: { cookie: maria.cookie } }));
      const projected = (viewed.executionPlan as { tasks: JsonObject[] }).tasks.find(t => t.taskId === task.taskId)!;
      expect(projected.canLeave).toBe(true); expect(projected.canComplete).toBe(false); expect(projected.completionParticipationBlock).toContain('Ion sesiuni');
      expect(runtime.completeExecutionTask(String(task.taskId), {}, maria.id)).toMatchObject({ ok: false, error: 'active_participants' });
      expect(runtime.readExecutionPlanByTaskId(String(task.taskId))!.tasks.find(t => t.taskId === task.taskId)!.workSessions!.filter(s => !s.endedAt)).toHaveLength(2);
      expect(runtime.retirePerson(maria.id)).toMatchObject({ ok: false, error: 'has_active_task' });
      expect(runtime.claimAndStartExecutionTask(String(other.taskId), maria.id, stamp('2026-10-21T08:10:00.000Z', maria.id))).toMatchObject({ ok: false, error: 'active_work_elsewhere' });
      expect(runtime.readExecutionPlanByTaskId(String(other.taskId))?.tasks.find(t => t.taskId === other.taskId)?.status).toBe('PLANNED');
      expect(runtime.leaveExecutionWork(String(task.taskId), maria.id, '2026-10-21T08:20:00.000Z').ok).toBe(true);
      expect(runtime.leaveExecutionWork(String(task.taskId), maria.id, '2026-10-21T08:21:00.000Z')).toMatchObject({ ok: true, alreadyApplied: true });
      const after = runtime.readExecutionPlanByTaskId(String(task.taskId))!.tasks.find(t => t.taskId === task.taskId)!;
      expect(after.status).toBe('IN_PROGRESS'); expect(after.assignedExecutor?.id).toBe(ion.id); expect(after.workSessions?.filter(s => !s.endedAt)).toHaveLength(1);
      expect(runtime.retirePerson(maria.id).ok).toBe(true);
      const ana = await operator('Ana sesiuni');
      expect(runtime.claimAndStartExecutionTask(String(other.taskId), ana.id, stamp('2026-10-21T08:22:00.000Z', ana.id)).ok).toBe(true);
      vi.setSystemTime(new Date("2026-10-21T08:30:00.000Z"));
      const completed = runtime.completeExecutionTask(String(task.taskId), { completedQuantity: task.measurableQuantity ? (task.measurableQuantity as JsonObject).value as number : undefined }, ion.id);
      expect(completed.ok).toBe(true);
      const job = runtime.listJobOverview().jobs.find(j => j.planId === first.plan.planId)!;
      const form = new FormData(); form.set('file', new File(['evidence'], 'operatie.txt', { type: 'text/plain' }));
      const uploaded = await readBody(await app.request('/api/jobs/' + encodeURIComponent(job.jobId) + '/files', { method: 'POST', body: form }));
      const artifact = ((uploaded.archive as JsonObject).files as JsonObject[])[0]!;
      const url = '/api/execution-tasks/' + encodeURIComponent(String(task.taskId));
      expect((await app.request(url + '/artifact-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ artifactId: artifact.artifactId }) })).status).toBe(200);
      expect((await app.request(url + '/artifact-use', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ion.cookie }, body: JSON.stringify({ artifactId: artifact.artifactId }) })).status).toBe(200);
      const response = await app.request('/api/jobs/' + encodeURIComponent(job.jobId) + '/record'); expect(response.status).toBe(200);
      const report = (await readBody(response)).record as JsonObject;
      const files = report.files as JsonObject[]; expect(files).toHaveLength(1);
      expect((files[0]!.usages as JsonObject[])[0]).toMatchObject({ taskId: task.taskId, usedByLabel: 'Ion sesiuni' });
      expect((report.hours as JsonObject).complete).toBe(false); // all other operations remain undocumented
      expect((report.timeline as JsonObject[]).some(e => e.label === 'A ieșit din operație' && e.actorLabel === 'Maria sesiuni')).toBe(true);
      expect((await app.request('/api/jobs/absent/record')).status).toBe(404);
    } finally { runtime.close(); }
  });
});
