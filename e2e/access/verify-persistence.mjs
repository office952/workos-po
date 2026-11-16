// V1 · closure A: after an API restart, re-read (as owner) the operation completed by the Atelier account.
// Usage: node verify-persistence.mjs --base URL --root <synthetic root> --context <closure context json> --out FILE
import { readFileSync, writeFileSync } from "node:fs";
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const base = arg("base");
const identity = JSON.parse(readFileSync(`${arg("root")}/.reference-identity.json`, "utf8"));
const context = JSON.parse(readFileSync(arg("context"), "utf8"));
const login = await fetch(`${base}/api/cloud/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: identity.users.owner.email, password: identity.password }) });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const get = async (p) => { const r = await fetch(`${base}${p}`, { headers: { cookie } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const plan = await get(`/api/execution-plans/${encodeURIComponent(context.planId)}`);
const task = (plan.body?.tasks ?? plan.body?.executionPlan?.tasks ?? []).find((t) => t.taskId === context.taskId);
const dossier = await get(`/api/execution-tasks/${encodeURIComponent(context.taskId)}/dossier`);
const record = await get(`/api/jobs/${encodeURIComponent(context.jobId)}/record`);
const results = [
  { name: "P1 after API restart the operation is still COMPLETED", pass: task?.status === "COMPLETED", detail: task?.status ?? null },
  { name: "P2 completion time and work session survive the restart", pass: Boolean(task?.completedAt) && (task?.workSessions ?? []).length >= 1, detail: { completedAt: Boolean(task?.completedAt), sessions: (task?.workSessions ?? []).length } },
  { name: "P3 the observation survives the restart", pass: JSON.stringify(dossier.body ?? {}).includes("Foaie verificată înainte de debitare"), detail: dossier.status },
  { name: "P4 the job record (owner view) contains the completion", pass: record.status === 200 && JSON.stringify(record.body).includes(context.taskId), detail: record.status },
];
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} :: ${JSON.stringify(r.detail)}`);
writeFileSync(arg("out"), JSON.stringify({ base, loginStatus: login.status, results }, null, 2));
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
