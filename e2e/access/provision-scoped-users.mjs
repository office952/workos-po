// Creates synthetic Production and Workshop users through the REAL V1 invitation flow (owner invites,
// recipient accepts). Usage: node provision-scoped-users.mjs --base URL --root <synthetic root>
//   --outbox <dir> --out <users.json (secret, outside the repo)>
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const base = arg("base"); const root = arg("root"); const outbox = arg("outbox"); const out = arg("out");
const identity = JSON.parse(readFileSync(`${root}/.reference-identity.json`, "utf8"));
const login = async (email, password) => {
  const r = await fetch(`${base}/api/cloud/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
};
const owner = await login(identity.users.owner.email, identity.password);
const users = {};
for (const [key, role] of [["production", "production"], ["workshop", "workshop"]]) {
  const email = `${key}.v1@workos.test`;
  const password = `${randomBytes(12).toString("base64url")}7a`; // policy: letters + a digit
  const invited = await fetch(`${base}/api/admin/access/invitations`, { method: "POST", headers: { cookie: owner, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
  const body = await invited.json();
  if (invited.status !== 201) throw new Error(`invite ${role}: ${invited.status} ${body.error}`);
  let url = body.inviteUrl;
  if (!url && outbox) {
    const messages = readdirSync(outbox).sort().map((name) => JSON.parse(readFileSync(join(outbox, name), "utf8")));
    url = messages.filter((m) => m.kind === "INVITATION" && m.to === email).pop()?.url;
  }
  const token = decodeURIComponent(String(url).split("#t=")[1]);
  const accepted = await fetch(`${base}/api/cloud/invitations/accept`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token, mode: "new", password }) });
  if (accepted.status !== 200) throw new Error(`accept ${role}: ${accepted.status}`);
  users[key] = { email, password, role };
  console.log(`provisioned ${role} via invitation (${body.invitation.deliveryChannel}/${body.invitation.deliveryStatus})`);
}
writeFileSync(out, JSON.stringify(users, null, 2));
