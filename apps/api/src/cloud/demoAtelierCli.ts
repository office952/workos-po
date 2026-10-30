import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CYCLE_C1,
  DEMO_CYCLE_ID,
  closeOutDemoCycle,
  newCycleState,
  runDemoCycle,
  type DemoCycleState,
} from "./demoAtelierCycle.js";
import { connectDemoFetchTransport, type DemoTransport } from "./demoAtelierHttp.js";
import {
  DEMO_ATELIER_CYCLE_STATE,
  DEMO_ATELIER_FIXTURE_KIND,
  DEMO_ATELIER_MARKER,
  DEMO_CUSTOMERS,
  DEMO_MACHINES,
  DEMO_PEOPLE,
} from "./demoAtelierIdentity.js";
import { fileDemoLedger, type DemoLedger } from "./demoAtelierLedger.js";
import { prepareDemoAtelier, readPlanTasks, type DemoPlanKey } from "./demoAtelierSeed.js";
import { ensureOwnerReviewProvisioned, readOwnerReviewIdentity } from "./ownerReviewReset.js";
import { createApp } from "../app.js";
import { acquireCloudRuntimeLease, releaseCloudRuntimeLease, type CloudRuntimeLease } from "../ops/runtimeLease.js";
import {
  DEMO_HISTORY_ID,
  HISTORY_JOBS,
  assertHistoryNotApplied,
  buildHistoryEvents,
  demoPlaneSqlitePath,
  installSimulatedClock,
  readHistoryCutoff,
  readSetupWindow,
  setupAfterHistory,
  runHistory,
  validateHistory,
} from "./demoAtelierHistory.js";
import { connectDemoAppTransport } from "./demoAtelierHttp.js";
import {
  DEMO_CHRONOLOGY_ID,
  DEMO_ONBOARDING_REFERENCE,
  applySetupChronology,
  planSetupChronology,
} from "./demoAtelierChronology.js";
import { openProvisionedControlPlane } from "./provision.js";
import { createRuntimeRegistry } from "./runtimeRegistry.js";
import { createDemoBundle, restoreDemoEnvironment } from "./demoAtelierRecovery.js";
import {
  defaultDemoKeyRoot,
  ensureDemoKey,
  generateDemoSecrets,
  loadDemoSecrets,
  readDemoSecretsFile,
  secretsAccess,
  writeNewDemoSecrets,
} from "./demoAtelierSecrets.js";

const CAPABILITIES = [
  "CNC_ROUTING",
  "PROFILE_FORMING",
  "METAL_CUTTING",
  "WELD_STEEL",
  "WELD_ALUMINIUM",
  "ELECTRICAL_ASSEMBLY",
  "MANUAL_ASSEMBLY",
  "PACKAGING",
  "VINYL_APPLICATION",
  "PAINTING",
  "QUALITY_CONTROL",
] as const;

const MARKER_BODY = [
  `FIXTURE_KIND=${DEMO_ATELIER_FIXTURE_KIND}`,
  "SYNTHETIC_DEMO_DATA=YES",
  "REAL_DATA=NO",
  "NOTION_RECORD=N-019",
  "",
].join("\n");

function readArg(argv: readonly string[], name: string, fallback?: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : fallback;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function fail(code: string, detail?: string): never {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

function requireDemoRoot(root: string): void {
  if (!existsSync(join(root, DEMO_ATELIER_MARKER))) {
    fail("demo_root_unmarked", `${root} is not an N-019 demo atelier root. Run init on an empty directory.`);
  }
}

async function connect(root: string, baseUrl: string): Promise<DemoTransport> {
  const identity = readOwnerReviewIdentity(root);
  if (!identity) {
    fail("demo_identity_missing", root);
  }
  return connectDemoFetchTransport({
    baseUrl,
    email: identity.email,
    password: identity.password,
    organizationId: identity.organizationId,
  });
}

function cyclePath(root: string): string {
  return join(root, DEMO_ATELIER_CYCLE_STATE);
}

function readCycle(root: string): (DemoCycleState & { runnerPid?: number; heartbeatAt?: string }) | null {
  return existsSync(cyclePath(root)) ? JSON.parse(readFileSync(cyclePath(root), "utf8")) : null;
}

function writeCycle(root: string, state: DemoCycleState): void {
  const temp = `${cyclePath(root)}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ ...state, runnerPid: process.pid, heartbeatAt: new Date().toISOString() }, null, 2)}\n`);
  renameSync(temp, cyclePath(root));
}

function processAlive(pid: number | undefined): boolean {
  if (!pid || pid === process.pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readAsOf(argv: readonly string[]): number | null {
  const index = argv.indexOf("--as-of");
  if (index < 0) return null;
  const value = Date.parse(argv[index + 1] ?? "");
  if (!Number.isFinite(value) || value >= Date.now()) {
    fail("demo_as_of_invalid", "--as-of needs an ISO time in the past");
  }
  return value;
}

/**
 * init and the registry setup can run "as of" an onboarding moment, so the
 * organization, people, skills, resources and customers are created by the
 * engine before any synthetic history. The simulated clock exists only in this
 * process and is restored afterwards.
 */
async function init(root: string, asOf: number | null): Promise<void> {
  if (existsSync(root) && readdirSync(root).length > 0) {
    fail("demo_init_refused", `${root} is not empty. init never reuses, resets or overwrites an existing root.`);
  }
  const password = randomBytes(18).toString("base64url");
  const clock = asOf === null ? null : installSimulatedClock(asOf);
  let provisioned: Awaited<ReturnType<typeof ensureOwnerReviewProvisioned>>;
  try {
    provisioned = await ensureOwnerReviewProvisioned({
      cloudRoot: root,
      password,
      env: { ...process.env, NODE_ENV: "development" },
    });
  } finally {
    clock?.restore();
  }
  writeFileSync(join(root, DEMO_ATELIER_MARKER), MARKER_BODY);
  writeNewDemoSecrets(root, generateDemoSecrets());
  console.log("DEMO_ATELIER_INITIALIZED = YES");
  console.log(`root: ${provisioned.cloudRoot}`);
  console.log(`organizationId: ${provisioned.organizationId}`);
  console.log("credentials: generated locally; stored only in .reference-identity.json and demo-atelier-secrets.json inside the root");
}

type EligibilityBody = {
  eligiblePeople?: Array<{ personId: string; displayName: string }>;
  diagnoses?: Array<{ personId: string; displayName: string; eligible: boolean; reason: string | null }>;
};

async function eligibilityMatrix(t: DemoTransport, ledger: DemoLedger) {
  const matrix: Record<string, Record<string, string>> = {};
  for (const person of DEMO_PEOPLE) {
    matrix[person.displayName] = {};
  }
  for (const capability of CAPABILITIES) {
    const body = (await t.client.request("GET", `/api/people/eligibility?capabilityId=${capability}`)).body as EligibilityBody;
    for (const person of DEMO_PEOPLE) {
      const id = ledger.id(`person:${person.key}`);
      const diagnosis = body.diagnoses?.find((item) => item.personId === id);
      matrix[person.displayName]![capability] = diagnosis ? (diagnosis.eligible ? "DA" : diagnosis.reason ?? "NU") : "ABSENT";
    }
  }
  return matrix;
}

/**
 * Chronology: customers before their requests, people before their first
 * session, through the API; machines before their first run and skill
 * assignments before the person's first session, read-only from the plane
 * (the API does not expose those creation times); no session in the future.
 */
async function chronologyChecks(root: string, t: DemoTransport): Promise<Array<{ name: string; pass: boolean; detail: string }>> {
  const customers = ((await t.client.request("GET", "/api/customers")).body?.customers as Array<{ customerId: string; displayName: string; createdAt: string }>) ?? [];
  const requests = ((await t.client.request("GET", "/api/requests")).body?.overview as { requests?: Array<{ customerId: string; title: string; createdAt: string }> })?.requests ?? [];
  const people = ((await t.client.request("GET", "/api/people")).body?.registry as { people?: Array<{ personId: string; displayName: string; createdAt: string }> })?.people ?? [];
  const jobs = ((await t.client.request("GET", "/api/jobs")).body?.overview as { jobs?: Array<{ planId?: string | null }> })?.jobs ?? [];
  const firstSession = new Map<string, number>();
  const firstRun = new Map<string, number>();
  let future = 0;
  for (const job of jobs) {
    if (!job.planId) continue;
    for (const task of await readPlanTasks(t.client, job.planId)) {
      const extra = task as unknown as { workSessions?: Array<{ personId: string; startedAt: string; endedAt: string | null }>; machineRuns?: Array<{ machineProviderId: string; startedAt: string }> };
      for (const session of extra.workSessions ?? []) {
        const at = Date.parse(session.startedAt);
        firstSession.set(session.personId, Math.min(firstSession.get(session.personId) ?? Infinity, at));
        if (at > Date.now() || (session.endedAt && Date.parse(session.endedAt) > Date.now())) future += 1;
      }
      for (const run of extra.machineRuns ?? []) {
        firstRun.set(run.machineProviderId, Math.min(firstRun.get(run.machineProviderId) ?? Infinity, Date.parse(run.startedAt)));
      }
    }
  }
  const customerLate = customers.filter((customer) => requests.some((request) => request.customerId === customer.customerId && Date.parse(request.createdAt) < Date.parse(customer.createdAt)));
  const personLate = people.filter((person) => (firstSession.get(person.personId) ?? Infinity) < Date.parse(person.createdAt));
  const db = new Database(demoPlaneSqlitePath(root), { readonly: true, fileMustExist: true });
  let machineLate: string[] = [];
  let assignmentLate: string[] = [];
  let organizationAfterSetup = false;
  try {
    machineLate = (db.prepare("SELECT machine_id, label, created_at FROM organization_machines").all() as Array<{ machine_id: string; label: string; created_at: string }>)
      .filter((row) => (firstRun.get(row.machine_id) ?? Infinity) < Date.parse(row.created_at))
      .map((row) => row.label);
    assignmentLate = (db.prepare("SELECT person_id, skill_id, assigned_at FROM person_skill_assignments").all() as Array<{ person_id: string; skill_id: string; assigned_at: string }>)
      .filter((row) => (firstSession.get(row.person_id) ?? Infinity) < Date.parse(row.assigned_at))
      .map((row) => `${row.person_id}:${row.skill_id}`);
    const bound = (db.prepare("SELECT bound_at FROM operational_plane_identity").get() as { bound_at: string }).bound_at;
    organizationAfterSetup = [...customers.map((item) => item.createdAt), ...people.map((item) => item.createdAt)].some((value) => Date.parse(value) < Date.parse(bound));
  } finally {
    db.close();
  }
  return [
    { name: "chronology_customers_before_requests", pass: customerLate.length === 0, detail: customerLate.length ? customerLate.map((item) => item.displayName).join(", ") : `${customers.length} clienți` },
    { name: "chronology_people_before_sessions", pass: personLate.length === 0, detail: personLate.length ? personLate.map((item) => item.displayName).join(", ") : `${people.length} persoane` },
    { name: "chronology_machines_before_runs", pass: machineLate.length === 0, detail: machineLate.length ? machineLate.join(", ") : "toate utilajele" },
    { name: "chronology_skills_before_sessions", pass: assignmentLate.length === 0, detail: assignmentLate.length ? assignmentLate.join(", ") : "toate atribuirile" },
    { name: "chronology_organization_first", pass: !organizationAfterSetup, detail: "planul organizației precede persoanele și clienții" },
    { name: "chronology_no_future_sessions", pass: future === 0, detail: `${future} sesiuni în viitor` },
  ];
}

async function verify(root: string, baseUrl: string): Promise<boolean> {
  const t = await connect(root, baseUrl);
  const ledger = fileDemoLedger(root);
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  const people = ((await t.client.request("GET", "/api/people")).body?.people as Array<{ personId: string; displayName: string; status?: string }>) ?? [];
  const active = people.filter((item) => item.status !== "RETIRED");
  checks.push({ name: "exact_10_workers", pass: active.length === 10, detail: `${active.length} persoane active` });
  const matrix = await eligibilityMatrix(t, ledger);
  const eligibleFor = (capability: string) =>
    Object.entries(matrix).filter(([, row]) => row[capability] === "DA").map(([name]) => name);
  const cnc1 = DEMO_PEOPLE.find((item) => item.key === "cnc1")!.displayName;
  const cnc1Caps = Object.entries(matrix[cnc1] ?? {}).filter(([, value]) => value === "DA").map(([cap]) => cap);
  checks.push({ name: "cnc1_only_cnc_routing", pass: cnc1Caps.length === 1 && cnc1Caps[0] === "CNC_ROUTING", detail: cnc1Caps.join(",") });
  checks.push({ name: "at_least_two_cnc", pass: eligibleFor("CNC_ROUTING").length >= 2, detail: eligibleFor("CNC_ROUTING").join(", ") });

  // Server refusal: the CNC-only operator as executor of a profile-forming task.
  const alphaPlan = ledger.id("plan:alpha");
  const cnc1Id = ledger.id("person:cnc1");
  if (alphaPlan && cnc1Id) {
    const profile = (await readPlanTasks(t.client, alphaPlan)).find((task) => task.processId === "FORM_ALUMINIUM_PROFILE");
    if (profile && profile.status === "PLANNED") {
      const before = profile.assignedExecutor?.id ?? null;
      const refused = await t.client.request("POST", `/api/execution-tasks/${encodeURIComponent(profile.taskId)}/executor`, { personId: cnc1Id });
      if (refused.ok && before) {
        await t.client.request("POST", `/api/execution-tasks/${encodeURIComponent(profile.taskId)}/executor`, { personId: before });
      }
      checks.push({ name: "cnc1_refused_on_profile_forming", pass: !refused.ok && refused.body?.error === "ineligible_executor", detail: `${refused.status} ${refused.body?.error ?? "accepted"}` });
    } else {
      const listed = profile?.eligibleExecutors?.map((item) => item.id) ?? [];
      checks.push({ name: "cnc1_refused_on_profile_forming", pass: !listed.includes(cnc1Id), detail: "operația a pornit deja; verificat prin lista de executanți eligibili a serverului" });
    }
  }
  const weld = [...eligibleFor("WELD_STEEL"), ...eligibleFor("WELD_ALUMINIUM")];
  checks.push({ name: "welding_covered_by_server", pass: weld.length >= 2, detail: weld.length ? weld.join(", ") : "CONFLICT: WELD_* nemapate în fundația SYNTHETIC_TEST (CAPABILITY_UNMAPPED)" });
  const qc = eligibleFor("QUALITY_CONTROL");
  checks.push({ name: "exactly_one_quality_person", pass: qc.length === 1, detail: qc.length === 1 ? qc[0]! : `CONFLICT: ${qc.length} eligibili (${qc.join(", ")}) — SK_ASSEMBLY acordă și QUALITY_CONTROL` });
  const admin = (await t.client.request("GET", "/api/workcenters")).body as { machines?: Array<{ label: string; lifecycle: string; capabilityIds: string[] }> };
  const cant = admin.machines?.find((item) => item.label === "CNC Cant Litere");
  checks.push({ name: "profile_forming_machine", pass: Boolean(cant && cant.lifecycle === "ACTIVE" && cant.capabilityIds.includes("PROFILE_FORMING")), detail: cant ? `${cant.label} ${cant.lifecycle} ${cant.capabilityIds.join(",")}` : "absent" });
  if (alphaPlan) {
    const profile = (await readPlanTasks(t.client, alphaPlan)).find((task) => task.processId === "FORM_ALUMINIUM_PROFILE");
    checks.push({ name: "profile_forming_allocated", pass: profile?.assignedProvider?.label === "CNC Cant Litere", detail: profile?.assignedProvider?.label ?? "nealocat" });
  }
  for (const check of await chronologyChecks(root, t)) {
    checks.push(check);
  }
  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name} — ${check.detail}`);
  }
  console.log("ELIGIBILITY_MATRIX (server):");
  console.log(JSON.stringify(matrix, null, 2));
  return checks.every((check) => check.pass);
}

async function manifest(root: string, baseUrl: string): Promise<void> {
  const t = await connect(root, baseUrl);
  const ledger = fileDemoLedger(root);
  const get = async (path: string) => (await t.client.request("GET", path)).body ?? {};
  const customers = ((await get("/api/customers")).customers as Array<Record<string, unknown>>) ?? [];
  const jobs = (((await get("/api/jobs")).overview as { jobs?: Array<Record<string, unknown>> })?.jobs) ?? [];
  const quotes = (((await get("/api/quotes")).overview as { quotes?: Array<Record<string, unknown>> })?.quotes) ?? [];
  const requests = (((await get("/api/requests")).overview as { requests?: Array<Record<string, unknown>> })?.requests) ?? [];
  const admin = await get("/api/workcenters");
  const plans: Record<string, unknown> = {};
  for (const plan of ["alpha", "nord", "meadow", "orbit"] as DemoPlanKey[]) {
    const planId = ledger.id(`plan:${plan}`);
    if (!planId) continue;
    const record = await get(`/api/jobs/${encodeURIComponent(String(jobs.find((job) => job.planId === planId)?.jobId ?? ""))}/record`);
    const hours = (record.record as { hours?: Record<string, unknown> } | undefined)?.hours;
    plans[plan] = {
      planId,
      tasks: (await readPlanTasks(t.client, planId)).map((task) => ({
        seq: task.seqLabel,
        process: task.processLabel,
        status: task.status,
        provider: task.assignedProvider?.label ?? null,
        executor: task.assignedExecutor?.label ?? null,
      })),
      hours: hours
        ? {
            beginningToEnd: hours.elapsedLabel,
            activeTime: hours.activeTimeLabel,
            laborSum: hours.totalLabel,
            machineTime: hours.machineTimeLabel,
            coverage: hours.coverageLabel,
          }
        : null,
    };
  }
  const document = {
    fixtureKind: DEMO_ATELIER_FIXTURE_KIND,
    generatedAt: new Date().toISOString(),
    url: baseUrl,
    root,
    secrets: "none (credentials stay in .reference-identity.json inside the root)",
    people: DEMO_PEOPLE.map((person) => ({ ordinal: person.ordinal, name: person.displayName, role: person.roleLabel, skills: person.skillCodes, recoveredFrom: person.recoveredFrom, personId: ledger.id(`person:${person.key}`) ?? null })),
    eligibility: await eligibilityMatrix(t, ledger),
    workcenters: (admin.workcenters as Array<Record<string, unknown>>)?.map((item) => ({ label: item.label, lifecycle: item.lifecycle, capabilityIds: item.capabilityIds })),
    machines: (admin.machines as Array<Record<string, unknown>>)?.map((item) => ({ label: item.label, lifecycle: item.lifecycle, capabilityIds: item.capabilityIds })),
    expectedMachines: DEMO_MACHINES.map((item) => item.label),
    customers: customers.map((item) => {
      const def = DEMO_CUSTOMERS.find((entry) => entry.displayName === item.displayName);
      const missing = ["cui", "contactName", "phone", "email", "address", "city"].filter((field) => !item[field]);
      return { name: item.displayName, customerId: item.customerId, complete: missing.length === 0, missing, intentionallyIncomplete: def ? Object.values(def.profile).some((value) => value === null) : null };
    }),
    requests: requests.map((item) => ({ title: item.title, customer: item.customerDisplayName ?? item.customerId, status: item.statusLabel ?? item.status })),
    quotes: quotes.map((item) => ({ quoteSnapshotId: item.quoteSnapshotId, customer: item.customerDisplayName, product: item.productLabel, accepted: Boolean(item.orderSnapshotId) })),
    jobs: jobs.map((item) => ({ jobId: item.jobId, customer: item.customerDisplayName, product: item.productLabel, stage: item.stageLabel, progress: item.progressLabel, href: item.href })),
    plans,
    cycle: readCycle(root),
  };
  const path = join(root, "demo-atelier-manifest.json");
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(path);
}

async function cycle(root: string, baseUrl: string, argv: readonly string[]): Promise<void> {
  const existing = readCycle(root);
  if (existing && existing.status !== "RUNNING") {
    fail("demo_cycle_already_finished", `${existing.cycleId} ${existing.status}. A new cycle needs a new versioned definition.`);
  }
  if (existing && processAlive(existing.runnerPid)) {
    fail("demo_cycle_runner_active", `pid ${existing.runnerPid}`);
  }
  const ledger = fileDemoLedger(root);
  const staleAfterMinutes = Number(readArg(argv, "stale-after-minutes", "60"));
  let state = existing ?? newCycleState(new Date());
  if (existing && Date.now() > Date.parse(existing.plannedEndAt) + staleAfterMinutes * 60_000) {
    console.log("CYCLE_STALE = YES — closing out instead of resuming (no night-long sessions).");
    await stop(root, baseUrl);
    return;
  }
  writeCycle(root, state);
  console.log(`CYCLE ${DEMO_CYCLE_ID} ${existing ? "RESUMED" : "STARTED"} at ${state.startedAt}; planned end ${state.plannedEndAt}`);
  state = await runDemoCycle({
    transport: () => connect(root, baseUrl),
    ledger,
    secrets: loadDemoSecrets(root),
    state,
    save: (next) => writeCycle(root, next),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: () => new Date(),
    log: (line) => console.log(`${new Date().toISOString()} ${line}`),
    steps: DEMO_CYCLE_C1,
  });
  const failed = Object.entries(state.steps).filter(([, result]) => !result.ok);
  console.log(`CYCLE ${state.cycleId} ${state.status}; steps=${Object.keys(state.steps).length} failed=${failed.length}`);
}

async function stop(root: string, baseUrl: string): Promise<void> {
  const state = readCycle(root);
  if (state && processAlive(state.runnerPid)) {
    try {
      process.kill(state.runnerPid!);
    } catch {
      // Runner already exited.
    }
  }
  const ledger = fileDemoLedger(root);
  const result = await closeOutDemoCycle({
    transport: await connect(root, baseUrl),
    ledger,
    secrets: loadDemoSecrets(root),
    people: DEMO_PEOPLE.map((person) => person.key),
  });
  if (state) {
    writeCycle(root, {
      ...state,
      status: state.status === "COMPLETED" ? "COMPLETED" : "STOPPED",
      closeout: { at: new Date().toISOString(), closedSessions: result.closedSessions, stoppedRuns: result.stoppedRuns },
    });
  }
  console.log(`closed sessions: ${result.closedSessions.join(", ") || "none"}`);
  console.log(`stopped machine runs: ${result.stoppedRuns.join(", ") || "none"}`);
  if (result.errors.length) {
    console.log(`errors: ${result.errors.join(", ")}`);
  }
}

type RecordHours = {
  asOf: string;
  milliseconds: number | null;
  activeSessionCount: number;
  coverageLabel: string;
  startedAt: string | null;
  completedAt: string | null;
  elapsedLabel: string;
  activeTimeLabel: string;
  totalLabel: string;
  machineTimeLabel: string;
  machineActive: boolean;
  people: Array<{ label: string; milliseconds: number; timeLabel: string; active: boolean }>;
};

type SessionRow = { sessionId: string; personId: string; personLabel: string; startedAt: string; endedAt: string | null; endKind: string | null };

const minutes = (ms: number): number => Math.round((ms / 60_000) * 10) / 10;

function unionMs(intervals: Array<{ start: number; end: number }>): number {
  let total = 0;
  let reach = -Infinity;
  for (const item of [...intervals].sort((left, right) => left.start - right.start)) {
    total += Math.max(0, item.end - Math.max(item.start, reach));
    reach = Math.max(reach, item.end);
  }
  return total;
}

/**
 * C1 interval report, read only from the server: commands vs schedule,
 * measured intervals per person and operation, overlaps, re-entries, the
 * four time measures, and any session or machine run still open.
 */
async function report(root: string, baseUrl: string): Promise<void> {
  const state = readCycle(root);
  if (!state) {
    fail("demo_cycle_not_started");
  }
  const t = await connect(root, baseUrl);
  const ledger = fileDemoLedger(root);
  const startedAt = Date.parse(state.startedAt);
  const DELAY_FLAG_MS = 120_000;
  const steps = DEMO_CYCLE_C1.map((step) => {
    const result = state.steps[step.id];
    const due = startedAt + step.atMinute * 60_000;
    const delayMs = result ? Date.parse(result.doneAt) - due : null;
    return {
      id: step.id,
      atMinute: step.atMinute,
      plan: step.plan,
      seq: step.seq,
      who: step.who,
      action: step.action,
      dueAt: new Date(due).toISOString(),
      doneAt: result?.doneAt ?? null,
      ok: result?.ok ?? null,
      status: result?.status ?? null,
      error: result?.error ?? null,
      delaySeconds: delayMs === null ? null : Math.round(delayMs / 1000),
      delayed: delayMs !== null && delayMs > DELAY_FLAG_MS,
    };
  });
  const jobs = ((await t.client.request("GET", "/api/jobs")).body?.overview as { jobs?: Array<{ jobId: string; planId?: string | null; productLabel?: string; customerDisplayName?: string; stageLabel?: string }> })?.jobs ?? [];
  const plans: Record<string, unknown> = {};
  const openSessions: string[] = [];
  const openRuns: string[] = [];
  // C1 jobs (live API) and H1 jobs (synthetic history, simulated clock).
  const reportPlans: Array<[string, string | undefined]> = [
    ...(["alpha", "nord", "meadow", "orbit"] as DemoPlanKey[]).map((key): [string, string | undefined] => [key, ledger.id(`plan:${key}`)]),
    ...HISTORY_JOBS.map((job): [string, string | undefined] => [`H1:${job.key}`, ledger.id(`history:H1:plan:${job.key}`)]),
  ];
  for (const [plan, planId] of reportPlans) {
    const job = jobs.find((item) => item.planId === planId);
    if (!planId || !job) continue;
    const record = (await t.client.request("GET", `/api/jobs/${encodeURIComponent(job.jobId)}/record`)).body?.record as { hours?: RecordHours } | undefined;
    const hours = record?.hours;
    const tasks = await readPlanTasks(t.client, planId);
    const asOf = hours?.asOf ? Date.parse(hours.asOf) : Date.now();
    const intervals: Array<{ start: number; end: number }> = [];
    const taskRows = tasks.map((task) => {
      const sessions = ((task as unknown as { workSessions?: SessionRow[] }).workSessions ?? []).map((session) => {
        const start = Date.parse(session.startedAt);
        const end = session.endedAt ? Date.parse(session.endedAt) : asOf;
        intervals.push({ start, end });
        if (!session.endedAt) openSessions.push(`${plan} ${task.seqLabel} ${task.processLabel} — ${session.personLabel}`);
        return { person: session.personLabel, startedAt: session.startedAt, endedAt: session.endedAt, endKind: session.endKind, minutes: minutes(end - start) };
      });
      const runs = ((task as unknown as { machineRuns?: Array<{ machineProviderLabel: string; startedAt: string; completedAt: string | null }> }).machineRuns ?? []).map((run) => {
        if (!run.completedAt) openRuns.push(`${plan} ${task.seqLabel} ${run.machineProviderLabel}`);
        return { machine: run.machineProviderLabel, startedAt: run.startedAt, completedAt: run.completedAt, minutes: run.completedAt ? minutes(Date.parse(run.completedAt) - Date.parse(run.startedAt)) : null };
      });
      const people = [...new Set(sessions.map((item) => item.person))];
      const simultaneous = sessions.some((left, index) =>
        sessions.some((right, other) => other !== index && left.person !== right.person && Date.parse(left.startedAt) < Date.parse(right.endedAt ?? new Date(asOf).toISOString()) && Date.parse(right.startedAt) < Date.parse(left.endedAt ?? new Date(asOf).toISOString())),
      );
      const reentries = people.filter((person) => sessions.filter((item) => item.person === person).length > 1);
      return {
        seq: task.seqLabel,
        process: task.processLabel,
        status: task.status,
        plannedEffortMinutes: task.plannedEffortMinutes ?? null,
        sessions,
        machineRuns: runs,
        simultaneousPeople: simultaneous,
        reentries,
        laborMinutes: minutes(sessions.reduce((sum, item) => sum + item.minutes * 60_000, 0)),
      };
    });
    const starts = tasks.map((task) => (task as unknown as { startedAt?: string | null }).startedAt).filter(Boolean).map((value) => Date.parse(value!));
    plans[plan] = {
      job: `${job.customerDisplayName} · ${job.productLabel}`,
      stage: job.stageLabel,
      server: hours
        ? {
            beginningToEnd: hours.elapsedLabel,
            activeTime: hours.activeTimeLabel,
            laborSum: hours.totalLabel,
            machineTime: hours.machineTimeLabel,
            coverage: hours.coverageLabel,
            people: hours.people.map((person) => `${person.label}: ${person.timeLabel}`),
          }
        : null,
      recomputedMinutes: {
        calendar: starts.length ? minutes((hours?.completedAt ? Date.parse(hours.completedAt) : asOf) - Math.min(...starts)) : null,
        activeUnion: minutes(unionMs(intervals)),
        laborSum: minutes(intervals.reduce((sum, item) => sum + (item.end - item.start), 0)),
      },
      tasks: taskRows.filter((row) => row.sessions.length > 0 || row.machineRuns.length > 0),
    };
  }
  const document = {
    cycle: { id: state.cycleId, status: state.status, startedAt: state.startedAt, plannedEndAt: state.plannedEndAt, closeout: state.closeout ?? null },
    commands: {
      defined: DEMO_CYCLE_C1.length,
      executed: steps.filter((step) => step.doneAt).length,
      accepted: steps.filter((step) => step.ok).length,
      refused: steps.filter((step) => step.ok === false).map((step) => `${step.id}: ${step.status} ${step.error}`),
      delayedOverTwoMinutes: steps.filter((step) => step.delayed).map((step) => `${step.id}: +${step.delaySeconds}s`),
      maxDelaySeconds: Math.max(0, ...steps.map((step) => step.delaySeconds ?? 0)),
    },
    openSessions,
    openMachineRuns: openRuns,
    plans,
    steps,
  };
  const path = join(root, `demo-atelier-${state.cycleId.toLowerCase()}-report.json`);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(JSON.stringify({ ...document, steps: undefined, plans: Object.fromEntries(Object.entries(plans).map(([key, value]) => [key, { ...(value as Record<string, unknown>), tasks: undefined }])) }, null, 2));
  console.log(path);
}

/**
 * Applies synthetic history H1 with the engine in-process and a simulated
 * clock confined to this process. Holds the runtime lease, so it refuses to
 * run while any API serves the root. Applied once; a rerun is refused.
 */
async function history(root: string): Promise<void> {
  const ledger = fileDemoLedger(root);
  try {
    assertHistoryNotApplied(ledger);
  } catch {
    fail("demo_history_already_applied", `${DEMO_HISTORY_ID} is recorded in the ledger; it is never re-applied.`);
  }
  const identity = readOwnerReviewIdentity(root);
  if (!identity) {
    fail("demo_identity_missing", root);
  }
  const events = buildHistoryEvents();
  const cutoff = readHistoryCutoff(root);
  if (!ledger.has(`history:${DEMO_HISTORY_ID}:setup-window`)) {
    // Recorded before H1 adds older requests, so the setup window stays identifiable.
    ledger.mark(`history:${DEMO_HISTORY_ID}:setup-window`, JSON.stringify(readSetupWindow(root)));
  }
  const problems = validateHistory(events, cutoff);
  if (problems.length > 0) {
    fail("demo_history_invalid", problems.join(", "));
  }
  const lateSetup = setupAfterHistory(root, events[0]!.at);
  if (lateSetup) {
    fail(
      "demo_history_setup_after_history",
      `registry created ${lateSetup}, after the first H1 event ${new Date(events[0]!.at).toISOString()}. Initialize with init --as-of and setup --as-of before H1.`,
    );
  }
  let lease: CloudRuntimeLease;
  try {
    lease = acquireCloudRuntimeLease(root, "api");
  } catch {
    fail("demo_history_runtime_active", "Stop the demo API first (pnpm demo:stop).");
  }
  const clock = installSimulatedClock(events[0]!.at - 60_000);
  const controlPlane = openProvisionedControlPlane(root);
  const registry = createRuntimeRegistry();
  let result: { executed: number; skipped: number } | null = null;
  try {
    const app = createApp({ cloud: { controlPlane, registry }, env: { NODE_ENV: "development" } });
    result = await runHistory({
      connect: () =>
        connectDemoAppTransport({
          app,
          email: identity.email,
          password: identity.password,
          organizationId: identity.organizationId,
        }),
      ledger,
      secrets: loadDemoSecrets(root),
      clock,
      log: (line) => console.log(line),
      events,
    });
  } finally {
    clock.restore();
    registry.closeAll();
    controlPlane.close();
    releaseCloudRuntimeLease(root, lease);
  }
  ledger.mark(`history:${DEMO_HISTORY_ID}`, `synthetic; simulated clock; executed=${result.executed} skipped=${result.skipped}`);
  console.log(`DEMO_HISTORY_${DEMO_HISTORY_ID} = APPLIED (synthetic, simulated clock in-process); events executed=${result.executed} skipped=${result.skipped}`);
}

/** Registry-only preparation in-process, as of the onboarding moment (API must be down). */
async function setupAsOf(root: string, asOf: number): Promise<void> {
  const identity = readOwnerReviewIdentity(root);
  if (!identity) {
    fail("demo_identity_missing", root);
  }
  let lease: CloudRuntimeLease;
  try {
    lease = acquireCloudRuntimeLease(root, "api");
  } catch {
    fail("demo_setup_runtime_active", "Stop the demo API first (pnpm demo:stop).");
  }
  const ledger = fileDemoLedger(root);
  const clock = installSimulatedClock(asOf);
  const controlPlane = openProvisionedControlPlane(root);
  const registry = createRuntimeRegistry();
  try {
    const app = createApp({ cloud: { controlPlane, registry }, env: { NODE_ENV: "development" } });
    const transport = await connectDemoAppTransport({ app, email: identity.email, password: identity.password, organizationId: identity.organizationId });
    const report = await prepareDemoAtelier({ transport, ledger, secrets: loadDemoSecrets(root), phase: "setup", log: (line) => console.log(line) });
    console.log(`DEMO_SETUP_AS_OF = ${new Date(asOf).toISOString()} refusals=${report.refusals.length}`);
  } finally {
    clock.restore();
    registry.closeAll();
    controlPlane.close();
    releaseCloudRuntimeLease(root, lease);
  }
}

function recordedSetupWindow(ledger: DemoLedger): { from: string; to: string } {
  const detail = ledger.snapshot().applied[`history:${DEMO_HISTORY_ID}:setup-window`]?.detail;
  if (!detail) {
    fail("demo_chronology_window_missing", "history:H1:setup-window is not recorded in the ledger.");
  }
  return JSON.parse(detail) as { from: string; to: string };
}

function chronologyPlan(root: string): void {
  const plan = planSetupChronology(root, recordedSetupWindow(fileDemoLedger(root)));
  console.log(JSON.stringify(plan, null, 2));
}

/** Setup chronology correction: allowlisted creation metadata only, one transaction, API down. */
function chronologyApply(root: string): void {
  const ledger = fileDemoLedger(root);
  if (ledger.has(`chronology:${DEMO_CHRONOLOGY_ID}`)) {
    fail("demo_chronology_already_applied", DEMO_CHRONOLOGY_ID);
  }
  const plan = planSetupChronology(root, recordedSetupWindow(ledger));
  if (plan.collisions.length > 0) {
    fail("demo_chronology_collisions", plan.collisions.join(", "));
  }
  let lease: CloudRuntimeLease;
  try {
    lease = acquireCloudRuntimeLease(root, "api");
  } catch {
    fail("demo_chronology_runtime_active", "Stop the demo API first (pnpm demo:stop).");
  }
  let changed: Record<string, number>;
  try {
    changed = applySetupChronology(root, plan);
  } finally {
    releaseCloudRuntimeLease(root, lease);
  }
  ledger.mark(`chronology:${DEMO_CHRONOLOGY_ID}`, JSON.stringify({ anchor: plan.anchor, reference: DEMO_ONBOARDING_REFERENCE, deltaMs: plan.deltaMs, window: plan.window, changed }));
  console.log(JSON.stringify({ applied: DEMO_CHRONOLOGY_ID, anchor: plan.anchor, reference: DEMO_ONBOARDING_REFERENCE, changed }, null, 2));
}

/**
 * One-time move of an existing root off the earlier shared demo PIN: generates
 * per-person PINs, sets each through the owner route, then keeps them in the
 * root. Refuses when the root already has local credentials.
 */
async function credentialsInit(root: string, baseUrl: string): Promise<void> {
  if (readDemoSecretsFile(root)) {
    fail("demo_credentials_exist", "Local credentials already exist; they are never regenerated.");
  }
  const ledger = fileDemoLedger(root);
  const t = await connect(root, baseUrl);
  const generated = generateDemoSecrets();
  const secrets = secretsAccess(generated);
  for (const person of DEMO_PEOPLE) {
    const personId = ledger.id(`person:${person.key}`);
    if (!personId) fail("demo_person_unknown", person.key);
    const pin = secrets.operatorPin(person.key);
    const set = await t.client.request("PUT", `/api/people/${encodeURIComponent(personId)}/operator-pin`, { pin, confirmPin: pin });
    if (!set.ok) fail("demo_pin_set_refused", `${person.key}:${set.body?.error ?? set.status}`);
  }
  writeNewDemoSecrets(root, generated);
  ledger.mark("credentials:operator-pins:v1", "per-person PINs generated locally; set via owner route");
  for (const person of DEMO_PEOPLE) {
    await t.operator(ledger.id(`person:${person.key}`)!, secrets.operatorPin(person.key));
  }
  console.log(`DEMO_CREDENTIALS = LOCAL (${DEMO_PEOPLE.length} operator PINs set and verified; stored only in the root)`);
}

async function status(root: string, baseUrl: string): Promise<void> {
  const state = readCycle(root);
  console.log(`cycle: ${state ? `${state.cycleId} ${state.status} start=${state.startedAt} plannedEnd=${state.plannedEndAt} steps=${Object.keys(state.steps).length}/${DEMO_CYCLE_C1.length} runnerAlive=${processAlive(state.runnerPid)}` : "not started"}`);
  const t = await connect(root, baseUrl);
  const ledger = fileDemoLedger(root);
  for (const plan of ["alpha", "nord", "meadow", "orbit"] as DemoPlanKey[]) {
    const planId = ledger.id(`plan:${plan}`);
    if (!planId) continue;
    for (const task of await readPlanTasks(t.client, planId)) {
      for (const participant of (task.participants ?? []).filter((item) => item.active)) {
        console.log(`OPEN SESSION ${plan} ${task.seqLabel} ${task.processLabel} — ${participant.label}`);
      }
      if (task.activeMachineRun) {
        console.log(`ACTIVE MACHINE RUN ${plan} ${task.seqLabel} ${task.processLabel}`);
      }
    }
  }
}

export async function runDemoAtelierCli(argv: readonly string[] = process.argv): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    fail("demo_atelier_production_refused");
  }
  const args = [...argv];
  while (args.length > 2 && args[2] === "--") {
    args.splice(2, 1);
  }
  const command = args[2] ?? "help";
  if (command === "help") {
    console.log("demo-atelier init [--as-of <ISO>]|setup --as-of <ISO>|bundle --data-backup <dir>|restore --data-backup <dir> --bundle <dir>|credentials-init|prepare|verify|manifest|cycle|stop-cycle|status|report|history|chronology-plan|chronology-apply --root <root> [--base-url <url>]");
    return;
  }
  const root = resolve(readArg(args, "root"));
  if (command === "init") {
    await init(root, readAsOf(args));
    return;
  }
  if (command === "restore") {
    // Explicit inputs only: data backup, demo bundle, local key, empty target (--root).
    const result = restoreDemoEnvironment({
      dataBackupDir: resolve(readArg(args, "data-backup")),
      bundleDir: resolve(readArg(args, "bundle")),
      targetRoot: root,
      keyRoot: resolve(readArg(args, "key-root", defaultDemoKeyRoot())),
    });
    console.log(`DEMO_RESTORED = ${result.targetRoot}`);
    console.log(`scenario: ${JSON.stringify(result.scenario)}`);
    return;
  }
  requireDemoRoot(root);
  if (command === "bundle") {
    const keyRoot = resolve(readArg(args, "key-root", defaultDemoKeyRoot()));
    ensureDemoKey(keyRoot);
    const out = createDemoBundle({
      root,
      dataBackupDir: resolve(readArg(args, "data-backup")),
      keyRoot,
      codeVersion: readArg(args, "code-version", "unknown"),
    });
    console.log(`DEMO_BUNDLE = ${out}`);
    return;
  }
  if (command === "history") {
    await history(root);
    return;
  }
  if (command === "setup") {
    const asOf = readAsOf(args);
    if (asOf === null) {
      fail("demo_setup_needs_as_of", "setup --as-of <ISO>");
    }
    await setupAsOf(root, asOf);
    return;
  }
  if (command === "chronology-plan") {
    chronologyPlan(root);
    return;
  }
  if (command === "chronology-apply") {
    chronologyApply(root);
    return;
  }
  const baseUrl = readArg(args, "base-url").replace(/\/$/, "");
  if (command === "prepare") {
    const ledger = fileDemoLedger(root);
    const report = await prepareDemoAtelier({ transport: await connect(root, baseUrl), ledger, secrets: loadDemoSecrets(root), log: (line) => console.log(line) });
    console.log(`DEMO_ATELIER_PREPARED = ${report.refusals.length ? "WITH_REFUSALS" : "YES"}`);
    console.log("DIRECT_SQL_SEED = NO");
    console.log(JSON.stringify({ ...report, applied: report.applied.length, skipped: report.skipped.length }, null, 2));
    return;
  }
  if (command === "verify") {
    const ok = await verify(root, baseUrl);
    console.log(`DEMO_ATELIER_VERIFY = ${ok ? "PASS" : "FAIL (see FAIL lines; CONFLICT lines are documented engine-configuration limits)"}`);
    return;
  }
  if (command === "manifest") {
    await manifest(root, baseUrl);
    return;
  }
  if (command === "cycle") {
    await cycle(root, baseUrl, args);
    return;
  }
  if (command === "credentials-init") {
    await credentialsInit(root, baseUrl);
    return;
  }
  if (command === "stop-cycle") {
    await stop(root, baseUrl);
    return;
  }
  if (command === "status") {
    await status(root, baseUrl);
    return;
  }
  if (command === "report") {
    await report(root, baseUrl);
    return;
  }
  fail("demo_atelier_unknown_command", command);
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("demoAtelierCli.ts")
  : false;

if (invokedDirectly) {
  await runDemoAtelierCli();
}
