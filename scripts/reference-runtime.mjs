import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFERENCE_HOST,
  REFERENCE_PORT,
  REFERENCE_URL,
  prepareReferenceRootForCommand,
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

function runOwnerReviewCli(cliArgs, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnPnpm(
      ["--filter", "@workos-final/api", "cloud:owner-review", "--", ...cliArgs],
      {
        env,
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error(`owner_review_cli_failed:${cliArgs[0]}:${code ?? signal}`));
        return;
      }
      resolvePromise();
    });
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

async function ensureIdentity(root, env) {
  const existing = readJson(identityPath(root));
  const planeExists = existsSync(controlPlanePath(root));
  if (
    existing &&
    planeExists &&
    existing.fixtureKind === "OWNER_REVIEW_V1" &&
    existing.bootstrapPolicy === "SYNTHETIC_TEST" &&
    existing.organization === "WorkOS Test" &&
    existing.SYNTHETIC_ONLY === "YES"
  ) {
    await runOwnerReviewCli(["provision", "--root", root], env);
    return readJson(identityPath(root)) ?? existing;
  }
  if (planeExists && !existing) {
    fail(
      "reference_identity_missing",
      "Reference root already has a Control Plane without a synthetic identity file.",
    );
  }
  if (planeExists && existing && existing.fixtureKind !== "OWNER_REVIEW_V1") {
    fail(
      "reference_identity_legacy",
      "Existing reference identity is not OWNER_REVIEW_V1. Run: pnpm reference:reset",
    );
  }
  await runOwnerReviewCli(["provision", "--root", root], env);
  const identity = readJson(identityPath(root));
  if (!identity) {
    fail("reference_identity_missing", root);
  }
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

async function seedCommand(root, env) {
  if (!(await healthOk())) {
    fail("reference_seed_runtime_down", `Start the reference runtime first: ${REFERENCE_URL}`);
  }
  const identity = readJson(identityPath(root));
  if (!identity || identity.fixtureKind !== "OWNER_REVIEW_V1") {
    fail(
      "reference_identity_missing",
      "Owner-review identity required. Run: pnpm reference:reset",
    );
  }
  await runOwnerReviewCli(["seed", "--root", root, "--base-url", REFERENCE_URL], env);
}

async function resetCommand(root, env) {
  stopOwned(root);
  await runOwnerReviewCli(["reset", "--root", root], env);
  console.log("REFERENCE_RUNTIME_RESET = YES");
  console.log("SYNTHETIC_REFERENCE_DATA = YES");
  console.log("REAL_DATA = NO");
  console.log("Next: pnpm reference:start && pnpm reference:seed");
}

const command = process.argv[2] ?? "status";
if (process.env.NODE_ENV === "production") {
  fail("reference_runtime_production_refused", "Reference runtime is synthetic engineering infrastructure.");
}

const env = { ...process.env, NODE_ENV: "development" };
delete env.WORKOS_CLOUD_ROOT;
// Reset / status / stop / seed resolve only — never mint SYNTHETIC_REFERENCE.
// Start / restart may establish ownership via safe create semantics only.
const root = prepareReferenceRootForCommand(command, env);

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
    await seedCommand(root, env);
  } else if (command === "reset") {
    await resetCommand(root, env);
  } else {
    fail("reference_command_unknown", command);
  }
} catch (error) {
  fail("reference_runtime_failed", error instanceof Error ? error.message : String(error));
}
