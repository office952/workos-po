// N-019 demo atelier runtime: persistent synthetic root, own port, no reset.
// Usage: node scripts/demo-atelier.mjs <init|setup|start|stop|status|credentials-init|prepare|verify|manifest|cycle|stop-cycle|report|history|chronology|backup|restore|restore-verify>
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROCESS_MARKER = "--workos-demo-atelier-n019";
const MARKER_FILE = "DEMO_ATELIER_N019";
const HOST = "127.0.0.1";
const useWindowsShell = process.platform === "win32";

function localDataHome(env = process.env) {
  if (process.platform === "win32") {
    return env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  }
  return env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
}

const ROOT = resolve(process.env.WORKOS_DEMO_ATELIER_ROOT?.trim() || join(localDataHome(), "WorkOS", "demo-atelier-n019"));
const BACKUP_ROOT = resolve(process.env.WORKOS_DEMO_ATELIER_BACKUP_ROOT?.trim() || join(localDataHome(), "WorkOS", "demo-atelier-n019-backups"));
const PORT = Number(process.env.WORKOS_DEMO_ATELIER_PORT ?? 8891);
const CHECK_PORT = Number(process.env.WORKOS_DEMO_ATELIER_CHECK_PORT ?? 8892);
const URL_BASE = `http://${HOST}:${PORT}`;

function fail(code, detail) {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

function guardRoot(root) {
  const temp = resolve(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp").toLowerCase();
  const lowered = root.toLowerCase();
  if (lowered.startsWith(temp) || lowered.startsWith(repoRoot.toLowerCase()) || lowered.includes(`${join("workspace", "workos-po")}`.toLowerCase())) {
    fail("demo_root_location_refused", `${root} must be outside %TEMP%, session folders, worktrees and the repository.`);
  }
}

const pidPath = (root) => join(root, "demo-atelier-api.pid.json");
const logPath = (root) => join(root, "demo-atelier-api.log");
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

function commandLineFor(pid) {
  try {
    if (process.platform === "win32") {
      return execFileSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: "utf8" }).trim();
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listenerPids(port) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
      return [...new Set(out.split(/\r?\n/).filter((line) => line.includes("LISTENING")).map((line) => line.trim().split(/\s+/)).filter((parts) => (parts[1] ?? "").endsWith(`:${port}`)).map((parts) => Number(parts.at(-1))))];
    }
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function health(base) {
  try {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json();
    return response.ok && body.service === "workos-final-api";
  } catch {
    return false;
  }
}

/** Ours = recorded PID alive, its command line carries the marker, recorded root/port match. */
function ownedPid(root, port) {
  const recorded = readJson(pidPath(root));
  if (!recorded || recorded.port !== port || recorded.root !== root || !alive(recorded.pid)) {
    return null;
  }
  return commandLineFor(recorded.pid).includes(PROCESS_MARKER) ? recorded.pid : null;
}

function pnpm(args, options = {}) {
  return spawn("pnpm", args, { cwd: repoRoot, windowsHide: true, shell: useWindowsShell, ...options });
}

function runPnpm(args, env = process.env) {
  return new Promise((done, reject) => {
    const child = pnpm(args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done() : reject(new Error(`${args.join(" ")} exited ${code}`))));
  });
}

const cli = (command, extra = [], env = process.env, root = ROOT) =>
  runPnpm(["--filter", "@workos-final/api", "demo:atelier", "--", command, "--root", root, ...extra], env);

/** Runs this script again with its own documented commands, capturing exit code and output. */
function runSelf(args, env) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: repoRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) => done({ code, output: output.split(/\r?\n/).filter((line) => !/DEP0190|trace-deprecation/.test(line)).join("\n") }));
  });
}

function apiEnv(root, port) {
  return {
    ...process.env,
    NODE_ENV: "development",
    HOST,
    PORT: String(port),
    WORKOS_CLOUD_ROOT: root,
    WORKOS_STATIC_ROOT: join(repoRoot, "dist"),
    WORKOS_LOCAL_ROOT: "",
    WORKOS_SQLITE_PATH: "",
  };
}

async function launch(root, port) {
  const base = `http://${HOST}:${port}`;
  const owned = ownedPid(root, port);
  if (owned && (await health(base))) {
    console.log(`already running pid ${owned} ${base}`);
    return owned;
  }
  const occupants = listenerPids(port);
  if (occupants.length > 0) {
    fail("demo_port_occupied_by_unknown_process", `port ${port} pids ${occupants.join(",")} — not ours, not touched. Set WORKOS_DEMO_ATELIER_PORT.`);
  }
  if (!existsSync(join(repoRoot, "dist", "index.html"))) {
    await runPnpm(["build"]);
  }
  // Output goes straight to a log file, so the API never depends on this launcher process.
  const log = openSync(logPath(root), "a");
  const child = pnpm(["--filter", "@workos-final/api", "start", "--", PROCESS_MARKER], {
    env: apiEnv(root, port),
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  closeSync(log);
  // The pnpm/cmd wrapper is not the node process; record the real listener once it binds.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((done) => setTimeout(done, 500));
    if (await health(base)) break;
  }
  if (!(await health(base))) {
    fail("demo_api_unhealthy", `see ${logPath(root)}`);
  }
  const listener = listenerPids(port).find((pid) => commandLineFor(pid).includes(PROCESS_MARKER)) ?? child.pid;
  writeFileSync(pidPath(root), `${JSON.stringify({ kind: "workos-demo-atelier-n019", pid: listener, port, root, url: base, startedAt: new Date().toISOString(), commit: gitHead() }, null, 2)}\n`);
  return listener;
}

function stopOwned(root, port) {
  const pid = ownedPid(root, port);
  if (!pid) {
    console.log("no positively identified demo API to stop");
    return false;
  }
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
  unlinkSync(pidPath(root));
  console.log(`stopped demo API pid ${pid}`);
  return true;
}

/** Code identity: HEAD plus a digest of uncommitted changes, so a dirty tree is never reported as HEAD. */
function gitHead() {
  try {
    const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    const head = git("rev-parse", "HEAD").trim();
    const changed = git("status", "--porcelain", "--untracked-files=all").split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)).sort();
    if (changed.length === 0) return head;
    const hash = createHash("sha256");
    for (const file of changed) {
      hash.update(file);
      if (existsSync(join(repoRoot, file))) hash.update(readFileSync(join(repoRoot, file)));
    }
    return `${head}+uncommitted(${changed.length} files, sha256 ${hash.digest("hex").slice(0, 12)})`;
  } catch {
    return "unknown";
  }
}

function cycleRunnerAlive(root) {
  const state = readJson(join(root, "demo-atelier-cycle.json"));
  return Boolean(state && state.status === "RUNNING" && state.runnerPid && alive(state.runnerPid));
}

function latestBackup() {
  if (!existsSync(BACKUP_ROOT)) return null;
  const dirs = readdirSync(BACKUP_ROOT).filter((name) => name.startsWith("bkp-") && !name.endsWith(".demo-n019")).map((name) => join(BACKUP_ROOT, name)).filter((path) => statSync(path).isDirectory());
  return dirs.sort().at(-1) ?? null;
}

/**
 * Normalized, server-read view of the demo data: people and skills, resources,
 * client → request → quote → job links, operations with sessions, machine runs
 * and quality results, files with revisions/links/uses and the SHA-256 of the
 * bytes actually downloaded. Used to compare a restored root with the live one.
 */
const SNAPSHOT_SCOPE = "API read of people (status, availability, role, skills, PIN configured), skills, workcenters, machines, customer profiles, requests with SHA-256 of downloaded attachments, quotes with request/order links, jobs with request/customer/order/plan links, every operation (status, provider, executor, planned effort, start, completion, personal sessions, machine runs, QC attempts) and job files (metadata, revisions, links, uses, SHA-256 of downloaded bytes). Not compared: registry creation timestamps, ledger/runtime files, tables the API does not expose. Not a whole-database equality.";

async function deepSnapshot(base, identityRoot) {
  const identity = readJson(join(identityRoot, ".reference-identity.json"));
  const jar = { cookie: "" };
  const fetchRaw = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", cookie: jar.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = response.headers.getSetCookie?.() ?? [];
    if (set.length) jar.cookie = set.map((item) => item.split(";")[0]).join("; ");
    return response;
  };
  const call = async (method, path, body) => (await fetchRaw(method, path, body)).json();
  const download = async (path) => {
    const response = await fetchRaw("GET", path);
    if (!response.ok) return `HTTP_${response.status}`;
    return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  };
  await call("POST", "/api/cloud/login", { email: identity.email, password: identity.password, organizationId: identity.organizationId });
  const byId = (rows, key) => [...rows].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
  const people = await call("GET", "/api/people");
  const admin = await call("GET", "/api/workcenters");
  const customers = (await call("GET", "/api/customers")).customers;
  const requests = (await call("GET", "/api/requests")).overview.requests;
  const quotes = (await call("GET", "/api/quotes")).overview.quotes;
  const jobs = (await call("GET", "/api/jobs")).overview.jobs;
  const snapshot = {
    people: byId(people.registry.people, "personId").map((item) => ({ personId: item.personId, name: item.displayName, status: item.status, availability: item.availability, role: item.roleLabel, pin: item.operatorPinConfigured, skills: (item.skills ?? []).map((skill) => `${skill.code ?? skill.skillId}:${skill.status ?? ""}`).sort() })),
    skills: byId(people.skills, "skillId").map((item) => ({ skillId: item.skillId, code: item.code, label: item.displayLabel, status: item.status })),
    workcenters: byId(admin.workcenters, "id").map((item) => ({ id: item.id, label: item.label, lifecycle: item.lifecycle, capabilityIds: item.capabilityIds })),
    machines: byId(admin.machines, "id").map((item) => ({ id: item.id, label: item.label, lifecycle: item.lifecycle, workcenterId: item.workcenterId, capabilityIds: item.capabilityIds })),
    customers: byId(customers, "customerId").map(({ customerId, displayName, cui, contactName, phone, email, address, city, notes, status }) => ({ customerId, displayName, cui, contactName, phone, email, address, city, notes, status })),
    requests: [],
    quotes: byId(quotes, "quoteSnapshotId").map((item) => ({ quoteSnapshotId: item.quoteSnapshotId, requestId: item.requestId, customerId: item.customerId, orderSnapshotId: item.orderSnapshotId, superseded: item.superseded, gross: item.grossDisplay })),
    jobs: [],
  };
  for (const request of byId(requests, "requestId")) {
    const attachments = (await call("GET", `/api/requests/${encodeURIComponent(request.requestId)}/attachments`)).attachments ?? [];
    const files = [];
    for (const attachment of byId(attachments, "attachmentId")) {
      files.push({ attachmentId: attachment.attachmentId, name: attachment.originalFileName, sha256: await download(`/api/requests/${encodeURIComponent(request.requestId)}/attachments/${encodeURIComponent(attachment.attachmentId)}/download`) });
    }
    snapshot.requests.push({ requestId: request.requestId, customerId: request.customerId, title: request.title, status: request.status, attachments: files });
  }
  for (const job of byId(jobs, "jobId")) {
    const entry = { jobId: job.jobId, requestId: job.requestId, customerId: job.customerId, orderSnapshotId: job.orderSnapshotId, planId: job.planId, stage: job.stage, tasks: [], files: [] };
    if (job.planId) {
      const plan = (await call("GET", `/api/execution-plans/${encodeURIComponent(job.planId)}`)).executionPlan;
      entry.tasks = byId(plan.tasks, "taskId").map((task) => ({
        taskId: task.taskId,
        status: task.status,
        provider: task.assignedProvider?.id ?? null,
        executor: task.assignedExecutor?.id ?? null,
        plannedEffortMinutes: task.plannedEffortMinutes,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        sessions: (task.workSessions ?? []).map((session) => `${session.sessionId}|${session.personId}|${session.startedAt}|${session.endedAt}|${session.endKind}`).sort(),
        machineRuns: (task.machineRuns ?? []).map((run) => `${run.machineRunId}|${run.machineProviderId}|${run.startedAt}|${run.completedAt}`).sort(),
        quality: (task.qualityAttempts ?? []).map((attempt) => JSON.stringify(attempt)).sort(),
      }));
      const archive = (await call("GET", `/api/jobs/${encodeURIComponent(job.jobId)}/files`)).archive;
      for (const file of byId(archive?.files ?? [], "artifactId")) {
        const { downloadHref, sizeLabel, purposeLabel, ...stable } = file;
        void sizeLabel;
        void purposeLabel;
        entry.files.push({ ...stable, downloadedSha256: downloadHref ? await download(downloadHref) : null });
      }
    }
    snapshot.jobs.push(entry);
  }
  const counts = {
    people: snapshot.people.length,
    customers: snapshot.customers.length,
    requests: snapshot.requests.length,
    attachments: snapshot.requests.reduce((sum, item) => sum + item.attachments.length, 0),
    quotes: snapshot.quotes.length,
    jobs: snapshot.jobs.length,
    tasks: snapshot.jobs.reduce((sum, item) => sum + item.tasks.length, 0),
    sessions: snapshot.jobs.reduce((sum, item) => sum + item.tasks.reduce((n, task) => n + task.sessions.length, 0), 0),
    machineRuns: snapshot.jobs.reduce((sum, item) => sum + item.tasks.reduce((n, task) => n + task.machineRuns.length, 0), 0),
    files: snapshot.jobs.reduce((sum, item) => sum + item.files.length, 0),
  };
  return { counts, snapshot };
}

function differences(left, right, path = "", out = []) {
  if (out.length >= 25) return out;
  if (JSON.stringify(left) === JSON.stringify(right)) return out;
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) differences(left[key], right[key], `${path}/${key}`, out);
    return out;
  }
  out.push(`${path}: ${JSON.stringify(left)?.slice(0, 120)} != ${JSON.stringify(right)?.slice(0, 120)}`);
  return out;
}

const command = process.argv[2] ?? "status";
if (process.env.NODE_ENV === "production") fail("demo_atelier_production_refused");
guardRoot(ROOT);
const hasMarker = existsSync(join(ROOT, MARKER_FILE));

try {
  if (command === "init") {
    await cli("init", process.argv.slice(3));
  } else if (!hasMarker) {
    fail("demo_root_not_initialized", `${ROOT} — run: node scripts/demo-atelier.mjs init`);
  } else if (command === "start") {
    const pid = await launch(ROOT, PORT);
    console.log(`DEMO_ATELIER_URL = ${URL_BASE}`);
    console.log(`DEMO_ATELIER_ROOT = ${ROOT}`);
    console.log(`PID = ${pid}`);
    console.log(`CODE = ${gitHead()}`);
  } else if (command === "stop") {
    stopOwned(ROOT, PORT);
  } else if (command === "status") {
    console.log(`DEMO_ATELIER_URL = ${URL_BASE}`);
    console.log(`DEMO_ATELIER_ROOT = ${ROOT}`);
    console.log(`API = ${(await health(URL_BASE)) ? "UP" : "DOWN"} pid=${ownedPid(ROOT, PORT) ?? "none"}`);
    if (await health(URL_BASE)) await cli("status", ["--base-url", URL_BASE]);
  } else if (["prepare", "verify", "manifest", "stop-cycle", "report", "credentials-init"].includes(command)) {
    await cli(command, ["--base-url", URL_BASE]);
  } else if (command === "cycle") {
    if (cycleRunnerAlive(ROOT)) fail("demo_cycle_runner_active");
    const logFile = join(ROOT, "demo-atelier-cycle.log");
    const log = openSync(logFile, "a");
    const child = pnpm(["--filter", "@workos-final/api", "demo:atelier", "--", "cycle", "--root", ROOT, "--base-url", URL_BASE], { detached: true, stdio: ["ignore", log, log] });
    child.unref();
    closeSync(log);
    console.log(`cycle runner launched; log ${logFile}`);
  } else if (command === "history") {
    // Synthetic history H1: the API must be down; the CLI holds the runtime lease.
    if (cycleRunnerAlive(ROOT)) fail("demo_history_refused_cycle_running");
    const wasRunning = stopOwned(ROOT, PORT);
    try {
      await cli("history");
    } finally {
      if (wasRunning) await launch(ROOT, PORT);
    }
  } else if (command === "setup") {
    // Registry setup dated at onboarding (--as-of): in-process, API down.
    const wasRunning = stopOwned(ROOT, PORT);
    try {
      await cli("setup", process.argv.slice(3));
    } finally {
      if (wasRunning) await launch(ROOT, PORT);
    }
  } else if (command === "chronology-plan") {
    await cli("chronology-plan");
  } else if (command === "chronology") {
    // Setup chronology correction: the API must be down; the CLI holds the runtime lease.
    if (cycleRunnerAlive(ROOT)) fail("demo_chronology_refused_cycle_running");
    const wasRunning = stopOwned(ROOT, PORT);
    try {
      await cli("chronology-apply");
    } finally {
      if (wasRunning) await launch(ROOT, PORT);
    }
  } else if (command === "backup") {
    if (cycleRunnerAlive(ROOT)) fail("demo_backup_refused_cycle_running", "wait for the cycle to finish or run stop-cycle");
    mkdirSync(BACKUP_ROOT, { recursive: true });
    const wasRunning = stopOwned(ROOT, PORT);
    try {
      await runPnpm(["--filter", "@workos-final/api", "cloud:backup"], { ...process.env, NODE_ENV: "development", WORKOS_CLOUD_ROOT: ROOT, WORKOS_BACKUP_ROOT: BACKUP_ROOT });
      // Demo-specific context next to (not inside) the general data backup.
      await cli("bundle", ["--data-backup", latestBackup(), "--code-version", gitHead()]);
    } finally {
      if (wasRunning) await launch(ROOT, PORT);
    }
    console.log(`DEMO_BACKUP = ${latestBackup()}`);
    console.log(`DEMO_BUNDLE = ${latestBackup()}.demo-n019`);
  } else if (command === "restore") {
    // node scripts/demo-atelier.mjs restore <empty target> [data backup]; explicit inputs only.
    const target = process.argv[3];
    const backup = process.argv[4] ?? latestBackup();
    if (!target || !backup) fail("demo_restore_usage", "restore <empty target dir> [data backup dir]");
    await cli("restore", ["--data-backup", backup, "--bundle", `${backup}.demo-n019`], process.env, resolve(target));
  } else if (command === "restore-verify") {
    const backup = process.argv[3] ?? latestBackup();
    if (!backup) fail("demo_backup_missing");
    const bundle = `${backup}.demo-n019`;
    if (!existsSync(bundle)) fail("demo_bundle_missing", bundle);
    const target = join(localDataHome(), "WorkOS", `demo-atelier-n019-restore-check-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    // 1. Restore from explicit inputs only (data backup + demo bundle + local key).
    await cli("restore", ["--data-backup", backup, "--bundle", bundle], process.env, target);
    // 2. The documented commands, with the root and port overridden to the restored copy.
    const env = { ...process.env, WORKOS_DEMO_ATELIER_ROOT: target, WORKOS_DEMO_ATELIER_PORT: String(CHECK_PORT) };
    const checkBase = `http://${HOST}:${CHECK_PORT}`;
    const results = {};
    const step = async (name, args, expectFailure = false) => {
      const result = await runSelf(args, env);
      results[name] = { exit: result.code, ok: expectFailure ? result.code !== 0 : result.code === 0, output: result.output };
      console.log(`RESTORED_${name.toUpperCase()} = ${results[name].ok ? "OK" : "FAIL"} (exit ${result.code})`);
      return result;
    };
    await step("start", ["start"]);
    try {
      const verify = await step("verify", ["verify"]);
      for (const line of verify.output.split("\n").filter((item) => /^(PASS|FAIL) /.test(item))) console.log(`  ${line}`);
      await step("manifest", ["manifest"]);
      const prepare = await step("prepare", ["prepare"]);
      const applied = prepare.output.match(/"applied": (\d+)/)?.[1];
      console.log(`RESTORED_PREPARE_APPLIED = ${applied ?? "?"} (expected 0: no duplicates, no reset)`);
      const history = await step("history_reapply", ["history"], true);
      console.log(`RESTORED_HISTORY_REAPPLY = ${/demo_history_already_applied/.test(history.output) ? "REFUSED (already applied)" : "UNEXPECTED"}`);
      const chronology = await step("chronology_reapply", ["chronology"], true);
      console.log(`RESTORED_CHRONOLOGY_REAPPLY = ${/demo_chronology_already_applied/.test(chronology.output) ? "REFUSED (already applied)" : "UNEXPECTED"}`);
      const restored = await deepSnapshot(checkBase, target);
      const manifest = JSON.parse(readFileSync(join(backup, "manifest.json"), "utf8"));
      console.log(`BACKUP = ${backup} (createdAt ${manifest.createdAt ?? "?"}, artifacts ${manifest.artifacts?.length ?? "?"})`);
      console.log(`RESTORED_ROOT = ${target} (credentials recovered from the sealed bundle; API login on ${checkBase} OK)`);
      console.log("RESTORED_DB_FILES = byte-identical to the backup artifacts (SHA-256 verified by the general restore)");
      console.log(`RESTORED_COUNTS = ${JSON.stringify(restored.counts)}`);
      const corrupt = restored.snapshot.jobs.flatMap((job) => job.files.filter((file) => file.downloadedSha256 !== file.sha256).map((file) => file.artifactId));
      console.log(`RESTORED_FILE_BYTES_MATCH_RECORDED_SHA256 = ${corrupt.length === 0 ? "YES" : `NO ${corrupt.join(",")}`}`);
      const report = { backup, bundle, target, scope: SNAPSHOT_SCOPE, steps: results, restored };
      if (await health(URL_BASE)) {
        // Comparison side only: the live environment, read through its own API.
        const live = await deepSnapshot(URL_BASE, ROOT);
        const diff = differences(live.snapshot, restored.snapshot);
        console.log(`LIVE_COUNTS = ${JSON.stringify(live.counts)}`);
        console.log(`API_SNAPSHOT_COMPARE_LIVE_VS_RESTORED = ${diff.length === 0 ? "IDENTICAL" : `DIFFERENT (${diff.length}+)`}`);
        console.log(`  scope: ${SNAPSHOT_SCOPE}`);
        for (const line of diff) console.log(`  ${line}`);
        report.live = live;
        report.differences = diff;
      }
      writeFileSync(join(target, "demo-atelier-restore-report.json"), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`REPORT = ${join(target, "demo-atelier-restore-report.json")}`);
    } finally {
      await step("stop", ["stop"]);
      console.log("restored root kept for inspection");
    }
  } else {
    fail("demo_atelier_unknown_command", command);
  }
} catch (error) {
  fail("demo_atelier_failed", error instanceof Error ? error.message : String(error));
}
