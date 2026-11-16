// Pilot Readiness E2E · synthetic runtime N-029 (new company, new root, no reuse of any other environment).
// Usage: node scripts/pilot-e2e.mjs <init|start|stop|status|schema|backup|restore> [--root DIR] [--port N] [--target DIR]
//
// Safety contract (fail closed):
// - the root is explicit or the documented default %LOCALAPPDATA%\WorkOS\N-029_PILOT_READINESS_E2E;
// - never the repository/worktrees, never %TEMP% (unless WORKOS_PILOT_E2E_ALLOW_TEMP=1, used by CI only);
// - never equal to WORKOS_CLOUD_ROOT or any other configured real root; never a root that carries another
//   environment's marker (N-019 demo atelier, N-028, …) or a control plane without this script's marker;
// - `init` only on a missing or empty directory; every other command only on a root with this marker;
// - the API is started with an explicit environment (WORKOS_CLOUD_ROOT = this root), never an inherited one.
// Credentials are generated locally into <root>/pilot-e2e-secrets.json (outside Git) and are never printed.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MARKER_FILE = "PILOT_E2E_N029";
const PROCESS_MARKER = "--workos-pilot-e2e-n029";
const HOST = "127.0.0.1";
const FOREIGN_MARKERS = ["DEMO_ATELIER_N019", "demo-atelier-ledger.json", "SYNTHETIC_REFERENCE", ".reference-identity.json"];
const useWindowsShell = process.platform === "win32";

const flag = (name) => { const i = process.argv.indexOf(`--${name}`); const v = i >= 0 ? process.argv[i + 1] : undefined; return v && !v.startsWith("--") ? v : undefined; };
const localDataHome = () => (process.platform === "win32" ? process.env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local") : process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share"));
const ROOT = resolve(flag("root") ?? process.env.WORKOS_PILOT_E2E_ROOT?.trim() ?? join(localDataHome(), "WorkOS", "N-029_PILOT_READINESS_E2E"));
const PORT = Number(flag("port") ?? process.env.WORKOS_PILOT_E2E_PORT ?? 8895);
const BACKUP_ROOT = resolve(flag("backup-root") ?? `${ROOT}-backups`);
const BASE = `http://${HOST}:${PORT}`;
const secretsPath = (root) => join(root, "pilot-e2e-secrets.json");
const pidPath = (root) => join(root, "pilot-e2e-api.pid.json");
const logPath = (root) => join(root, "pilot-e2e-api.log");
const ledgerPath = (root) => join(root, "pilot-e2e-ledger.json");
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

function fail(code, detail) {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

/** Location guard shared by every command that touches a root. */
export function guardLocation(root, { allowTemp = process.env.WORKOS_PILOT_E2E_ALLOW_TEMP === "1" } = {}) {
  const lowered = resolve(root).toLowerCase();
  if (lowered.startsWith(repoRoot.toLowerCase()) || /[\\/]workspace[\\/]workos-po/.test(lowered)) fail("pilot_root_refused", "inside a repository or worktree");
  for (const name of ["WORKOS_CLOUD_ROOT", "WORKOS_LOCAL_ROOT", "WORKOS_DEMO_ATELIER_ROOT"]) {
    const configured = process.env[name]?.trim();
    if (configured && resolve(configured).toLowerCase() === lowered) fail("pilot_root_refused", `equals ${name}`);
  }
  if (/demo-atelier-n019|demo-alpha|n-019|n-020|n-028/i.test(lowered)) fail("pilot_root_refused", "name of a protected historical environment");
  const temps = [process.env.TEMP, process.env.TMPDIR, tmpdir(), "/tmp"].filter(Boolean).map((t) => resolve(t).toLowerCase());
  if (!allowTemp && temps.some((t) => lowered.startsWith(t))) fail("pilot_root_refused", "temporary directory (persistent N-029 must survive the session)");
}

/** Ownership guard: the root must carry this script's marker and no foreign environment marker. */
function guardOwned(root) {
  guardLocation(root);
  if (!existsSync(join(root, MARKER_FILE))) fail("pilot_root_not_owned", `${root} has no ${MARKER_FILE}; run init on a new directory`);
  for (const foreign of FOREIGN_MARKERS) if (existsSync(join(root, foreign))) fail("pilot_root_refused", `foreign marker ${foreign}`);
}

function commandLineFor(pid) {
  try {
    if (process.platform === "win32") return execFileSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: "utf8" }).trim();
    return execFileSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" }).trim();
  } catch { return ""; }
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function listenerPids(port) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
      return [...new Set(out.split(/\r?\n/).filter((l) => l.includes("LISTENING")).map((l) => l.trim().split(/\s+/)).filter((p) => (p[1] ?? "").endsWith(`:${port}`)).map((p) => Number(p.at(-1))))];
    }
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).split(/\s+/).filter(Boolean).map(Number);
  } catch { return []; }
}
async function health(base = BASE) {
  try { const r = await fetch(`${base}/api/health`); const b = await r.json(); return r.ok && b.service === "workos-final-api"; } catch { return false; }
}
function ownedPid(root = ROOT, port = PORT) {
  const recorded = readJson(pidPath(root));
  if (!recorded || recorded.port !== port || resolve(recorded.root) !== resolve(root) || !alive(recorded.pid)) return null;
  return commandLineFor(recorded.pid).includes(PROCESS_MARKER) ? recorded.pid : null;
}
// On Windows pnpm runs through the shell: arguments with spaces (organization names) must be quoted.
const shellArg = (a) => (useWindowsShell && /[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const pnpm = (args, options = {}) => spawn("pnpm", args.map(shellArg), { cwd: repoRoot, windowsHide: true, shell: useWindowsShell, ...options });
function runPnpm(args, { env = process.env, stdin = null, quiet = false } = {}) {
  return new Promise((done, reject) => {
    const child = pnpm(args, { env, stdio: [stdin === null ? "ignore" : "pipe", quiet ? "pipe" : "inherit", quiet ? "pipe" : "inherit"] });
    let output = "";
    if (quiet) { child.stdout.on("data", (c) => (output += c)); child.stderr.on("data", (c) => (output += c)); }
    if (stdin !== null) { child.stdin.write(stdin); child.stdin.end(); }
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done(output) : reject(new Error(`${args.slice(0, 4).join(" ")} exited ${code}${quiet ? `\n${output.slice(-800)}` : ""}`))));
  });
}
function gitHead() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim() + (execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim() ? "+uncommitted" : ""); } catch { return "unknown"; }
}
function appendLedger(root, entry) {
  const ledger = readJson(ledgerPath(root)) ?? { kind: "workos-pilot-e2e-n029", entries: [] };
  ledger.entries.push({ at: new Date().toISOString(), commit: gitHead(), ...entry });
  writeFileSync(ledgerPath(root), `${JSON.stringify(ledger, null, 2)}\n`);
}
/** API environment is explicit: nothing about the data root is inherited from the shell. */
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
    // V1 scoped roles exist only in this synthetic environment; production default stays off.
    WORKOS_ORG_ROLES_V1: "on",
    WORKOS_ACCESS_OUTBOX_DIR: process.env.WORKOS_PILOT_E2E_OUTBOX === "1" ? join(root, "synthetic-outbox") : "",
  };
}
const password = () => `${randomBytes(12).toString("base64url")}7a`;

const ORGANIZATIONS = [
  { key: "A", displayName: "WORKOS PILOT DEMO SRL", owner: "proprietar@pilot-demo.test" },
  { key: "B", displayName: "WORKOS PILOT B SRL", owner: "proprietar@pilot-b.test" },
];

async function init(root = ROOT) {
  guardLocation(root);
  if (existsSync(root) && readdirSync(root).length > 0) fail("pilot_root_not_empty", `${root} exists and is not empty; init never reuses or migrates a directory`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, MARKER_FILE), `${JSON.stringify({ kind: "workos-pilot-e2e-n029", synthetic: true, realData: false, createdAt: new Date().toISOString(), commit: gitHead() }, null, 2)}\n`);
  const secrets = { schemaVersion: 1, classification: "SYNTHETIC_LOCAL_ONLY", accounts: {}, operatorPins: {} };
  for (const org of ORGANIZATIONS) {
    const secret = password();
    // Controlled bootstrap: first owner + organization + plane, through the platform CLI (password on stdin).
    const output = await runPnpm(["--filter", "@workos-final/api", "cloud:provision-organization", "--", "--root", root, "--org", org.displayName, "--email", org.owner, "--intent", "NEW_ORGANIZATION", "--confirm-controlled-provision", "--password-stdin"], { stdin: `${secret}\n`, quiet: true });
    const organizationId = output.match(/organizationId: (\S+)/)?.[1] ?? null;
    secrets.accounts[`owner${org.key}`] = { email: org.owner, password: secret, organizationId, displayName: org.displayName };
    appendLedger(root, { step: "bootstrap", organization: org.displayName, organizationId, via: "pnpm cloud:provision-organization (controlled CLI)" });
  }
  writeFileSync(secretsPath(root), `${JSON.stringify(secrets, null, 2)}\n`);
  console.log(`N-029 initialized: ${root} (${ORGANIZATIONS.length} synthetic organizations, credentials in pilot-e2e-secrets.json — not printed)`);
}

async function start(root = ROOT, port = PORT) {
  guardOwned(root);
  const base = `http://${HOST}:${port}`;
  if (ownedPid(root, port) && (await health(base))) { console.log(`already running ${base}`); return; }
  const occupants = listenerPids(port);
  if (occupants.length) fail("pilot_port_occupied", `port ${port} pids ${occupants.join(",")} — not ours, not touched`);
  if (!existsSync(join(repoRoot, "dist", "index.html"))) await runPnpm(["build"]);
  const log = openSync(logPath(root), "a");
  const child = pnpm(["--filter", "@workos-final/api", "start", "--", PROCESS_MARKER], { env: apiEnv(root, port), detached: true, stdio: ["ignore", log, log] });
  child.unref();
  closeSync(log);
  for (let i = 0; i < 90 && !(await health(base)); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await health(base))) fail("pilot_api_unhealthy", `see ${logPath(root)}`);
  const pid = listenerPids(port).find((p) => commandLineFor(p).includes(PROCESS_MARKER)) ?? child.pid;
  writeFileSync(pidPath(root), `${JSON.stringify({ kind: "workos-pilot-e2e-n029", pid, port, root, url: base, startedAt: new Date().toISOString(), commit: gitHead() }, null, 2)}\n`);
  appendLedger(root, { step: "start", url: base, pid });
  console.log(`PILOT_E2E_URL = ${base}\nPILOT_E2E_ROOT = ${root}\nPID = ${pid}\nCODE = ${gitHead()}`);
}

function stop(root = ROOT, port = PORT) {
  guardOwned(root);
  const pid = ownedPid(root, port);
  if (!pid) { console.log("no positively identified pilot API to stop"); return; }
  if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); } } // detached: whole process group
  unlinkSync(pidPath(root));
  appendLedger(root, { step: "stop", pid });
  console.log(`stopped pilot API pid ${pid}`);
}

/** Schema versions straight from the migrator ledgers (read-only). */
export function schema(root = ROOT) {
  guardOwned(root);
  const require = createRequire(join(repoRoot, "apps", "api", "package.json"));
  const Database = require("better-sqlite3");
  const read = (path) => { const db = new Database(path, { readonly: true, fileMustExist: true }); try { return db.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY id").all(); } finally { db.close(); } };
  const repoMigrations = (dir) => readdirSync(join(repoRoot, "apps", "api", "src", "persistence", dir)).filter((f) => f.endsWith(".sql")).sort();
  const control = read(join(root, "control", "control-plane.sqlite"));
  const planes = existsSync(join(root, "organizations")) ? readdirSync(join(root, "organizations")).map((key) => ({ planeKey: key, migrations: read(join(root, "organizations", key, "product-system.sqlite")) })) : [];
  const expected = { control: repoMigrations("control-plane-migrations"), operational: repoMigrations("migrations") };
  const result = {
    root, commit: gitHead(),
    control: { applied: control.map((m) => m.id), last: control.at(-1)?.id ?? null, matchesRepository: JSON.stringify(control.map((m) => m.id)) === JSON.stringify(expected.control) },
    planes: planes.map((p) => ({ planeKey: p.planeKey, appliedCount: p.migrations.length, last: p.migrations.at(-1)?.id ?? null, matchesRepository: JSON.stringify(p.migrations.map((m) => m.id)) === JSON.stringify(expected.operational) })),
    expected: { controlLast: expected.control.at(-1), operationalLast: expected.operational.at(-1), operationalCount: expected.operational.length },
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Quiesced backup only: the API must be stopped (online backup under writes is not supported). */
async function backup(root = ROOT) {
  guardOwned(root);
  if (ownedPid(root, PORT) || listenerPids(PORT).length) fail("pilot_backup_requires_stopped_api", "stop the API first (quiesced backup)");
  guardLocation(BACKUP_ROOT);
  const out = await runPnpm(["--filter", "@workos-final/api", "cloud:backup"], { env: { ...process.env, NODE_ENV: "development", WORKOS_CLOUD_ROOT: root, WORKOS_BACKUP_ROOT: BACKUP_ROOT }, quiet: true });
  const path = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /bkp-/.test(l) && !l.startsWith("{")).at(-1) ?? null;
  appendLedger(root, { step: "backup", backup: path });
  console.log(out.split(/\r?\n/).filter((l) => l.startsWith("{")).at(-1) ?? "");
  console.log(`BACKUP = ${path}`);
}

/** Restore into a NEW separate root only; the source root is never a target. */
async function restore(root = ROOT) {
  guardOwned(root);
  const target = flag("target");
  const from = flag("backup");
  if (!target || !from) fail("pilot_restore_args", "--backup <dir> --target <new root> are required");
  guardLocation(target);
  if (resolve(target).toLowerCase() === resolve(root).toLowerCase()) fail("pilot_restore_refused", "target equals the source root");
  if (existsSync(target) && readdirSync(target).length > 0) fail("pilot_restore_refused", "target exists and is not empty");
  const out = await runPnpm(["--filter", "@workos-final/api", "cloud:restore", "--", "--backup", from, "--target", target], { env: { ...process.env, NODE_ENV: "development" }, quiet: true });
  // The restored copy is a synthetic N-029 sibling: same marker semantics, its own ledger entry.
  writeFileSync(join(target, MARKER_FILE), `${JSON.stringify({ kind: "workos-pilot-e2e-n029", synthetic: true, realData: false, restoredFrom: from, restoredAt: new Date().toISOString() }, null, 2)}\n`);
  if (existsSync(secretsPath(root))) writeFileSync(secretsPath(target), readFileSync(secretsPath(root)));
  const journeyState = join(root, "pilot-e2e-state.json");
  if (existsSync(journeyState)) writeFileSync(join(target, "pilot-e2e-state.json"), readFileSync(journeyState));
  appendLedger(root, { step: "restore", backup: from, target });
  console.log(out.split(/\r?\n/).filter((l) => l.startsWith("{")).at(-1) ?? "");
  console.log(`RESTORED = ${target}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const command = process.argv[2];
  if (process.env.NODE_ENV === "production") fail("pilot_e2e_production_refused");
  switch (command) {
    case "init": await init(); break;
    case "start": await start(); break;
    case "stop": stop(); break;
    case "status": guardOwned(ROOT); console.log(JSON.stringify({ root: ROOT, url: BASE, running: Boolean(ownedPid()), healthy: await health(), pid: readJson(pidPath(ROOT))?.pid ?? null }, null, 2)); break;
    case "schema": schema(); break;
    case "backup": await backup(); break;
    case "restore": await restore(); break;
    default: fail("usage", "node scripts/pilot-e2e.mjs <init|start|stop|status|schema|backup|restore> [--root DIR] [--port N]");
  }
}
