import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_CYCLE_C1,
  newCycleState,
  runDemoCycle,
} from "../src/cloud/demoAtelierCycle.js";
import { connectDemoAppTransport, type DemoTransport } from "../src/cloud/demoAtelierHttp.js";
import { DEMO_PEOPLE } from "../src/cloud/demoAtelierIdentity.js";
import { memoryDemoLedger, type DemoLedger } from "../src/cloud/demoAtelierLedger.js";
import { prepareDemoAtelier, readPlanTasks } from "../src/cloud/demoAtelierSeed.js";
import { generateDemoSecrets, secretsAccess } from "../src/cloud/demoAtelierSecrets.js";

/** Isolated per-test-run credentials; never a shared constant. */
const secrets = secretsAccess(generateDemoSecrets());
/** Isolated per-run password for the synthetic test roots. */
const TEST_PASSWORD = `t-${randomUUID()}`;
import { ensureOwnerReviewProvisioned } from "../src/cloud/ownerReviewReset.js";
import { HISTORY_JOBS, buildHistoryEvents, installSimulatedClock, runHistory, setupAfterHistory, validateHistory } from "../src/cloud/demoAtelierHistory.js";
import { cleanupCloudTemps, openCloudFixture, trackTempDir, type CloudFixture } from "./cloud-harness.js";

const fixtures: CloudFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close();
  }
  cleanupCloudTemps();
});

async function preparedAtelier(): Promise<{
  connect: () => Promise<DemoTransport>;
  t: DemoTransport;
  ledger: DemoLedger;
  root: string;
}> {
  const root = trackTempDir();
  const provisioned = await ensureOwnerReviewProvisioned({
    cloudRoot: root,
    password: TEST_PASSWORD,
    env: { NODE_ENV: "development" },
  });
  const fixture = openCloudFixture(root, { env: { NODE_ENV: "development" } });
  fixtures.push(fixture);
  const connect = () =>
    connectDemoAppTransport({
      app: fixture.app,
      email: provisioned.identity.email,
      password: TEST_PASSWORD,
      organizationId: provisioned.organizationId,
    });
  const t = await connect();
  const ledger = memoryDemoLedger();
  const report = await prepareDemoAtelier({ transport: t, ledger, secrets });
  expect(report.refusals).toEqual([]);
  return { connect, t, ledger, root };
}

type Diagnosis = { personId: string; displayName: string; eligible: boolean; reason: string | null };

async function eligible(t: DemoTransport, capabilityId: string): Promise<Diagnosis[]> {
  const body = (await t.client.request("GET", `/api/people/eligibility?capabilityId=${capabilityId}`)).body as {
    diagnoses: Diagnosis[];
  };
  return body.diagnoses;
}

describe("N-019 demo atelier preparation", () => {
  it("creates exactly ten workers and is repeatable without duplicates", async () => {
    const { t, ledger } = await preparedAtelier();
    const again = await prepareDemoAtelier({ transport: t, ledger, secrets });
    expect(again.applied).toEqual([]);
    expect(again.refusals).toEqual([]);
    const people = (await t.client.request("GET", "/api/people")).body?.people as Array<{ displayName: string }>;
    expect(people).toHaveLength(10);
    expect(new Set(people.map((item) => item.displayName)).size).toBe(10);
    expect(people.map((item) => item.displayName).sort()).toEqual(DEMO_PEOPLE.map((item) => item.displayName).sort());
    const customers = (await t.client.request("GET", "/api/customers")).body?.customers as Array<{ displayName: string }>;
    expect(new Set(customers.map((item) => item.displayName)).size).toBe(customers.length);
    expect(again.jobs).toBe(5);
  }, 120_000);

  it("keeps eligibility on the server: exclusive CNC, refusal, profile forming machine", async () => {
    const { t, ledger } = await preparedAtelier();
    const ion = ledger.id("person:cnc1")!;
    const capabilities = ["CNC_ROUTING", "PROFILE_FORMING", "METAL_CUTTING", "ELECTRICAL_ASSEMBLY", "MANUAL_ASSEMBLY", "PACKAGING", "VINYL_APPLICATION", "PAINTING", "QUALITY_CONTROL"];
    const ionEligible: string[] = [];
    for (const capability of capabilities) {
      if ((await eligible(t, capability)).find((item) => item.personId === ion)?.eligible) {
        ionEligible.push(capability);
      }
    }
    expect(ionEligible).toEqual(["CNC_ROUTING"]);
    expect((await eligible(t, "CNC_ROUTING")).filter((item) => item.eligible)).toHaveLength(2);

    const alpha = await readPlanTasks(t.client, ledger.id("plan:alpha")!);
    const profile = alpha.find((task) => task.processId === "FORM_ALUMINIUM_PROFILE")!;
    expect(profile.assignedProvider?.label).toBe("CNC Cant Litere");
    const refused = await t.client.request("POST", `/api/execution-tasks/${encodeURIComponent(profile.taskId)}/executor`, { personId: ion });
    expect(refused.status).toBe(422);
    expect(refused.body?.error).toBe("ineligible_executor");
  }, 120_000);

  it("records the precise configuration conflicts instead of faking them", async () => {
    const { t } = await preparedAtelier();
    // SK_ASSEMBLY is the only skill mapped to QUALITY_CONTROL: assembly workers are QC-eligible too.
    const quality = (await eligible(t, "QUALITY_CONTROL")).filter((item) => item.eligible).map((item) => item.displayName).sort();
    expect(quality).toEqual(["Maria Ansamblu Demo", "Paul Calitate Demo", "Vlad Ansamblu Demo"]);
    // The SYNTHETIC_TEST foundation maps no skill to welding.
    for (const capability of ["WELD_STEEL", "WELD_ALUMINIUM"]) {
      const diagnoses = await eligible(t, capability);
      expect(diagnoses.every((item) => !item.eligible && item.reason === "CAPABILITY_UNMAPPED")).toBe(true);
    }
  }, 120_000);

  it("never overwrites values changed after preparation", async () => {
    const { t, ledger } = await preparedAtelier();
    const alphaId = ledger.id("customer:alpha")!;
    const nordId = ledger.id("customer:nord")!;
    await t.client.request("PATCH", `/api/customers/${encodeURIComponent(alphaId)}`, { phone: "0700 000 999" });
    await t.client.request("PATCH", `/api/customers/${encodeURIComponent(nordId)}`, { email: null });
    const elena = ledger.id("person:electric")!;
    const skills = (await t.client.request("GET", "/api/people/skills")).body?.skills as Array<{ skillId: string; code: string }>;
    const electrician = skills.find((item) => item.code === "SK_ELECTRICIAN")!.skillId;
    const retired = await t.client.request("PATCH", `/api/people/${encodeURIComponent(elena)}/skills/${encodeURIComponent(electrician)}`, { status: "RETIRED" });
    expect(retired.ok).toBe(true);

    const again = await prepareDemoAtelier({ transport: t, ledger, secrets });
    expect(again.applied).toEqual([]);
    const customers = (await t.client.request("GET", "/api/customers")).body?.customers as Array<Record<string, unknown>>;
    expect(customers.find((item) => item.customerId === alphaId)?.phone).toBe("0700 000 999");
    expect(customers.find((item) => item.customerId === nordId)?.email).toBeNull();
    const electrical = await eligible(t, "ELECTRICAL_ASSEMBLY");
    expect(electrical.find((item) => item.personId === elena)?.eligible).toBe(false);
  }, 120_000);

  it("runs the C1 timeline through the operator routes without a single refusal", async () => {
    const { connect, t, ledger } = await preparedAtelier();
    const state = newCycleState(new Date());
    // Order-only validation: no waiting, so durations here are not representative.
    await runDemoCycle({
      transport: connect,
      ledger,
      secrets,
      state,
      save: () => {},
      sleep: async () => {},
      now: () => new Date(Date.parse(state.startedAt) + 10 * 60 * 60_000),
      steps: DEMO_CYCLE_C1,
    });
    const failed = Object.entries(state.steps).filter(([, result]) => !result.ok);
    expect(failed).toEqual([]);
    expect(state.status).toBe("COMPLETED");

    const alpha = await readPlanTasks(t.client, ledger.id("plan:alpha")!);
    expect(alpha.every((task) => task.status === "COMPLETED")).toBe(true);
    const nord = await readPlanTasks(t.client, ledger.id("plan:nord")!);
    expect(nord.some((task) => task.status === "IN_PROGRESS")).toBe(true);
    for (const plan of ["alpha", "nord", "meadow", "orbit"]) {
      for (const task of await readPlanTasks(t.client, ledger.id(`plan:${plan}`)!)) {
        expect((task.participants ?? []).filter((item) => item.active)).toEqual([]);
        expect(task.activeMachineRun ?? null).toBeNull();
      }
    }
    const quality = alpha.filter((task) => task.requiredCapabilityId === "QUALITY_CONTROL");
    const paul = ledger.id("person:quality");
    for (const task of quality) {
      const sessions = (task as unknown as { workSessions: Array<{ personId: string }> }).workSessions;
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((item) => item.personId === paul)).toBe(true);
    }
    const back = alpha.find((task) => task.seqLabel === "01")!;
    const backSessions = (back as unknown as { workSessions: Array<{ personId: string; endKind: string }> }).workSessions;
    expect(new Set(backSessions.map((item) => item.personId)).size).toBe(2);
    expect(backSessions.filter((item) => item.endKind === "LEFT").length).toBeGreaterThanOrEqual(2);
  }, 180_000);
});

describe("N-019 synthetic history H1 (simulated clock, in-process only)", () => {
  it("is a valid timeline: no person overlap, working days, no open session", () => {
    const events = buildHistoryEvents();
    expect(validateHistory(events, Date.parse("2026-10-23T00:00:00.000Z"))).toEqual([]);
  });

  it("is written by the engine with every command accepted and restores the real clock", async () => {
    const { connect, t, ledger } = await preparedAtelier();
    const events = buildHistoryEvents();
    const RealDate = Date;
    const clock = installSimulatedClock(events[0]!.at - 60_000);
    let result: { executed: number; skipped: number };
    try {
      result = await runHistory({ connect, ledger, secrets, clock, log: () => {}, events });
    } finally {
      clock.restore();
    }
    expect(Date).toBe(RealDate);
    expect(result.executed).toBe(events.length);
    const jobs = ((await t.client.request("GET", "/api/jobs")).body?.overview as { jobs: Array<{ planId?: string | null; stage?: string }> }).jobs;
    for (const key of ["alphaShowroom", "quartzEntrance", "helixLogo"]) {
      const planId = ledger.id(`history:H1:plan:${key}`)!;
      const tasks = await readPlanTasks(t.client, planId);
      expect(tasks.every((task) => task.status === "COMPLETED")).toBe(true);
      expect(jobs.find((job) => job.planId === planId)).toBeTruthy();
    }
    const pine = await readPlanTasks(t.client, ledger.id("history:H1:plan:pineRestaurant")!);
    expect(pine.some((task) => task.status === "IN_PROGRESS")).toBe(true);
    for (const job of HISTORY_JOBS.filter((item) => item.releaseAt)) {
      for (const task of await readPlanTasks(t.client, ledger.id(`history:H1:plan:${job.key}`)!)) {
        const sessions = (task as unknown as { workSessions: Array<{ endedAt: string | null; personId: string }> }).workSessions;
        expect(sessions.filter((item) => item.endedAt === null)).toEqual([]);
        if (task.requiredCapabilityId === "QUALITY_CONTROL") {
          expect(sessions.every((item) => item.personId === ledger.id("person:quality"))).toBe(true);
        }
      }
    }
    // A rerun skips every recorded event.
    const again = installSimulatedClock(events[0]!.at - 60_000);
    try {
      expect((await runHistory({ connect, ledger, secrets, clock: again, log: () => {}, events })).executed).toBe(0);
    } finally {
      again.restore();
    }
  }, 240_000);
});

describe("N-019 setup chronology", () => {
  it("refuses history when the registry was created after the first H1 event", async () => {
    const { root } = await preparedAtelier();
    expect(setupAfterHistory(root, buildHistoryEvents()[0]!.at)).not.toBeNull();
  }, 120_000);

  it("creates the registry as of onboarding, so customers and people precede H1", async () => {
    const root = trackTempDir();
    const events = buildHistoryEvents();
    const onboarding = Date.parse("2026-09-28T06:00:00.000Z");
    const provisionClock = installSimulatedClock(onboarding);
    let organizationId: string;
    try {
      organizationId = (await ensureOwnerReviewProvisioned({ cloudRoot: root, password: TEST_PASSWORD, env: { NODE_ENV: "development" } })).organizationId;
    } finally {
      provisionClock.restore();
    }
    const fixture = openCloudFixture(root, { env: { NODE_ENV: "development" } });
    fixtures.push(fixture);
    const connect = () => connectDemoAppTransport({ app: fixture.app, email: "owner@workos.test", password: TEST_PASSWORD, organizationId });
    const ledger = memoryDemoLedger();
    const setupClock = installSimulatedClock(onboarding + 60_000);
    try {
      expect((await prepareDemoAtelier({ transport: await connect(), ledger, secrets, phase: "setup" })).refusals).toEqual([]);
    } finally {
      setupClock.restore();
    }
    expect((await prepareDemoAtelier({ transport: await connect(), ledger, secrets })).refusals).toEqual([]);
    expect(setupAfterHistory(root, events[0]!.at)).toBeNull();
    const clock = installSimulatedClock(events[0]!.at - 60_000);
    try {
      await runHistory({ connect, ledger, secrets, clock, log: () => {}, events });
    } finally {
      clock.restore();
    }
    const t = await connect();
    const customers = (await t.client.request("GET", "/api/customers")).body?.customers as Array<{ customerId: string; createdAt: string }>;
    const requests = ((await t.client.request("GET", "/api/requests")).body?.overview as { requests: Array<{ customerId: string; createdAt: string }> }).requests;
    for (const request of requests) {
      const customer = customers.find((item) => item.customerId === request.customerId)!;
      expect(Date.parse(customer.createdAt)).toBeLessThan(Date.parse(request.createdAt));
    }
    const people = ((await t.client.request("GET", "/api/people")).body?.registry as { people: Array<{ createdAt: string }> }).people;
    expect(people.every((person) => Date.parse(person.createdAt) < events[0]!.at)).toBe(true);
  }, 240_000);
});
