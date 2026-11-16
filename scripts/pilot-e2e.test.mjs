// Pilot Readiness E2E V1 · launcher guards. Every refusal happens before any provisioning or process start.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(repoRoot, "scripts", "pilot-e2e.mjs");
const base = mkdtempSync(join(tmpdir(), "pilot-guard-"));
const run = (args, env = {}) => spawnSync(process.execPath, [launcher, ...args], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, WORKOS_PILOT_E2E_ALLOW_TEMP: "1", ...env } });
const refused = (r, code) => { assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, new RegExp(code)); };

test.after(() => rmSync(base, { recursive: true, force: true }));

test("init refuses a root inside the repository", () => refused(run(["init", "--root", join(repoRoot, "evidence", "x")]), "pilot_root_refused"));

test("init refuses the configured real WORKOS_CLOUD_ROOT", () => {
  const real = join(base, "real-cloud");
  refused(run(["init", "--root", real], { WORKOS_CLOUD_ROOT: real }), "pilot_root_refused");
  assert.equal(readdirSync(base).includes("real-cloud"), false);
});

test("init refuses protected historical environment names", () => {
  for (const name of ["N-028_alpha", "demo-alpha-current-main", "N-019_atelier", "n-020-dossier"]) refused(run(["init", "--root", join(base, name)]), "pilot_root_refused");
});

test("init refuses the temporary directory unless explicitly allowed (CI)", () => refused(run(["init", "--root", join(base, "t")], { WORKOS_PILOT_E2E_ALLOW_TEMP: "0" }), "pilot_root_refused"));

test("init never reuses or migrates a non-empty directory", () => {
  const existing = join(base, "existing");
  mkdirSync(existing); writeFileSync(join(existing, "something.sqlite"), "");
  refused(run(["init", "--root", existing]), "pilot_root_not_empty");
});

test("commands refuse a root without the pilot marker or with a foreign marker", () => {
  const unmarked = join(base, "unmarked"); mkdirSync(unmarked);
  for (const cmd of ["start", "stop", "status", "schema", "backup"]) refused(run([cmd, "--root", unmarked]), "pilot_root_not_owned");
  const foreign = join(base, "foreign"); mkdirSync(foreign);
  writeFileSync(join(foreign, "PILOT_E2E_N029"), "{}"); writeFileSync(join(foreign, "DEMO_ATELIER_N019"), "");
  refused(run(["status", "--root", foreign]), "pilot_root_refused");
});

test("restore only targets a new, empty, separate root", () => {
  const src = join(base, "src"); mkdirSync(src); writeFileSync(join(src, "PILOT_E2E_N029"), "{}");
  refused(run(["restore", "--root", src, "--backup", join(base, "b"), "--target", src]), "pilot_restore_refused");
  const busy = join(base, "busy"); mkdirSync(busy); writeFileSync(join(busy, "x"), "");
  refused(run(["restore", "--root", src, "--backup", join(base, "b"), "--target", busy]), "pilot_restore_refused");
  refused(run(["restore", "--root", src]), "pilot_restore_args");
});

test("production mode is refused outright", () => refused(run(["status"], { NODE_ENV: "production" }), "pilot_e2e_production_refused"));
