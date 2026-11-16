// V1 · CF-10 confidentiality scan on a running SYNTHETIC API. For each role, fetch every GET route the
// role may read (status 200) with concrete IDs and inspect VALUES and structures:
//  - forbidden keys with a non-null value (client price, internal cost, bank/billing terms);
//  - any string that looks like a money amount (e.g. "605,00 EUR", "1.234 lei").
// Usage: node leak-scan.mjs --base URL --root <root> --users <scoped users json> --out <file>
import { readFileSync, writeFileSync } from "node:fs";
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const base = arg("base"); const root = arg("root"); const out = arg("out");
const identity = JSON.parse(readFileSync(`${root}/.reference-identity.json`, "utf8"));
const scoped = JSON.parse(readFileSync(arg("users"), "utf8"));
const inventory = JSON.parse(readFileSync(new URL("../../apps/api/tests/fixtures/api-route-inventory.json", import.meta.url), "utf8"));

const FORBIDDEN_KEYS = new Set([
  "netPrice", "grossPrice", "vatAmount", "grossDisplay", "netDisplay", "vatDisplay", "discountAmount", "discountPercent",
  "adjustmentAmount", "manualNetPrice", "markupPercent", "markupAmount", "marginAmount", "marginValue", "internalCost",
  "internalCostTotal", "eicTotal", "actualInternalCost", "plannedCost", "actualCost", "unitCost", "customerPrice",
  "commercialPrice", "iban", "bankAccount", "bank", "billingAddress", "billingContactName", "billingContactEmail",
  "billingContactPhone", "paymentTermDays", "advancePercent", "commercialTerms", "fiscalId",
]);
const MONEY_TEXT = /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s?(?:EUR|RON|lei|€)\b/i;

const login = async (email, password) => {
  const r = await fetch(`${base}/api/cloud/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
};
const owner = await login(identity.users.owner.email, identity.password);
const g = async (cookie, p) => { const r = await fetch(base + p, { headers: { cookie } }); const ct = r.headers.get("content-type") ?? ""; return { status: r.status, ct, json: ct.includes("json") ? await r.json() : null, text: ct.includes("json") ? "" : (await r.text()).slice(0, 2000) }; };

// Concrete IDs (from the owner's view).
const ids = {};
const customers = (await g(owner, "/api/customers")).json?.customers ?? [];
ids.customerId = customers[0]?.customerId;
const requests = (await g(owner, "/api/requests")).json?.overview?.requests ?? [];
ids.requestId = requests.find((r) => r.quoteCount)?.requestId ?? requests[0]?.requestId;
const jobs = (await g(owner, "/api/jobs")).json?.overview?.jobs ?? [];
const quotes = (await g(owner, "/api/quotes")).json?.overview?.quotes ?? [];
const pq = quotes.find((q) => q.kind === "PRODUCT" && q.acceptanceId);
Object.assign(ids, { productCode: pq?.productCode, quoteSnapshotId: pq?.quoteSnapshotId, orderSnapshotId: pq?.orderSnapshotId, assemblyId: quotes.find((q) => q.kind === "ASSEMBLY")?.assemblyId });
const people = (await g(owner, "/api/people")).json ?? {};
ids.personId = people.people?.[0]?.personId;
const wc = (await g(owner, "/api/workcenters")).json ?? {};
ids.workcenterId = wc.workcenters?.[0]?.id; ids.machineId = wc.machines?.[0]?.id;
const fill = (p, extra) => p.replace(/:([A-Za-z]+)/g, (_, k) => encodeURIComponent(extra[k] ?? ids[k] ?? `x-${k}`));

const findings = [];
const scan = (role, route, value, path = "$") => {
  if (Array.isArray(value)) { value.forEach((x, i) => scan(role, route, x, `${path}[${i}]`)); return; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k) && v !== null && v !== undefined && !(typeof v === "object" && Object.keys(v).length === 0)) findings.push({ role, route, path: `${path}.${k}`, kind: "forbidden_key", sample: typeof v === "object" ? "object" : String(v).slice(0, 40) });
      // `eic` is also a plain availability label in catalogue answers; only an amount is a leak.
      if (k === "eic" && v !== null && typeof v !== "string") findings.push({ role, route, path: `${path}.${k}`, kind: "forbidden_key", sample: typeof v });
      scan(role, route, v, `${path}.${k}`);
    }
    return;
  }
  if (typeof value === "string" && MONEY_TEXT.test(value)) findings.push({ role, route, path, kind: "money_text", sample: value.slice(0, 60) });
};

const report = { base, roles: {}, findings };
for (const role of ["production", "workshop"]) {
  const cookie = await login(scoped[role].email, scoped[role].password);
  // Every job the role can see (plans included) to cover more objects.
  const roleJobs = (await g(cookie, "/api/jobs")).json?.overview?.jobs ?? [];
  const targets = roleJobs.length ? roleJobs : jobs;
  let checked = 0; let allowed = 0;
  for (const entry of inventory.filter((r) => r.startsWith("GET "))) {
    const path = entry.slice(4);
    const variants = path.includes(":jobId") || path.includes(":planId")
      ? targets.filter((j) => j.planId || !path.includes(":planId")).slice(0, 12).map((j) => ({ jobId: j.jobId, planId: j.planId }))
      : [{}];
    for (const extra of variants) {
      const concrete = fill(path, extra);
      const r = await g(cookie, concrete);
      checked++;
      if (r.status !== 200) continue;
      allowed++;
      if (r.json) scan(role, entry, r.json);
      else if (MONEY_TEXT.test(r.text)) findings.push({ role, route: entry, path: "$body", kind: "money_text", sample: "non-JSON body" });
    }
  }
  // Task dossiers of the visible plans.
  for (const job of targets.filter((j) => j.planId).slice(0, 6)) {
    const plan = (await g(cookie, `/api/execution-plans/${encodeURIComponent(job.planId)}`)).json?.executionPlan;
    for (const task of (plan?.tasks ?? []).slice(0, 8)) {
      const r = await g(cookie, `/api/execution-tasks/${encodeURIComponent(task.taskId)}/dossier`);
      checked++;
      if (r.status === 200) { allowed++; scan(role, "GET /api/execution-tasks/:taskId/dossier", r.json); }
    }
  }
  // Mutating routes the role may call: their answers (success or refusal) must not leak either.
  // Runs only against a disposable synthetic copy.
  let mutating = 0;
  for (const entry of inventory.filter((r) => !r.startsWith("GET ") && !/\/api\/cloud\/(login|logout|active-organization)|operator-session|\/api\/account\//.test(r))) {
    const [method, path] = entry.split(" ");
    const job = targets.find((j) => j.planId);
    const concrete = fill(path, job ? { jobId: job.jobId, planId: job.planId } : {});
    const r = await fetch(base + concrete, { method, headers: { cookie, Origin: base, "Content-Type": "application/json" }, body: "{}" });
    const ct = r.headers.get("content-type") ?? "";
    if (r.status === 403) continue;
    mutating++;
    if (ct.includes("json")) scan(role, entry, await r.json().catch(() => null));
  }
  report.roles[role] = { requestsChecked: checked, allowed, visibleJobs: roleJobs.length, mutatingAnswersScanned: mutating };
}
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.roles), "findings", findings.length);
for (const f of findings.slice(0, 40)) console.log(JSON.stringify(f));
