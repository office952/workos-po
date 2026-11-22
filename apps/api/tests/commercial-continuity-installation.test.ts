import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  INSTALL_AT_SITE_ID,
  isQualityControlExecutionProcess,
  LAB_SITE_INSTALL_ID,
  PACK_PRODUCT_ID,
  productionCapabilityClasses,
  REQUEST_SEPARATE_QUOTE_INTENT,
  SITE_INSTALLATION_SCOPE_ID,
  SYNTHETIC_DEMO_SELLER,
} from "@workos-final/domain";
import { sessionCookieViaHttp } from "./operator-test-helpers.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
  type CloudFixture,
} from "./cloud-harness.js";

/**
 * Commercial Continuity V2 · installation across two accepted quotes of one request.
 * Characterizes the lifecycle REQUEST → QUOTE → ACCEPTANCE → ORDER on a synthetic plane and
 * proves that a second acceptance with installation is never accepted silently.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
const productPath = `/api/products/${CANONICAL_PRODUCT_CODE}`;
const values = (inscription: string) => ({
  "root.inscription": inscription,
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
});

afterEach(() => {
  resetCloudLoginAttemptGuard();
  resetAccessRateLimits();
  cleanupCloudTemps();
});

async function call(fixture: CloudFixture, cookie: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN, cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fixture.app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json | null = null;
  try {
    json = text ? (JSON.parse(text) as Json) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function setup(fixture: CloudFixture, withInstallation: boolean) {
  const { organization: org, paths } = await addOrganization(fixture, "Firma Montaj");
  await addUser(fixture, { email: "owner@montaj.test", password: OWNER_PASSWORD, organizationId: org.organizationId, role: "owner" });
  const owner = (await loginCloud(fixture.app, "owner@montaj.test", OWNER_PASSWORD, org.organizationId)).cookie as string;
  expect((await call(fixture, owner, "PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  const customer = await call(fixture, owner, "POST", "/api/customers", { displayName: "Client Montaj" });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await call(fixture, owner, "POST", "/api/requests", {
    customerId,
    title: "Litere și panou cu montaj",
    description: "Cerere sintetică pentru montajul comun.",
  });
  const requestId = String(
    (request.json?.request as Json | undefined)?.requestId ?? ((request.json?.detail as Json)?.request as Json)?.requestId,
  );
  const requestPath = `/api/requests/${encodeURIComponent(requestId)}`;
  if (withInstallation) {
    // The organization offers installation with its own crew, on confirmed synthetic rates.
    const admin = await call(fixture, owner, "GET", "/api/resources-admin");
    for (const row of (admin.json?.costEvidence as Json[] | undefined) ?? []) {
      if (typeof row.evidenceRowId !== "string" || typeof row.amount !== "number") continue;
      expect(
        (
          await call(fixture, owner, "PATCH", `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`, {
            amount: row.amount,
            note: "Confirmat test montaj",
          })
        ).status,
      ).toBe(200);
    }
    expect((await call(fixture, owner, "PATCH", "/api/operational-services/SITE_INSTALLATION", { offerMode: "INTERNAL" })).status).toBe(200);
    expect((await call(fixture, owner, "PATCH", requestPath, { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] })).status).toBe(200);
    expect(
      (
        await call(fixture, owner, "PATCH", `${requestPath}/installation-facts`, {
          expectedVersion: 0,
          street: "Strada Fabricii 10",
          city: "București",
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 3,
          plannedDurationHours: 4,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(fixture, owner, "POST", "/api/resources-admin/cost-evidence", { resourceId: LAB_SITE_INSTALL_ID, amount: 25, note: "Tarif sintetic montaj." }))
        .status,
    ).toBe(201);
    expect((await call(fixture, owner, "PATCH", `${requestPath}/installation-price`, { netPrice: 200 })).status).toBe(200);
  }
  return { owner, requestId, customerId, requestPath, sqlitePath: paths.sqlitePath };
}

/** Creates, confirms, prices and issues one variant; returns the frozen quote. */
async function issueVariant(
  fixture: CloudFixture,
  ctx: Awaited<ReturnType<typeof setup>>,
  inscription: string,
  netPrice: number,
  extra: { commercialIntent?: string } = {},
) {
  const variantsPath = `${ctx.requestPath}/variants`;
  const created = await call(fixture, ctx.owner, "POST", variantsPath, { productCode: CANONICAL_PRODUCT_CODE });
  expect(created.status, created.text).toBe(201);
  let variant = created.json?.variant as Json;
  const path = `${variantsPath}/${encodeURIComponent(String(variant.variantId))}`;
  variant = (await call(fixture, ctx.owner, "PATCH", path, { expectedVersion: variant.version, values: values(inscription) })).json?.variant as Json;
  const reviewId = String((await call(fixture, ctx.owner, "POST", `${productPath}/preview`, { values: values(inscription) })).json?.reviewId);
  const confirmed = await call(fixture, ctx.owner, "POST", `${productPath}/confirm`, {
    variantId: variant.variantId,
    expectedVersion: variant.version,
    reviewId,
  });
  expect(confirmed.status, confirmed.text).toBe(200);
  const version = Number((confirmed.json?.variant as Json).version);
  const priced = await call(fixture, ctx.owner, "PUT", `${path}/price`, { expectedVersion: version, netPrice });
  expect(priced.status, priced.text).toBe(200);
  variant = priced.json?.variant as Json;
  const frozen = await call(fixture, ctx.owner, "POST", `${productPath}/quote-snapshots`, {
    variantId: variant.variantId,
    expectedVersion: variant.version,
    ...(extra.commercialIntent ? { commercialIntent: extra.commercialIntent } : {}),
  });
  expect(frozen.status, frozen.text).toBe(200);
  return { variant, quote: frozen.json?.quoteSnapshot as Json };
}

const confirmOrder = (fixture: CloudFixture, owner: string, quote: Json, body: Json = {}) =>
  call(fixture, owner, "POST", `${productPath}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/confirm-order`, body);

function installationLine(holder: Json): Json | undefined {
  return (holder.lines as Json[] | undefined)?.find((line) => line.kind === "SITE_INSTALLATION");
}

async function provisionShopFloor(fixture: CloudFixture, owner: string) {
  const skillsRes = await call(fixture, owner, "GET", "/api/people/skills");
  expect(skillsRes.status, skillsRes.text).toBe(200);
  const skills = (skillsRes.json?.skills as Json[] | undefined) ?? [];
  const person = await call(fixture, owner, "POST", "/api/people", { displayName: "Operator montaj" });
  expect(person.status, person.text).toBe(201);
  const personId = String((person.json?.person as Json).personId);
  for (const skill of skills) {
    const assigned = await call(fixture, owner, "POST", `/api/people/${encodeURIComponent(personId)}/skills`, {
      skillId: skill.skillId,
    });
    expect(assigned.status, assigned.text).toBe(200);
  }
  for (const capability of productionCapabilityClasses) {
    const workcenter = await call(fixture, owner, "POST", "/api/workcenters", {
      label: `Zonă ${capability.label}`,
      lifecycle: "ACTIVE",
      capabilityIds: [capability.id],
    });
    expect(workcenter.status, workcenter.text).toBe(201);
    if (capability.kind !== "MACHINE") continue;
    const machine = await call(fixture, owner, "POST", "/api/machines", {
      label: `Utilaj ${capability.label}`,
      workcenterId: (workcenter.json?.workcenter as Json).id,
      lifecycle: "ACTIVE",
      capabilityIds: [capability.id],
    });
    expect(machine.status, machine.text).toBe(201);
  }
  const operator = await sessionCookieViaHttp(fixture.app, personId, "246810", owner);
  return { personId, operator, cookies: `${owner}; ${operator}` };
}

async function readPlan(fixture: CloudFixture, cookies: string, planId: string) {
  const response = await fixture.app.request(`/api/execution-plans/${encodeURIComponent(planId)}`, {
    headers: { origin: ORIGIN, cookie: cookies },
  });
  const json = (await response.json()) as Json;
  const executionPlan = json.executionPlan as Json | undefined;
  return {
    status: response.status,
    json,
    tasks: ((executionPlan?.tasks as Json[] | undefined) ?? []) as Json[],
    progress: executionPlan?.progress as Json | undefined,
  };
}

function depsComplete(task: Json, byId: Map<string, Json>) {
  const deps = Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : [];
  return deps.every((id) => String(byId.get(String(id))?.status) === "COMPLETED");
}

function completionBody(task: Json) {
  const measurable = task.measurableQuantity as { value?: unknown } | null;
  if (measurable && typeof measurable.value === "number") {
    return { completedQuantity: measurable.value };
  }
  return {};
}

async function finishReadyTask(fixture: CloudFixture, cookies: string, task: Json) {
  const taskId = String(task.taskId);
  const processId = String(task.processId);
  if (task.status === "PLANNED") {
    const started = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(taskId)}/start`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: cookies },
    });
    const startText = await started.text();
    expect(started.status, `start ${processId}: ${startText}`).toBe(200);
  }
  const quality = isQualityControlExecutionProcess(processId);
  const completed = await fixture.app.request(
    `/api/execution-tasks/${encodeURIComponent(taskId)}/${quality ? "quality-pass" : "complete"}`,
    {
      method: "POST",
      headers: { origin: ORIGIN, cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify(quality ? {} : completionBody(task)),
    },
  );
  const completeText = await completed.text();
  expect(completed.status, `complete ${processId}: ${completeText}`).toBe(200);
}

async function advancePlan(
  fixture: CloudFixture,
  cookies: string,
  planId: string,
  options: { skip?: readonly string[]; until?: (tasks: Json[]) => boolean } = {},
) {
  const skip = new Set(options.skip ?? []);
  for (let step = 0; step < 80; step += 1) {
    const plan = await readPlan(fixture, cookies, planId);
    expect(plan.status).toBe(200);
    if (options.until?.(plan.tasks)) return plan;
    const byId = new Map(plan.tasks.map((task) => [String(task.taskId), task]));
    const next = plan.tasks.find((task) => {
      if (skip.has(String(task.processId))) return false;
      if (task.status === "COMPLETED") return false;
      if (task.status === "IN_PROGRESS") return true;
      return task.status === "PLANNED" && depsComplete(task, byId);
    });
    if (!next) return plan;
    await finishReadyTask(fixture, cookies, next);
  }
  throw new Error(`advance_stuck:${planId}`);
}

function taskStatuses(tasks: Json[]) {
  return Object.fromEntries(tasks.map((task) => [String(task.taskId), String(task.status)]));
}

describe("installation shared by two quotes of one request", () => {
  it("copies the request installation into every issued quote, at the same price, and locks it", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    // The variant shows the installation as the request's own, read-only fact.
    expect(first.variant.installationNetPrice).toBe(200);
    expect((first.variant.totals as Json).netPrice).toBe(1200);
    const second = await issueVariant(fixture, ctx, "PANOU", 600);
    expect((installationLine(first.quote)?.commercial as Json).netPrice).toBe(200);
    expect((installationLine(second.quote)?.commercial as Json).netPrice).toBe(200);
    // The installation price is locked once the request holds a quote.
    const locked = await call(fixture, ctx.owner, "PATCH", `${ctx.requestPath}/installation-price`, { netPrice: 250 });
    expect(locked.status).not.toBe(200);
    fixture.close();
  });

  it("refuses a second acceptance with installation instead of doubling the charge and the operation", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    const second = await issueVariant(fixture, ctx, "PANOU", 600);

    const accepted = await confirmOrder(fixture, ctx.owner, first.quote);
    expect(accepted.status, accepted.text).toBe(200);
    expect(installationLine(accepted.json?.orderSnapshot as Json)).toBeTruthy();
    // Re-reading the first acceptance is not a second installation.
    expect((await confirmOrder(fixture, ctx.owner, first.quote)).status).toBe(200);

    const blocked = await confirmOrder(fixture, ctx.owner, second.quote);
    expect(blocked.status).toBe(409);
    expect(blocked.json).toMatchObject({
      error: "installation_decision_required",
      relatedQuoteSnapshotIds: [first.quote.quoteSnapshotId],
      installationNetPrice: 200,
      availableDecisions: ["SEPARATE", "COMMON"],
    });
    // The plain acceptance route is guarded too.
    const plain = await call(
      fixture,
      ctx.owner,
      "POST",
      `${productPath}/quote-snapshots/${encodeURIComponent(String(second.quote.quoteSnapshotId))}/acceptance`,
      {},
    );
    expect(plain.status).toBe(409);
    expect((await confirmOrder(fixture, ctx.owner, second.quote, { installationDecision: { mode: "SEPARATE", reason: " " } })).status).toBe(400);

    const direct = new Database(ctx.sqlitePath, { readonly: true });
    const orders = (direct.prepare("SELECT COUNT(*) AS n FROM order_snapshots").get() as { n: number }).n;
    const decisions = (direct.prepare("SELECT COUNT(*) AS n FROM commercial_installation_decisions").get() as { n: number }).n;
    direct.close();
    expect(orders).toBe(1);
    expect(decisions).toBe(0);
    fixture.close();
  });

  it("keeps two real installations when the Owner records why, without rewriting either quote", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    const second = await issueVariant(fixture, ctx, "PANOU", 600);
    expect((await confirmOrder(fixture, ctx.owner, first.quote)).status).toBe(200);
    const separate = await confirmOrder(fixture, ctx.owner, second.quote, {
      installationDecision: { mode: "SEPARATE", reason: "Panoul se montează la altă dată, cu altă echipă." },
    });
    expect(separate.status, separate.text).toBe(200);
    expect(installationLine(separate.json?.orderSnapshot as Json)).toBeTruthy();

    const direct = new Database(ctx.sqlitePath, { readonly: true });
    const decision = direct.prepare("SELECT mode, reason, decided_by_label, related_quote_snapshot_ids FROM commercial_installation_decisions").get() as Json;
    direct.close();
    expect(decision).toMatchObject({
      mode: "SEPARATE",
      reason: "Panoul se montează la altă dată, cu altă echipă.",
      decided_by_label: "owner@montaj.test",
    });
    expect(JSON.parse(String(decision.related_quote_snapshot_ids))).toEqual([first.quote.quoteSnapshotId]);
    // Both frozen quotes read back with their original hash.
    for (const item of [first.quote, second.quote]) {
      const read = await call(fixture, ctx.owner, "GET", `${productPath}/quote-snapshots/${encodeURIComponent(String(item.quoteSnapshotId))}`);
      expect((read.json?.quoteSnapshot as Json).contentHash).toBe(item.contentHash);
    }
    fixture.close();
  });

  it("records a shared installation once commercially and skips the member site operation", { timeout: 60_000 }, async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    const second = await issueVariant(fixture, ctx, "PANOU", 800);
    const firstOrder = await confirmOrder(fixture, ctx.owner, first.quote);
    expect(firstOrder.status, firstOrder.text).toBe(200);
    const common = await confirmOrder(fixture, ctx.owner, second.quote, { installationDecision: { mode: "COMMON" } });
    expect(common.status, common.text).toBe(200);
    expect(installationLine(common.json?.orderSnapshot as Json)).toBeTruthy();

    const detail = await call(fixture, ctx.owner, "GET", ctx.requestPath);
    const obligation = (detail.json?.detail as Json | undefined)?.installationObligation as Json | undefined;
    expect(obligation).toMatchObject({
      mode: "COMMON",
      sharedInstallationNet: 200,
      duplicatedInstallationNet: 200,
      documentSumNet: 2200,
      consolidatedObligationNet: 2000,
    });

    const holderId = String((firstOrder.json?.orderSnapshot as Json).orderSnapshotId);
    const memberId = String((common.json?.orderSnapshot as Json).orderSnapshotId);
    const holderRelease = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(holderId)}/production-release`,
    );
    const memberRelease = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(memberId)}/production-release`,
    );
    expect(holderRelease.status, holderRelease.text).toBe(200);
    expect(memberRelease.status, memberRelease.text).toBe(200);
    const holderOps = ((holderRelease.json?.snapshot as Json).operations as Json[]).map((op) => op.processId);
    const memberOps = ((memberRelease.json?.snapshot as Json).operations as Json[]).map((op) => op.processId);
    expect(holderOps).toContain("INSTALL_AT_SITE");
    expect(memberOps).not.toContain("INSTALL_AT_SITE");

    const holderSnapshotId = String((holderRelease.json?.snapshot as Json).snapshotId);
    const memberSnapshotId = String((memberRelease.json?.snapshot as Json).snapshotId);
    const holderPlan = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(holderSnapshotId)}/execution-plan`,
    );
    const memberPlan = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(memberSnapshotId)}/execution-plan`,
    );
    expect(holderPlan.status, holderPlan.text).toBe(200);
    expect(memberPlan.status, memberPlan.text).toBe(200);
    const holderPlanId = String(((holderPlan.json?.executionPlan as Json).plan as Json).planId);
    const memberPlanId = String(((memberPlan.json?.executionPlan as Json).plan as Json).planId);
    const holderRead = await call(fixture, ctx.owner, "GET", `/api/execution-plans/${encodeURIComponent(holderPlanId)}`);
    const memberRead = await call(fixture, ctx.owner, "GET", `/api/execution-plans/${encodeURIComponent(memberPlanId)}`);
    const holderTasks = ((holderRead.json?.executionPlan as Json).tasks as Json[]) ?? [];
    const memberTasks = ((memberRead.json?.executionPlan as Json).tasks as Json[]) ?? [];
    expect(holderTasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(1);
    expect(memberTasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(0);

    const floor = await provisionShopFloor(fixture, ctx.owner);
    const installTaskId = String(holderTasks.find((task) => task.processId === INSTALL_AT_SITE_ID)?.taskId);
    const blockedStart = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(installTaskId)}/start`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: floor.cookies },
    });
    const blockedBody = (await blockedStart.json()) as Json;
    expect(blockedStart.status).toBe(409);
    expect(blockedBody.error).toBe("installation_group_not_ready");

    const memberPacked = await advancePlan(fixture, floor.cookies, memberPlanId);
    expect(memberPacked.tasks.find((task) => task.processId === PACK_PRODUCT_ID)?.status).toBe("COMPLETED");
    expect(memberPacked.tasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(0);
    const memberBeforeInstall = taskStatuses(memberPacked.tasks);

    const stillBlocked = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(installTaskId)}/start`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: floor.cookies },
    });
    const stillBlockedBody = (await stillBlocked.json()) as Json;
    expect(stillBlocked.status).not.toBe(200);
    expect(stillBlockedBody.error).not.toBe("installation_group_not_ready");

    const holderPacked = await advancePlan(fixture, floor.cookies, holderPlanId, {
      skip: [INSTALL_AT_SITE_ID],
    });
    expect(holderPacked.tasks.find((task) => task.processId === PACK_PRODUCT_ID)?.status).toBe("COMPLETED");
    expect(holderPacked.tasks.find((task) => task.processId === INSTALL_AT_SITE_ID)?.status).toBe("PLANNED");
    const holderBeforeInstall = taskStatuses(
      holderPacked.tasks.filter((task) => task.processId !== INSTALL_AT_SITE_ID),
    );

    const jobsBefore = await call(fixture, ctx.owner, "GET", "/api/jobs");
    const jobList = (((jobsBefore.json?.overview as Json | undefined)?.jobs as Json[] | undefined) ?? []) as Json[];
    const holderJobBefore = jobList.find((job) => job.jobId === holderId);
    const memberJobBefore = jobList.find((job) => job.jobId === memberId);
    expect(holderJobBefore?.stage).not.toBe("EXECUTION_COMPLETED");
    expect(memberJobBefore?.stage).toBe("EXECUTION_COMPLETED");

    const startedInstall = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(installTaskId)}/start`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: floor.cookies },
    });
    const startedText = await startedInstall.text();
    expect(startedInstall.status, startedText).toBe(200);
    const installTask = holderPacked.tasks.find((task) => task.taskId === installTaskId) as Json;
    const completedInstall = await fixture.app.request(
      `/api/execution-tasks/${encodeURIComponent(installTaskId)}/complete`,
      {
        method: "POST",
        headers: { origin: ORIGIN, cookie: floor.cookies, "content-type": "application/json" },
        body: JSON.stringify(completionBody(installTask)),
      },
    );
    const completedText = await completedInstall.text();
    expect(completedInstall.status, completedText).toBe(200);

    const holderAfter = await readPlan(fixture, floor.cookies, holderPlanId);
    const memberAfter = await readPlan(fixture, floor.cookies, memberPlanId);
    expect(holderAfter.tasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(1);
    expect(holderAfter.tasks.find((task) => task.processId === INSTALL_AT_SITE_ID)?.status).toBe("COMPLETED");
    expect(memberAfter.tasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(0);
    expect(taskStatuses(memberAfter.tasks)).toEqual(memberBeforeInstall);
    expect(taskStatuses(holderAfter.tasks.filter((task) => task.processId !== INSTALL_AT_SITE_ID))).toEqual(
      holderBeforeInstall,
    );

    const replayStart = await fixture.app.request(`/api/execution-tasks/${encodeURIComponent(installTaskId)}/start`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: floor.cookies },
    });
    const replayStartBody = (await replayStart.json()) as Json;
    expect(replayStart.status).toBe(409);
    expect(replayStartBody.error).toBe("invalid_transition");
    const refresh = await readPlan(fixture, floor.cookies, holderPlanId);
    expect(refresh.tasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(1);
    expect(refresh.tasks.find((task) => task.processId === INSTALL_AT_SITE_ID)?.status).toBe("COMPLETED");

    const jobsAfter = await call(fixture, ctx.owner, "GET", "/api/jobs");
    const jobsAfterList = (((jobsAfter.json?.overview as Json | undefined)?.jobs as Json[] | undefined) ?? []) as Json[];
    expect(jobsAfterList.find((job) => job.jobId === holderId)?.stage).toBe("EXECUTION_COMPLETED");
    expect(jobsAfterList.find((job) => job.jobId === memberId)?.stage).toBe("EXECUTION_COMPLETED");

    const persisted = new Database(ctx.sqlitePath, { readonly: true });
    const installRows = persisted
      .prepare("SELECT process_id AS processId, started_at AS startedAt, completed_at AS completedAt FROM execution_tasks WHERE process_id = ?")
      .all(INSTALL_AT_SITE_ID) as Array<{ processId: string; startedAt: string | null; completedAt: string | null }>;
    persisted.close();
    expect(installRows).toHaveLength(1);
    expect(installRows[0]?.startedAt).toBeTruthy();
    expect(installRows[0]?.completedAt).toBeTruthy();

    expect((await confirmOrder(fixture, ctx.owner, first.quote)).status).toBe(200);
    expect((await confirmOrder(fixture, ctx.owner, second.quote, { installationDecision: { mode: "COMMON" } })).status).toBe(200);
    const replayHolder = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(holderId)}/production-release`,
    );
    const replayMember = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(memberId)}/production-release`,
    );
    expect(((replayHolder.json?.snapshot as Json).operations as Json[]).map((op) => op.processId)).toContain(INSTALL_AT_SITE_ID);
    expect(((replayMember.json?.snapshot as Json).operations as Json[]).map((op) => op.processId)).not.toContain(INSTALL_AT_SITE_ID);
    const replayHolderPlan = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(holderSnapshotId)}/execution-plan`,
    );
    expect(replayHolderPlan.json?.created).toBe(false);
    const afterRetry = await call(fixture, ctx.owner, "GET", `/api/execution-plans/${encodeURIComponent(holderPlanId)}`);
    const afterTasks = ((afterRetry.json?.executionPlan as Json).tasks as Json[]) ?? [];
    expect(afterTasks.filter((task) => task.processId === INSTALL_AT_SITE_ID)).toHaveLength(1);

    const detailAfter = await call(fixture, ctx.owner, "GET", ctx.requestPath);
    const obligationAfter = (detailAfter.json?.detail as Json | undefined)?.installationObligation as Json | undefined;
    expect(obligationAfter).toMatchObject({
      documentSumNet: 2200,
      consolidatedObligationNet: 2000,
    });
    fixture.close();
  });

  it("asks nothing when the request has no installation: two quotes are accepted as before", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, false);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    const second = await issueVariant(fixture, ctx, "PANOU", 600);
    expect(installationLine(first.quote)).toBeUndefined();
    expect((await confirmOrder(fixture, ctx.owner, first.quote)).status).toBe(200);
    expect((await confirmOrder(fixture, ctx.owner, second.quote)).status).toBe(200);
    const detail = await call(fixture, ctx.owner, "GET", ctx.requestPath);
    expect((detail.json?.detail as Json | undefined)?.installationObligation ?? null).toBeNull();
    fixture.close();
  });

  it("refuses to cancel a request once accepted orders exist", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    expect((await confirmOrder(fixture, ctx.owner, first.quote)).status).toBe(200);
    const cancelled = await call(fixture, ctx.owner, "PATCH", ctx.requestPath, { status: "CANCELLED" });
    expect(cancelled.status).toBe(409);
    expect(cancelled.json?.error).toBe("order_obligation_blocks_cancellation");
    fixture.close();
  });

  it("does not invent a shared commitment for a historical holder-only order", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const first = await issueVariant(fixture, ctx, "LITERE", 1000);
    const ordered = await confirmOrder(fixture, ctx.owner, first.quote);
    expect(ordered.status, ordered.text).toBe(200);
    const detail = await call(fixture, ctx.owner, "GET", ctx.requestPath);
    expect((detail.json?.detail as Json | undefined)?.installationObligation ?? null).toBeNull();
    const orderId = String((ordered.json?.orderSnapshot as Json).orderSnapshotId);
    const released = await call(
      fixture,
      ctx.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(orderId)}/production-release`,
    );
    expect(released.status, released.text).toBe(200);
    expect(((released.json?.snapshot as Json).operations as Json[]).map((op) => op.processId)).toContain(INSTALL_AT_SITE_ID);
    fixture.close();
  });
});

const ACM_VALUES = {
  "root.inscription": "PANOU",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};
const ASSEMBLY_EXCEPTION = {
  incompleteCostAcceptance: { confirm: true, reason: "Cost de ansamblare neconfigurat, acceptat explicit" },
};

async function freezeAssemblyQuote(fixture: CloudFixture, owner: string, assemblyId: string) {
  const first = await call(fixture, owner, "POST", `/api/assemblies/${assemblyId}/quote`, {});
  if (first.status !== 422) return first;
  const bindingHash = (first.json as { rateAcknowledgement?: { bindingHash?: unknown } } | null)?.rateAcknowledgement
    ?.bindingHash;
  if (first.json?.error !== "rate_acknowledgement_required" || typeof bindingHash !== "string") return first;
  return call(fixture, owner, "POST", `/api/assemblies/${assemblyId}/quote`, {
    rateAcknowledgement: { bindingHash },
  });
}

async function issueAssembly(fixture: CloudFixture, ctx: Awaited<ReturnType<typeof setup>>) {
  const created = await call(fixture, ctx.owner, "POST", "/api/assemblies", { requestId: ctx.requestId });
  expect(created.status, created.text).toBe(201);
  const assemblyId = String((created.json?.assembly as Json).assemblyId);
  const lettersPreview = await call(fixture, ctx.owner, "POST", `${productPath}/preview`, { values: values("ANSAMBLU") });
  expect(
    (
      await call(fixture, ctx.owner, "POST", `/api/assemblies/${assemblyId}/members`, {
        role: "SIGNAGE_LETTERS",
        values: values("ANSAMBLU"),
        reviewId: lettersPreview.json?.reviewId,
        pricingMethod: "MANUAL_FIXED_PRODUCT",
        manualProductNetPrice: 800,
      })
    ).status,
  ).toBe(200);
  const acmPreview = await call(fixture, ctx.owner, "POST", `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/preview`, {
    values: ACM_VALUES,
  });
  expect(
    (
      await call(fixture, ctx.owner, "POST", `/api/assemblies/${assemblyId}/members`, {
        role: "SUPPORT_PANEL",
        values: ACM_VALUES,
        reviewId: acmPreview.json?.reviewId,
        pricingMethod: "MANUAL_FIXED_PRODUCT",
        manualProductNetPrice: 400,
      })
    ).status,
  ).toBe(200);
  expect((await call(fixture, ctx.owner, "POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  const frozen = await freezeAssemblyQuote(fixture, ctx.owner, assemblyId);
  expect(frozen.status, frozen.text).toBe(200);
  const view = await call(fixture, ctx.owner, "GET", `/api/assemblies/${assemblyId}`);
  const assembly = view.json?.assembly as Json;
  expect(assembly.quoteSnapshotId).toBeTruthy();
  return { assemblyId, quoteSnapshotId: String(assembly.quoteSnapshotId) };
}

function acceptAssembly(
  fixture: CloudFixture,
  owner: string,
  assembly: { assemblyId: string; quoteSnapshotId: string },
  extra: Json = {},
) {
  return call(fixture, owner, "POST", `/api/assemblies/${assembly.assemblyId}/accept`, {
    quoteSnapshotId: assembly.quoteSnapshotId,
    ...ASSEMBLY_EXCEPTION,
    ...extra,
  });
}

describe("installation shared by a product quote and an assembly of the same request", () => {
  it("refuses product-then-assembly acceptance without a decision, then skips the member assembly install operation", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const product = await issueVariant(fixture, ctx, "LITERE", 1000);
    expect((await confirmOrder(fixture, ctx.owner, product.quote)).status).toBe(200);
    const assembly = await issueAssembly(fixture, ctx);
    const blocked = await acceptAssembly(fixture, ctx.owner, assembly);
    expect(blocked.status).toBe(409);
    expect(blocked.json?.error).toBe("installation_decision_required");
    const common = await acceptAssembly(fixture, ctx.owner, assembly, { installationDecision: { mode: "COMMON" } });
    expect(common.status, common.text).toBe(200);
    const production = await call(fixture, ctx.owner, "POST", `/api/assemblies/${assembly.assemblyId}/production`);
    expect(production.status, production.text).toBe(200);
    const direct = new Database(ctx.sqlitePath, { readonly: true });
    const payload = (
      direct.prepare("SELECT payload FROM assembly_production_snapshots ORDER BY created_at DESC LIMIT 1").get() as
        | { payload: string }
        | undefined
    )?.payload;
    direct.close();
    expect(payload).toBeTruthy();
    const snapshot = JSON.parse(String(payload)) as { assemblyOperations?: { processId?: string }[] };
    expect((snapshot.assemblyOperations ?? []).map((op) => op.processId)).not.toContain("INSTALL_AT_SITE");
    fixture.close();
  });

  it("refuses assembly-then-product acceptance without a decision", async () => {
    const fixture = createCloudFixture();
    const ctx = await setup(fixture, true);
    const assembly = await issueAssembly(fixture, ctx);
    expect((await acceptAssembly(fixture, ctx.owner, assembly)).status).toBe(200);
    const product = await issueVariant(fixture, ctx, "LITERE", 1000, {
      commercialIntent: REQUEST_SEPARATE_QUOTE_INTENT,
    });
    const blocked = await confirmOrder(fixture, ctx.owner, product.quote);
    expect(blocked.status).toBe(409);
    expect(blocked.json?.error).toBe("installation_decision_required");
    const common = await confirmOrder(fixture, ctx.owner, product.quote, { installationDecision: { mode: "COMMON" } });
    expect(common.status, common.text).toBe(200);
    fixture.close();
  });
});
