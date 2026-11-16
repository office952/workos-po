// V1 · CF-04 rollback drill on a disposable SYNTHETIC copy.
// Phase "probe": against whichever build is running at --base, record what each actor can do.
// Usage: node rollback-drill.mjs --base URL --root <copy> --users <scoped users json> --label <name> --out <file>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const base = arg("base"); const root = arg("root"); const out = arg("out"); const label = arg("label");
const identity = JSON.parse(readFileSync(`${root}/.reference-identity.json`, "utf8"));
const scoped = JSON.parse(readFileSync(arg("users"), "utf8"));
const sessionsFile = arg("sessions");

async function login(email, password) {
  const r = await fetch(`${base}/api/cloud/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, error: body.error ?? null, cookie: r.status === 200 ? (r.headers.get("set-cookie") ?? "").split(";")[0] : null, role: body.organization?.role ?? null };
}
const get = async (cookie, path) => (cookie ? (await fetch(base + path, { headers: { cookie } })).status : null);
const PATHS = ["/api/customers", "/api/quotes", "/api/jobs", "/api/admin/access"];
const result = { label, base, actors: {} };
const actors = {
  owner: { email: identity.users.owner.email, password: identity.password },
  member: { email: identity.users.production.email, password: identity.password },
  production: scoped.production,
  workshop: scoped.workshop,
};
// Sessions opened under the previous build (cookies kept only in a scratch file, never in evidence).
const previous = sessionsFile && existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile, "utf8")) : {};
const fresh = {};
for (const [name, cred] of Object.entries(actors)) {
  const l = await login(cred.email, cred.password);
  fresh[name] = l.cookie;
  const access = {};
  for (const p of PATHS) access[p] = await get(l.cookie, p);
  const carried = {};
  if (previous[name]) for (const p of PATHS) carried[p] = await get(previous[name], p);
  result.actors[name] = { login: l.status, loginError: l.error, role: l.role, freshSession: access, sessionOpenedBeforeSwitch: previous[name] ? carried : "n/a" };
}
if (sessionsFile) writeFileSync(sessionsFile, JSON.stringify(fresh));
const ownerAccess = fresh.owner ? await (await fetch(`${base}/api/admin/access`, { headers: { cookie: fresh.owner } })).json() : null;
result.ownerAccessList = (ownerAccess?.members ?? []).map((m) => ({ role: m.role, status: m.status }));
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.actors));
