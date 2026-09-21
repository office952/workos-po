import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFERENCE_HOST,
  REFERENCE_PORT,
  REFERENCE_URL,
  ensureSyntheticReferenceRoot,
  resolveReferenceRoot,
} from "./reference-root.mjs";
import {
  REFERENCE_LAUNCH_PNPM_ARGS,
  REFERENCE_PROCESS_MARKER,
  isPositivelyIdentifiedReferenceProcess,
  recordedAllowsStop,
} from "./reference-process.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const IDENTITY_NAME = ".reference-identity.json";
const PID_NAME = "reference-runtime.pid.json";
const LOG_NAME = "reference-runtime.log";
const DEFAULT_EMAIL = "ref@workos.local";
const DEFAULT_PASSWORD = "workos1234";
const DEFAULT_ORG = "WorkOS Reference Demo";
const useWindowsShell = process.platform === "win32";

function fail(code, detail) {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

function shellArg(value) {
  if (!useWindowsShell) {
    return value;
  }
  return `"${String(value).replaceAll('"', "")}"`;
}

function spawnPnpm(args, options) {
  return spawn("pnpm", args, {
    cwd: repoRoot,
    windowsHide: true,
    shell: useWindowsShell,
    ...options,
  });
}

function identityPath(root) {
  return join(root, IDENTITY_NAME);
}

function pidPath(root) {
  return join(root, PID_NAME);
}

function logPath(root) {
  return join(root, LOG_NAME);
}

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function controlPlanePath(root) {
  return join(root, "control", "control-plane.sqlite");
}

function commandLineFor(pid) {
  try {
    if (process.platform === "win32") {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { encoding: "utf8" },
      );
      return output.trim();
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isOwnedReferenceRuntime(pid, recorded) {
  if (!recorded || recorded.pid !== pid || !processAlive(pid)) {
    return false;
  }
  return isPositivelyIdentifiedReferenceProcess(pid, recorded, commandLineFor(pid));
}

function listenersOnReferencePort() {
  try {
    if (process.platform === "win32") {
      const output = execFileSync("netstat", ["-ano", "-p", "TCP"], {
        encoding: "utf8",
      });
      const pids = [];
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(`:${REFERENCE_PORT}`)) {
          continue;
        }
        const parts = line.trim().split(/\s+/);
        const local = parts[1] ?? "";
        const pid = Number(parts[parts.length - 1]);
        if (local.endsWith(`:${REFERENCE_PORT}`) && Number.isInteger(pid) && pid > 0) {
          pids.push(pid);
        }
      }
      return [...new Set(pids)];
    }
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${REFERENCE_PORT}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    );
    return output
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) {
      return [];
    }
    throw error;
  }
}

async function healthOk() {
  try {
    const response = await fetch(`${REFERENCE_URL}/api/health`);
    if (!response.ok) {
      return false;
    }
    const body = await response.json();
    return body.status === "ok" && body.service === "workos-final-api";
  } catch {
    return false;
  }
}

function readRecordedPid(root) {
  const recorded = readJson(pidPath(root));
  const pid = Number(recorded?.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return { ...recorded, pid };
}

function provisionWithExistingCli(root, identity, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnPnpm(
      [
        "--filter",
        "@workos-final/api",
        "cloud:provision",
        "--",
        "--root",
        shellArg(root),
        "--org",
        shellArg(identity.organization),
        "--email",
        shellArg(identity.email),
        "--password-stdin",
      ],
      {
        env,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    child.stdin.write(identity.password);
    child.stdin.end();
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error("reference_provision_failed"));
        return;
      }
      resolvePromise();
    });
  });
}

async function ensureIdentity(root, env) {
  const existing = readJson(identityPath(root));
  const planeExists = existsSync(controlPlanePath(root));
  if (existing && planeExists) {
    return existing;
  }
  if (planeExists && !existing) {
    fail(
      "reference_identity_missing",
      "Reference root already has a Control Plane without a synthetic identity file.",
    );
  }
  const identity = {
    classification: "SYNTHETIC_REFERENCE",
    SYNTHETIC_REFERENCE_DATA: "YES",
    REAL_DATA: "NO",
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    organization: DEFAULT_ORG,
  };
  await provisionWithExistingCli(root, identity, env);
  writeJson(identityPath(root), identity);
  return identity;
}

function ensureFrontendBuild() {
  const result = spawnPnpm(["build"], { stdio: "inherit" });
  return new Promise((resolvePromise, reject) => {
    result.on("exit", (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error("reference_frontend_build_failed"));
        return;
      }
      resolvePromise();
    });
    result.on("error", reject);
  });
}

function referenceEnv(root, env) {
  return {
    ...env,
    NODE_ENV: "development",
    HOST: REFERENCE_HOST,
    PORT: String(REFERENCE_PORT),
    WORKOS_CLOUD_ROOT: root,
    WORKOS_REFERENCE_ROOT: root,
    WORKOS_REFERENCE_RUNTIME: "1",
    WORKOS_STATIC_ROOT: join(repoRoot, "dist"),
    WORKOS_LOCAL_ROOT: "",
    WORKOS_SQLITE_PATH: "",
  };
}

async function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await healthOk()) {
      return true;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  return false;
}

function launchApi(root, env) {
  mkdirSync(root, { recursive: true });
  const log = logPath(root);
  const out = writeFileSync(log, "", { flag: "a" });
  void out;
  const child = spawnPnpm(REFERENCE_LAUNCH_PNPM_ARGS, {
    env: referenceEnv(root, env),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stream = (chunk) => {
    writeFileSync(log, chunk, { flag: "a" });
  };
  child.stdout?.on("data", stream);
  child.stderr?.on("data", stream);
  child.unref();
  writeJson(pidPath(root), {
    kind: "workos-reference-runtime",
    processMarker: REFERENCE_PROCESS_MARKER,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    port: REFERENCE_PORT,
    url: REFERENCE_URL,
    classification: "SYNTHETIC_REFERENCE",
  });
  return child.pid;
}

async function startCommand(root, env) {
  const recorded = readRecordedPid(root);
  if (recorded && isOwnedReferenceRuntime(recorded.pid, recorded) && (await healthOk())) {
    console.log("REFERENCE_RUNTIME_STATUS = RUNNING");
    console.log(`REFERENCE_URL = ${REFERENCE_URL}`);
    console.log("already running");
    return;
  }
  const occupants = listenersOnReferencePort();
  if (occupants.length > 0) {
    const ours =
      recorded &&
      occupants.includes(recorded.pid) &&
      isOwnedReferenceRuntime(recorded.pid, recorded);
    if (!ours || !(await healthOk())) {
      fail(
        "REFERENCE_RUNTIME_ACTIVATION = BLOCKED_PORT_OWNERSHIP_UNKNOWN",
        `Port ${REFERENCE_PORT} is already in use. WorkOS will not kill an unknown process.`,
      );
    }
    console.log("REFERENCE_RUNTIME_STATUS = RUNNING");
    console.log(`REFERENCE_URL = ${REFERENCE_URL}`);
    return;
  }
  await ensureFrontendBuild();
  const identity = await ensureIdentity(root, env);
  const pid = launchApi(root, env);
  const ready = await waitForHealth();
  if (!ready) {
    fail("reference_runtime_unhealthy", `Started pid ${pid} but ${REFERENCE_URL}/api/health did not become ready.`);
  }
  console.log("WorkOS synthetic reference runtime");
  console.log(`REFERENCE_URL = ${REFERENCE_URL}`);
  console.log(`root: ${root}`);
  console.log("classification: SYNTHETIC_REFERENCE");
  console.log("SYNTHETIC_REFERENCE_DATA = YES");
  console.log("REAL_DATA = NO");
  console.log(`Email: ${identity.email}`);
  console.log(`Password: ${identity.password}`);
  console.log(`Organization: ${identity.organization}`);
}

async function statusCommand(root) {
  const recorded = readRecordedPid(root);
  const healthy = await healthOk();
  const occupants = listenersOnReferencePort();
  const owned =
    recorded && isOwnedReferenceRuntime(recorded.pid, recorded) ? recorded.pid : null;
  console.log(`REFERENCE_URL = ${REFERENCE_URL}`);
  console.log(`REFERENCE_ROOT = ${root}`);
  console.log(`PID = ${owned ?? recorded?.pid ?? "none"}`);
  console.log(`PORT_OCCUPIED = ${occupants.length > 0 ? "yes" : "no"}`);
  console.log(`HEALTH = ${healthy ? "ok" : "down"}`);
  console.log(
    `REFERENCE_RUNTIME_STATUS = ${healthy && owned ? "RUNNING" : healthy ? "RUNNING_UNOWNED" : "STOPPED"}`,
  );
  if (healthy && !owned && occupants.length > 0) {
    console.log("PORT_OWNERSHIP = UNKNOWN");
  }
}

function stopOwned(root) {
  const recorded = readRecordedPid(root);
  if (!recorded) {
    console.log("no recorded reference runtime");
    return false;
  }
  if (!processAlive(recorded.pid)) {
    unlinkSync(pidPath(root));
    console.log("stale pid removed");
    return false;
  }
  const decision = recordedAllowsStop(recorded, commandLineFor(recorded.pid));
  if (!decision.ok) {
    fail(
      "reference_stop_refused",
      decision.reason === "command_unreadable"
        ? "Command line could not be read. Recorded PID was not killed."
        : "Recorded PID is not a positively identified WorkOS reference runtime. Not killed.",
    );
  }
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(recorded.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(recorded.pid, "SIGTERM");
    }
  } catch {
    fail("reference_stop_failed", `Could not stop pid ${recorded.pid}`);
  }
  if (existsSync(pidPath(root))) {
    unlinkSync(pidPath(root));
  }
  console.log(`stopped pid ${recorded.pid}`);
  return true;
}

async function cookieJarFetch(url, options, jar) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.cookie) {
    headers.cookie = jar.cookie;
  }
  const response = await fetch(url, { ...options, headers });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    jar.cookie = setCookie.map((entry) => entry.split(";")[0]).join("; ");
  }
  return response;
}

async function login(jar, identity) {
  const response = await cookieJarFetch(
    `${REFERENCE_URL}/api/cloud/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: identity.email,
        password: identity.password,
      }),
    },
    jar,
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`reference_login_failed:${body.error ?? response.status}`);
  }
  return body;
}

async function api(jar, method, path, body) {
  const response = await cookieJarFetch(
    `${REFERENCE_URL}${path}`,
    {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    jar,
  );
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body: payload };
}

function lettersValues(inscription) {
  return {
    "root.inscription": inscription,
    "face.finish": "none",
    "face.confirmedAreaMm2": 250000,
    "volume.depthMm": "60",
    "volume.finish": "none",
    "volume.confirmedPerimeterMm": 12500,
  };
}

function acmValues(inscription) {
  return {
    "root.inscription": inscription,
    "face.widthMm": 1000,
    "face.heightMm": 500,
    "face.cassetteDepthMm": 40,
  };
}

async function ensureCustomer(jar, displayName) {
  const listed = await api(jar, "GET", "/api/customers");
  const customers = listed.body?.customers ?? [];
  const existing = customers.find((item) => item.displayName === displayName);
  if (existing) {
    return existing;
  }
  const created = await api(jar, "POST", "/api/customers", { displayName });
  if (!created.ok) {
    throw new Error(`reference_customer_failed:${displayName}`);
  }
  return created.body.customer;
}

async function ensureRequest(jar, customerId, title, description) {
  const listed = await api(jar, "GET", "/api/requests");
  const requests = listed.body?.overview?.requests ?? [];
  const existing = requests.find(
    (item) => item.customerId === customerId && item.title === title,
  );
  if (existing) {
    return existing;
  }
  const created = await api(jar, "POST", "/api/requests", {
    customerId,
    title,
    description,
  });
  if (!created.ok) {
    throw new Error(`reference_request_failed:${title}`);
  }
  return created.body.request ?? created.body.detail?.request ?? created.body;
}

async function ensureSeller(jar) {
  const current = await api(jar, "GET", "/api/seller");
  if (current.body?.configured && current.body?.seller) {
    return current.body.seller;
  }
  const saved = await api(jar, "PATCH", "/api/seller", {
    legalName: "WorkOS Reference Demo SRL",
    brand: "WorkOS Reference Demo",
    fiscalId: "RO00000000",
    tradeRegister: "J00/0000/2000",
    address: "Strada Demo 1",
    locality: "București",
    iban: "RO00RNCB0000000000000001",
    bank: "Banca Demo",
  });
  if (!saved.ok) {
    throw new Error("reference_seller_failed");
  }
  return saved.body.seller;
}

async function freezeQuote(jar, productCode, values, customerId, requestId) {
  const previewed = await api(jar, "POST", `/api/products/${productCode}/preview`, {
    values,
    requestId,
  });
  if (!previewed.ok) {
    throw new Error(`reference_preview_failed:${productCode}`);
  }
  const frozen = await api(jar, "POST", `/api/products/${productCode}/quote-snapshots`, {
    values,
    reviewId: previewed.body.reviewId,
    customerId,
    requestId,
  });
  if (!frozen.ok) {
    throw new Error(`reference_quote_failed:${productCode}:${frozen.body?.error ?? frozen.status}`);
  }
  return frozen.body.quoteSnapshot;
}

async function quotesForRequest(jar, requestId) {
  const listed = await api(jar, "GET", "/api/quotes");
  const quotes = listed.body?.overview?.quotes ?? [];
  return quotes.filter((item) => item.requestId === requestId);
}

async function ensureFrozenQuote(jar, productCode, values, customerId, requestId) {
  const existing = await quotesForRequest(jar, requestId);
  if (existing.length > 0) {
    return existing[0];
  }
  return freezeQuote(jar, productCode, values, customerId, requestId);
}

async function ensureAcceptedOrder(jar, productCode, quoteSnapshotId) {
  const acceptance = await api(
    jar,
    "POST",
    `/api/products/${productCode}/quote-snapshots/${quoteSnapshotId}/acceptance`,
  );
  if (!acceptance.ok && acceptance.status !== 409) {
    throw new Error(`reference_accept_failed:${acceptance.body?.error ?? acceptance.status}`);
  }
  const order = await api(
    jar,
    "POST",
    `/api/products/${productCode}/quote-snapshots/${quoteSnapshotId}/order`,
  );
  if (!order.ok && order.status !== 409) {
    throw new Error(`reference_order_failed:${order.body?.error ?? order.status}`);
  }
  return order.body?.orderSnapshot ?? acceptance.body?.orderSnapshot;
}

async function ensureExecutionPlan(jar, productCode, orderSnapshotId) {
  const release = await api(
    jar,
    "POST",
    `/api/products/${productCode}/orders/${orderSnapshotId}/production-release`,
  );
  if (!release.ok && release.status !== 409) {
    throw new Error(`reference_release_failed:${release.body?.error ?? release.status}`);
  }
  const snapshotId =
    release.body?.snapshot?.snapshotId ??
    (await api(jar, "GET", `/api/products/${productCode}/orders/${orderSnapshotId}/production-release`))
      .body?.snapshot?.snapshotId;
  if (!snapshotId) {
    throw new Error("reference_release_missing");
  }
  const plan = await api(
    jar,
    "POST",
    `/api/products/${productCode}/accepted-production-snapshots/${snapshotId}/execution-plan`,
  );
  if (!plan.ok && plan.status !== 409) {
    throw new Error(`reference_plan_failed:${plan.body?.error ?? plan.status}`);
  }
  return plan.body?.executionPlan;
}

async function ensureCncProvider(jar) {
  const admin = await api(jar, "GET", "/api/workcenters");
  const machines = admin.body?.machines ?? [];
  const existing = machines.find(
    (item) =>
      item.label === "CNC Router DEMO" ||
      (Array.isArray(item.capabilityIds) && item.capabilityIds.includes("CNC_ROUTING")),
  );
  if (existing) {
    if (existing.lifecycle !== "ACTIVE") {
      const activated = await api(jar, "PATCH", `/api/machines/${encodeURIComponent(existing.id)}`, {
        lifecycle: "ACTIVE",
      });
      if (activated.ok && activated.body?.machine) {
        return activated.body.machine;
      }
    }
    return existing;
  }
  const workcenters = admin.body?.workcenters ?? [];
  let workcenter =
    workcenters.find((item) => item.label === "Zonă CNC DEMO") ??
    workcenters.find((item) => item.lifecycle === "ACTIVE") ??
    workcenters[0];
  if (!workcenter) {
    const created = await api(jar, "POST", "/api/workcenters", {
      label: "Zonă CNC DEMO",
      lifecycle: "ACTIVE",
      capabilityIds: ["CNC_ROUTING"],
    });
    if (!created.ok) {
      throw new Error("reference_workcenter_failed");
    }
    workcenter = created.body.workcenter;
  } else if (workcenter.lifecycle !== "ACTIVE") {
    const activated = await api(jar, "PATCH", `/api/workcenters/${encodeURIComponent(workcenter.id)}`, {
      lifecycle: "ACTIVE",
    });
    if (activated.ok && activated.body?.workcenter) {
      workcenter = activated.body.workcenter;
    }
  }
  const machine = await api(jar, "POST", "/api/machines", {
    label: "CNC Router DEMO",
    workcenterId: workcenter.id,
    lifecycle: "ACTIVE",
    capabilityIds: ["CNC_ROUTING"],
  });
  if (!machine.ok) {
    throw new Error(`reference_machine_failed:${machine.body?.error ?? machine.status}`);
  }
  return machine.body.machine;
}

async function refreshExecutionPlan(jar, plan) {
  const planId = plan?.plan?.planId ?? plan?.planId;
  if (!planId) {
    return plan;
  }
  const refreshed = await api(jar, "GET", `/api/execution-plans/${encodeURIComponent(planId)}`);
  return refreshed.body?.executionPlan ?? plan;
}

async function applyPlanningSeed(jar, plan, provider) {
  const live = await refreshExecutionPlan(jar, plan);
  const tasks = live?.tasks ?? [];
  const providerTasks = tasks.filter((task) => {
    const eligible = Array.isArray(task.eligibleProviders) ? task.eligibleProviders : [];
    return (
      task.requiresProvider !== false &&
      (task.canAssign === true ||
        task.requiredCapabilityId === "CNC_ROUTING" ||
        String(task.requiredCapabilityLabel ?? "").toLowerCase().includes("cnc") ||
        eligible.some((item) => item.id === provider?.id))
    );
  });
  const assignable = (
    providerTasks.length >= 3 ? providerTasks : tasks.filter((task) => task.canAssign)
  ).slice();
  const chosen = assignable.slice(0, 3);
  const efforts = chosen.length >= 3 ? [45, 135, null] : [45, null];
  for (const [index, task] of chosen.entries()) {
    if (!task.assignedProvider && provider?.id) {
      await api(jar, "POST", `/api/execution-tasks/${encodeURIComponent(task.taskId)}/provider`, {
        providerId: provider.id,
      });
    }
    if (efforts[index] !== null && (task.plannedEffortMinutes == null || task.plannedEffortMinutes === undefined)) {
      await api(jar, "POST", `/api/execution-tasks/${encodeURIComponent(task.taskId)}/planned-effort`, {
        plannedEffortMinutes: efforts[index],
      });
    }
  }
}

async function seedCommand(root) {
  if (!(await healthOk())) {
    fail("reference_seed_runtime_down", `Start the reference runtime first: ${REFERENCE_URL}`);
  }
  const identity = readJson(identityPath(root));
  if (!identity) {
    fail("reference_identity_missing", root);
  }
  const jar = { cookie: "" };
  await login(jar, identity);
  await ensureSeller(jar);

  const alpha = await ensureCustomer(jar, "ALPHA CLIMA DEMO SRL");
  const nord = await ensureCustomer(jar, "NORD MARKET DEMO SRL");
  const urban = await ensureCustomer(jar, "URBAN PHARMA DEMO SRL");
  const sign = await ensureCustomer(jar, "SIGN PRO DEMO SRL");

  const alphaRequest = await ensureRequest(
    jar,
    alpha.customerId,
    "Litere volumetrice receptie",
    "Litere volumetrice frontlit pentru receptie ALPHA CLIMA DEMO.",
  );
  const nordRequest = await ensureRequest(
    jar,
    nord.customerId,
    "Caseta ACM iluminata",
    "Caseta ACM pentru NORD MARKET DEMO, date sintetice.",
  );
  const urbanRequest = await ensureRequest(
    jar,
    urban.customerId,
    "Litere volumetrice fatada",
    "Litere volumetrice pentru fatada URBAN PHARMA DEMO.",
  );
  await ensureRequest(
    jar,
    sign.customerId,
    "Cerere noua fara oferta",
    "Cerere sintetica SIGN PRO DEMO, fără ofertă.",
  );

  const letters = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
  const acm = "PRD-ACM-CASSETTE-NONE";

  const nordQuote = await ensureFrozenQuote(
    jar,
    acm,
    acmValues("Caseta NORD DEMO"),
    nord.customerId,
    nordRequest.requestId,
  );
  const urbanQuote = await ensureFrozenQuote(
    jar,
    letters,
    lettersValues("Litere URBAN DEMO"),
    urban.customerId,
    urbanRequest.requestId,
  );
  const alphaQuote = await ensureFrozenQuote(
    jar,
    letters,
    lettersValues("Litere ALPHA DEMO"),
    alpha.customerId,
    alphaRequest.requestId,
  );

  await ensureAcceptedOrder(jar, letters, urbanQuote.quoteSnapshotId);
  const alphaOrder = await ensureAcceptedOrder(jar, letters, alphaQuote.quoteSnapshotId);
  const plan = await ensureExecutionPlan(jar, letters, alphaOrder.orderSnapshotId);
  const provider = await ensureCncProvider(jar);
  await applyPlanningSeed(jar, plan, provider);

  console.log("REFERENCE_DATASET_SEEDED = YES");
  console.log("SYNTHETIC_REFERENCE_DATA = YES");
  console.log("DIRECT_SQL_SEED = NO");
  console.log(`customers: ALPHA/NORD/URBAN/SIGN`);
  console.log(`quotes: nord=${nordQuote.quoteSnapshotId} urban=${urbanQuote.quoteSnapshotId} alpha=${alphaQuote.quoteSnapshotId}`);
}

const command = process.argv[2] ?? "status";
if (process.env.NODE_ENV === "production") {
  fail("reference_runtime_production_refused", "Reference runtime is synthetic engineering infrastructure.");
}

const env = { ...process.env, NODE_ENV: "development" };
delete env.WORKOS_CLOUD_ROOT;
const root = ensureSyntheticReferenceRoot(resolveReferenceRoot(env));

try {
  if (command === "start") {
    await startCommand(root, env);
  } else if (command === "status") {
    await statusCommand(root);
  } else if (command === "stop") {
    stopOwned(root);
  } else if (command === "restart") {
    stopOwned(root);
    await startCommand(root, env);
  } else if (command === "seed") {
    await seedCommand(root);
  } else {
    fail("reference_command_unknown", command);
  }
} catch (error) {
  fail("reference_runtime_failed", error instanceof Error ? error.message : String(error));
}
