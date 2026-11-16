// Pilot Readiness E2E V1 · browser journey on a synthetic runtime created by scripts/pilot-e2e.mjs.
// AUTH → ORGANIZATION → CLIENT → REQUEST → CONFIGURATOR → QUOTE → ACCEPTANCE → JOB → RELEASE → PLAN →
// ATELIER → EXECUTION → QC → FINALIZATION → PLANNED VS ACTUAL, plus roles, isolation and modularity.
// Real UI, real API, real engine; nothing is computed by the test itself.
// Usage: node e2e/pilot/pilot-journey.mjs --base URL --root DIR --evidence DIR [--chrome EXE] [--steps a,b,c]
// Credentials: read from <root>/pilot-e2e-secrets.json; new ones are generated and written back there
// (outside Git). They are never printed, logged or captured (secret guard on every capture).
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSuite, sleep } from "./ui.mjs";
import { STEPS } from "./steps.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const BASE = arg("base");
const ROOT = arg("root");
const EVIDENCE = arg("evidence");
const CHROME = arg("chrome") ?? process.env.WORKOS_E2E_CHROME ?? (process.platform === "win32" ? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1248/chrome-win64/chrome.exe` : "/usr/bin/google-chrome");
const PROFILES = arg("profiles") ?? `${EVIDENCE}/.profiles`;
if (!BASE || !ROOT || !EVIDENCE) { console.error("usage: --base URL --root DIR --evidence DIR"); process.exit(2); }

const secretsFile = `${ROOT}/pilot-e2e-secrets.json`;
const stateFile = `${ROOT}/pilot-e2e-state.json`;
const secrets = JSON.parse(readFileSync(secretsFile, "utf8"));
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { steps: {} };
// Transient values (one-time links, tokens) live only in memory, for the capture guard.
const saveSecrets = () => { const { transient, ...persisted } = secrets; void transient; writeFileSync(secretsFile, `${JSON.stringify(persisted, null, 2)}\n`); };
const saveState = () => writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
const allSecrets = () => [
  ...Object.values(secrets.accounts).map((a) => a.password),
  ...Object.values(secrets.operatorPins ?? {}),
  ...(secrets.transient ?? []),
];
const suite = createSuite({ base: BASE, evidence: EVIDENCE, chrome: CHROME, profiles: PROFILES, secrets: allSecrets });
const ctx = {
  suite, state, secrets, saveSecrets, saveState, sleep,
  check: suite.check,
  newPassword: () => `${randomBytes(12).toString("base64url")}7a`,
  newPin: () => String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 89_999_999)),
  remember(value) { secrets.transient = [...(secrets.transient ?? []), value]; },
};

const only = arg("steps")?.split(",") ?? null;
let failed = null;
for (const step of STEPS) {
  if (only && !only.includes(step.id)) continue;
  if (!only && step.explicitOnly) continue;
  if (!only && state.steps[step.id]?.done) { console.log(`skip ${step.id} (done ${state.steps[step.id].at})`); continue; }
  console.log(`\n=== ${step.id}: ${step.title}`);
  try {
    const result = await step.run(ctx);
    state.steps[step.id] = { done: true, at: new Date().toISOString(), ...(result ?? {}) };
    saveState();
  } catch (error) {
    failed = step.id;
    suite.check(`${step.id} completed`, false, String(error?.stack ?? error).slice(0, 600));
    break;
  }
}
// Transient values (tokens, one-time links) are never persisted.
delete secrets.transient;
saveSecrets();
const ok = suite.write(`journey_results${only ? `_${only.join("-")}` : ""}.json`, { failedStep: failed, state });
process.exitCode = ok && !failed ? 0 : 1;
