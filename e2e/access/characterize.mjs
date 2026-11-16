// V1 Organization Access · S0/S5 characterization against a running SYNTHETIC API.
// Usage: node e2e/access/characterize.mjs --base http://127.0.0.1:PORT --root <synthetic root> --out <file.json>
//        [--orgb-email x --orgb-secret-file f] [--roles owner,member,anon,foreign,production,workshop]
// Credentials are read from the synthetic root identity file and never printed or written.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (name, fallback = null) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const base = arg("base");
const root = arg("root");
const out = arg("out");
const inventory = JSON.parse(readFileSync(fileURLToPath(new URL("../../apps/api/tests/fixtures/api-route-inventory.json", import.meta.url)), "utf8"));
const identity = JSON.parse(readFileSync(`${root}/.reference-identity.json`, "utf8"));
const extraUsers = arg("extra-users") ? JSON.parse(readFileSync(arg("extra-users"), "utf8")) : {};

const VOLATILE = new Set(["asOf", "generatedAt", "now", "serverTime", "expiresAt", "lastSeenAt", "sessionId", "session", "checkedAt", "evaluatedAt", "milliseconds", "totalLabel", "hours", "elapsedLabel", "activeDurationLabel", "durationLabel", "runningLabel", "openForLabel"]);
const SKIP = new Set(["POST /api/cloud/login", "POST /api/cloud/logout", "POST /api/cloud/active-organization", "DELETE /api/operator-session", "POST /api/dev/operator-session"]);

async function login(email, password) {
  const r = await fetch(`${base}/api/cloud/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: r.status, cookie: r.status === 200 ? cookie : "" };
}
const call = async (cookie, method, path, body) => {
  const headers = { Origin: base, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) };
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const ct = (r.headers.get("content-type") ?? "").split(";")[0];
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  if (ct.includes("json")) { try { json = JSON.parse(buf.toString("utf8")); } catch { /* */ } }
  return { status: r.status, ct, json, bytes: buf.length, cacheControl: r.headers.get("cache-control"), raw: ct.includes("json") ? null : buf };
};

const shapeOf = (v, path = "$", acc = new Set()) => {
  if (Array.isArray(v)) { acc.add(`${path}[]`); for (const x of v.slice(0, 50)) shapeOf(x, `${path}[]`, acc); return acc; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) shapeOf(x, `${path}.${k}`, acc); return acc; }
  acc.add(`${path}:${v === null ? "null" : typeof v}`); return acc;
};
const stable = (v) => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().filter((k) => !VOLATILE.has(k)).map((k) => [k, stable(v[k])]));
  return v;
};
const MONEY = /^(netPrice|grossPrice|vatAmount|grossDisplay|netDisplay|discountAmount|adjustmentAmount|manualNetPrice|markupPercent|markupAmount|marginAmount|internalCost|eic|eicTotal|rate|cost|amount|plannedCost|actualCost|unitCost|price|total|totals)$/;
const moneyValues = (v, path = "$", acc = []) => {
  if (Array.isArray(v)) { v.forEach((x, i) => moneyValues(x, `${path}[${i}]`, acc)); return acc; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) { if (MONEY.test(k) && (typeof x === "number" || typeof x === "string")) acc.push(`${path}.${k}=${x}`); moneyValues(x, `${path}.${k}`, acc); } return acc; }
  return acc;
};
const digest = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// IDs from the owner's view
const owner = await login(identity.users.owner.email, identity.password);
const g = async (p) => (await call(owner.cookie, "GET", p)).json;
const ids = {};
const customers = (await g("/api/customers"))?.customers ?? [];
ids.customerId = customers[0]?.customerId;
const requests = (await g("/api/requests"))?.overview?.requests ?? [];
ids.requestId = requests[0]?.requestId;
const quotes = (await g("/api/quotes"))?.overview?.quotes ?? [];
const pq = quotes.find((q) => q.kind === "PRODUCT" && q.acceptanceId) ?? quotes.find((q) => q.kind === "PRODUCT");
const aq = quotes.find((q) => q.kind === "ASSEMBLY");
ids.productCode = pq?.productCode; ids.quoteSnapshotId = pq?.quoteSnapshotId; ids.orderSnapshotId = pq?.orderSnapshotId;
ids.assemblyId = aq?.assemblyId;
const jobs = (await g("/api/jobs"))?.overview?.jobs ?? [];
const job = jobs.find((j) => j.planId && j.kind !== "ASSEMBLY") ?? jobs[0];
ids.jobId = job?.jobId; ids.planId = job?.planId;
const plan = ids.planId ? (await g(`/api/execution-plans/${encodeURIComponent(ids.planId)}`))?.executionPlan : null;
ids.taskId = plan?.tasks?.[0]?.taskId;
const people = (await g("/api/people")) ?? {};
ids.personId = people.people?.[0]?.personId; ids.skillId = people.skills?.[0]?.skillId ?? people.registry?.skills?.[0]?.skillId;
const wcPayload = (await g("/api/workcenters")) ?? {};
const wcs = wcPayload.workcenters ?? [];
ids.workcenterId = wcs[0]?.workcenterId ?? wcs[0]?.id;
ids.machineId = wcPayload.machines?.[0]?.machineId ?? wcPayload.machines?.[0]?.id;
const fill = (path) => path.replace(/:([A-Za-z]+)/g, (_, k) => encodeURIComponent(ids[k] ?? (k === "role" ? "PANEL" : `x-${k}`)));

const sessions = {};
const wanted = (arg("roles") ?? "owner,member,anon,foreign").split(",");
for (const role of wanted) {
  if (role === "anon") { sessions.anon = ""; continue; }
  if (role === "owner") { sessions.owner = owner.cookie; continue; }
  if (role === "member") { const s = await login(identity.users.production.email, identity.password); sessions.member = s.cookie; continue; }
  if (role === "foreign") { const s = await login(arg("orgb-email"), readFileSync(arg("orgb-secret-file"), "utf8").trim()); sessions.foreign = s.cookie; continue; }
  if (extraUsers[role]) { const s = await login(extraUsers[role].email, extraUsers[role].password ?? identity.password); sessions[role] = s.cookie; continue; }
}

const rows = [];
const ordered = [...inventory.filter((r) => r.startsWith("GET ")), ...inventory.filter((r) => !r.startsWith("GET "))];
for (const entry of ordered) {
  if (SKIP.has(entry)) continue;
  const [method, path] = entry.split(" ");
  const concrete = fill(path);
  const row = { route: entry, path: concrete, results: {} };
  for (const [role, cookie] of Object.entries(sessions)) {
    const r = await call(cookie, method, concrete, method === "GET" ? undefined : {});
    const res = { status: r.status, ct: r.ct, cacheControl: r.cacheControl };
    if (r.json !== null) {
      res.shape = digest([...shapeOf(r.json)].sort().join("\n"));
      res.body = method === "GET" ? digest(JSON.stringify(stable(r.json))) : null;
      res.money = moneyValues(r.json).length;
      res.error = typeof r.json?.error === "string" ? r.json.error : undefined;
    } else if (r.raw) { res.bytes = r.bytes; res.body = digest(r.raw.toString("base64")); }
    row.results[role] = res;
  }
  rows.push(row);
}
writeFileSync(out, JSON.stringify({ base, ids: Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v ? "set" : "missing"])), routes: rows.length, rows }, null, 2));
console.log(`characterized ${rows.length} routes × ${Object.keys(sessions).length} actors → ${out}`);
