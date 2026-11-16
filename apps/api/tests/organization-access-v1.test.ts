import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changePassword, resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { routePolicyFor, ROUTE_POLICY } from "../src/cloud/routePolicy.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  cloudCookie,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
  MEMBER_PASSWORD,
  type CloudFixture,
} from "./cloud-harness.js";
import { registeredApiRoutes } from "./route-inventory-helper.js";

/**
 * V1 Organization Access — lifecycle and security (contract WORKOS_V1_ORGANIZATION_ACCESS_CONTRACT,
 * TEST_AND_ACCEPTANCE_MATRIX.md scenarios 1–12 and CF-02…CF-11, Owner corrections C1 and C2).
 * Synthetic, isolated control planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
const NEW_PASSWORD = "NouaParola123";

type Json = Record<string, unknown>;

async function call(fixture: CloudFixture, cookie: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fixture.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json: Json | null = null;
  try { json = text ? (JSON.parse(text) as Json) : null; } catch { json = null; }
  return { status: response.status, json, response, text };
}

function tokenFromUrl(url: unknown): string {
  const value = String(url ?? "");
  const match = value.match(/#t=([^&]+)/);
  if (!match) throw new Error(`no token in ${value}`);
  return decodeURIComponent(match[1]);
}

async function setup(env: NodeJS.ProcessEnv = {}) {
  const fixture = createCloudFixture({ env: { NODE_ENV: "test", ...env } });
  const { organization: orgA } = await addOrganization(fixture, "Firma A");
  const { organization: orgB } = await addOrganization(fixture, "Firma B");
  const owner = await addUser(fixture, { email: "owner@a.test", password: OWNER_PASSWORD, organizationId: orgA.organizationId, role: "owner" });
  const member = await addUser(fixture, { email: "member@a.test", password: MEMBER_PASSWORD, organizationId: orgA.organizationId, role: "member" });
  const ownerB = await addUser(fixture, { email: "owner@b.test", password: OWNER_PASSWORD, organizationId: orgB.organizationId, role: "owner" });
  const ownerCookie = (await loginCloud(fixture.app, "owner@a.test", OWNER_PASSWORD)).cookie as string;
  const ownerBCookie = (await loginCloud(fixture.app, "owner@b.test", OWNER_PASSWORD)).cookie as string;
  return { fixture, orgA, orgB, owner, member, ownerB, ownerCookie, ownerBCookie };
}

async function inviteAndAccept(ctx: Awaited<ReturnType<typeof setup>>, email: string, role: string, password = "ParolaNoua123") {
  const invited = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email, role });
  expect(invited.status).toBe(201);
  const token = tokenFromUrl(invited.json?.inviteUrl);
  const accepted = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password });
  expect(accepted.status).toBe(200);
  return { cookie: cloudCookie(accepted.response), token, password };
}

beforeEach(() => {
  resetAccessRateLimits();
  resetCloudLoginAttemptGuard();
});
afterEach(() => cleanupCloudTemps());

describe("route policy covers every registered route (deny by default for scoped roles)", () => {
  it("has an entry for each /api route", () => {
    const fixture = createCloudFixture();
    try {
      const missing = registeredApiRoutes(fixture.app).filter((route) => !(route in ROUTE_POLICY));
      expect(missing).toEqual([]);
      expect(routePolicyFor("GET", "/api/assemblies/offering")?.key).toBe("GET /api/assemblies/offering");
    } finally {
      fixture.close();
    }
  });
});

describe("invitations (D1, D6, scenario 8, 9, 11)", () => {
  it("creates a single-use invitation for a new identity and signs the recipient in", async () => {
    const ctx = await setup();
    const { cookie, token } = await inviteAndAccept(ctx, "nou@a.test", "member");
    const session = await call(ctx.fixture, cookie, "GET", "/api/cloud/session");
    expect((session.json?.organization as Json).organizationId).toBe(ctx.orgA.organizationId);
    expect((session.json?.organization as Json).roleLabel).toBe("Comercial");
    expect(session.json?.memberships).toHaveLength(1);
    const reuse = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "AltaParola123" });
    expect(reuse.status).toBe(410);
    // The invitation expires in 7 days.
    const row = ctx.fixture.controlPlane.db.prepare(`SELECT created_at, expires_at, token_hash FROM organization_invitations`).get() as { created_at: string; expires_at: string; token_hash: Buffer };
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(row.token_hash.toString("utf8")).not.toContain(token);
    ctx.fixture.close();
  });

  it("answers identically whether the invited email has a global account or not (no enumeration)", async () => {
    const ctx = await setup();
    const existing = await call(ctx.fixture, ctx.ownerBCookie, "POST", "/api/admin/access/invitations", { email: "member@a.test", role: "member" });
    const fresh = await call(ctx.fixture, ctx.ownerBCookie, "POST", "/api/admin/access/invitations", { email: "nobody@b.test", role: "member" });
    expect(existing.status).toBe(201);
    expect(fresh.status).toBe(201);
    expect(Object.keys(existing.json as Json).sort()).toEqual(Object.keys(fresh.json as Json).sort());
    expect(Object.keys((existing.json?.invitation as Json)).sort()).toEqual(Object.keys((fresh.json?.invitation as Json)).sort());
    ctx.fixture.close();
  });

  it("attaches an existing identity in another organization without touching its password (scenario 9)", async () => {
    const ctx = await setup();
    const invited = await call(ctx.fixture, ctx.ownerBCookie, "POST", "/api/admin/access/invitations", { email: "member@a.test", role: "member" });
    const token = tokenFromUrl(invited.json?.inviteUrl);
    const asNew = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "Altceva12345" });
    expect(asNew.status).toBe(409);
    expect(asNew.json?.error).toBe("sign_in_required");
    const wrong = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "existing", password: "gresita12345" });
    expect(wrong.status).toBe(401);
    const ok = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "existing", password: MEMBER_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.json?.memberships).toHaveLength(2);
    // Password unchanged; login now asks which organization.
    const login = await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD);
    expect(login.response.status).toBe(409);
    expect(login.body.error).toBe("organization_selection_required");
    ctx.fixture.close();
  });

  it("refuses duplicate pending invitations and invitations to existing members", async () => {
    const ctx = await setup();
    expect((await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "member@a.test", role: "member" })).json?.error).toBe("already_member");
    await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "x@a.test", role: "member" });
    const again = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "X@a.test", role: "member" });
    expect(again.status).toBe(409);
    expect(again.json?.error).toBe("invitation_pending");
    expect((again.json?.reasons as string[])[0]).toContain("invitație în așteptare");
    ctx.fixture.close();
  });

  it("resend rotates the token; revoke kills it; expiry kills it", async () => {
    const ctx = await setup();
    const first = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "r@a.test", role: "member" });
    const invitationId = (first.json?.invitation as Json).invitationId as string;
    const oldToken = tokenFromUrl(first.json?.inviteUrl);
    const resent = await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/invitations/${encodeURIComponent(invitationId)}/resend`);
    const newToken = tokenFromUrl(resent.json?.inviteUrl);
    expect(newToken).not.toBe(oldToken);
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/invitations/preview", { token: oldToken })).status).toBe(410);
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/invitations/preview", { token: newToken })).status).toBe(200);
    await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/invitations/${encodeURIComponent(invitationId)}/revoke`);
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/invitations/preview", { token: newToken })).status).toBe(410);
    const third = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "e@a.test", role: "member" });
    ctx.fixture.controlPlane.db.prepare(`UPDATE organization_invitations SET expires_at = ? WHERE email = 'e@a.test'`).run(new Date(Date.now() - 1000).toISOString());
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token: tokenFromUrl(third.json?.inviteUrl), mode: "new", password: "ParolaNoua123" })).status).toBe(410);
    ctx.fixture.close();
  });

  it("parallel acceptance: exactly one wins", async () => {
    const ctx = await setup();
    const invited = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "par@a.test", role: "member" });
    const token = tokenFromUrl(invited.json?.inviteUrl);
    const results = await Promise.all([
      call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" }),
      call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua456" }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    // The loser is refused: the invitation is used (410) or the identity now exists (409).
    expect([409, 410]).toContain(statuses[1]);
    const users = ctx.fixture.controlPlane.db.prepare(`SELECT count(*) AS n FROM users WHERE email = 'par@a.test'`).get() as { n: number };
    expect(users.n).toBe(1);
    ctx.fixture.close();
  });

  it("re-invitation of a revoked user restores access with the NEW role, not the historical one (scenario 11)", async () => {
    const ctx = await setup({ WORKOS_ORG_ROLES_V1: "on" });
    const second = await addUser(ctx.fixture, { email: "owner2@a.test", password: OWNER_PASSWORD, organizationId: ctx.orgA.organizationId, role: "owner" });
    const membership = ctx.fixture.controlPlane.getMembershipForUserInOrganization(second.userId, ctx.orgA.organizationId)!;
    expect((await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(membership.membershipId)}/revoke`)).status).toBe(200);
    const invited = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "owner2@a.test", role: "workshop" });
    const accepted = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token: tokenFromUrl(invited.json?.inviteUrl), mode: "existing", password: OWNER_PASSWORD });
    expect(accepted.status).toBe(200);
    const after = ctx.fixture.controlPlane.getMembership(membership.membershipId)!;
    expect(after.role).toBe("workshop");
    expect(after.status).toBe("ACTIVE_SCOPED");
    ctx.fixture.close();
  });
});

describe("roles, flag, last owner, revocation (D3–D5, scenarios 6, 7, 10, CF-05)", () => {
  it("refuses the scoped roles while WORKOS_ORG_ROLES_V1 is off (default)", async () => {
    const ctx = await setup();
    const invite = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "w@a.test", role: "workshop" });
    expect(invite.status).toBe(409);
    expect(invite.json?.error).toBe("roles_not_enabled");
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    const change = await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/role`, { role: "production" });
    expect(change.json?.error).toBe("roles_not_enabled");
    ctx.fixture.close();
  });

  it("a role change applies at the next request (scenario 10) and stores role and status together", async () => {
    const ctx = await setup({ WORKOS_ORG_ROLES_V1: "on" });
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/customers")).status).toBe(200);
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    expect((await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/role`, { role: "workshop" })).status).toBe(200);
    expect(ctx.fixture.controlPlane.getMembership(memberRow.membershipId)!.status).toBe("ACTIVE_SCOPED");
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/customers")).status).toBe(403);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/quotes")).status).toBe(403);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/jobs")).status).toBe(200);
    const session = await call(ctx.fixture, memberCookie, "GET", "/api/cloud/session");
    expect((session.json?.organization as Json).capabilities).toEqual(["jobs.read", "execution.operate"]);
    ctx.fixture.close();
  });

  it("protects the last owner against revocation and demotion, including concurrent attempts (scenario 6)", async () => {
    const ctx = await setup({ WORKOS_ORG_ROLES_V1: "on" });
    const ownerRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.owner.userId, ctx.orgA.organizationId)!;
    expect((await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(ownerRow.membershipId)}/revoke`)).status).toBe(409);
    expect((await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(ownerRow.membershipId)}/role`, { role: "member" })).status).toBe(409);
    const second = await addUser(ctx.fixture, { email: "owner2@a.test", password: OWNER_PASSWORD, organizationId: ctx.orgA.organizationId, role: "owner" });
    const secondRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(second.userId, ctx.orgA.organizationId)!;
    const results = await Promise.all([
      call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(ownerRow.membershipId)}/role`, { role: "member" }),
      call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(secondRow.membershipId)}/revoke`),
    ]);
    expect(ctx.fixture.controlPlane.countOwnerMemberships(ctx.orgA.organizationId)).toBe(1);
    expect(results.some((r) => r.status === 409)).toBe(true);
    ctx.fixture.close();
  });

  it("revocation cuts an active session immediately and keeps history (scenario 7)", async () => {
    const ctx = await setup();
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/revoke`);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/customers")).status).toBe(401);
    expect(ctx.fixture.controlPlane.getUser(ctx.member.userId)).not.toBeNull();
    const events = await call(ctx.fixture, ctx.ownerCookie, "GET", "/api/admin/access/events");
    expect((events.json?.events as Json[]).map((e) => e.action)).toContain("membership.revoked");
    ctx.fixture.close();
  });

  it("an organization owner cannot touch another organization's memberships or invitations (cross-tenant)", async () => {
    const ctx = await setup();
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    const invite = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "t@a.test", role: "member" });
    const invitationId = (invite.json?.invitation as Json).invitationId as string;
    for (const [method, path, body] of [
      ["POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/revoke`, undefined],
      ["POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/role`, { role: "member" }],
      ["POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/send-recovery`, undefined],
      ["POST", `/api/admin/access/invitations/${encodeURIComponent(invitationId)}/resend`, undefined],
      ["POST", `/api/admin/access/invitations/${encodeURIComponent(invitationId)}/revoke`, undefined],
    ] as const) {
      const r = await call(ctx.fixture, ctx.ownerBCookie, method, path, body);
      expect([404, 409]).toContain(r.status);
    }
    const list = await call(ctx.fixture, ctx.ownerBCookie, "GET", "/api/admin/access");
    expect(JSON.stringify(list.json)).not.toContain("member@a.test");
    expect(JSON.stringify(list.json)).not.toContain("t@a.test");
    expect(ctx.fixture.controlPlane.getMembership(memberRow.membershipId)!.status).toBe("ACTIVE");
    ctx.fixture.close();
  });

  it("member cannot manage access; member keeps read access to the list as before", async () => {
    const ctx = await setup();
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    expect((await call(ctx.fixture, memberCookie, "POST", "/api/admin/access/invitations", { email: "z@a.test", role: "member" })).status).toBe(403);
    const list = await call(ctx.fixture, memberCookie, "GET", "/api/admin/access");
    expect(list.status).toBe(200);
    expect(list.json?.canEdit).toBe(false);
    expect(list.json?.invitations).toEqual([]);
    ctx.fixture.close();
  });
});

describe("forward recovery: WORKOS_ORG_ROLES_V1 off makes the scoped roles inactive by code (MIGRATION §5)", () => {
  it("existing production/workshop memberships stop working when the flag is turned off; owner/member continue", async () => {
    const on = await setup({ WORKOS_ORG_ROLES_V1: "on" });
    const workshop = await inviteAndAccept(on, "w@a.test", "workshop");
    expect((await call(on.fixture, workshop.cookie, "GET", "/api/jobs")).status).toBe(200);
    // Same control plane, same sessions, flag OFF (simulates the forward-recovery switch).
    const { openCloudFixture } = await import("./cloud-harness.js");
    on.fixture.registry.closeAll();
    on.fixture.controlPlane.close();
    const off = openCloudFixture(on.fixture.cloudRoot, { env: { NODE_ENV: "test" } });
    try {
      expect((await call(off, workshop.cookie, "GET", "/api/jobs")).status).toBe(403);
      const login = await loginCloud(off.app, "w@a.test", workshop.password);
      expect(login.response.status).toBe(403);
      expect(login.body.error).toBe("no_membership");
      expect((await loginCloud(off.app, "owner@a.test", OWNER_PASSWORD)).response.status).toBe(200);
      expect((await loginCloud(off.app, "member@a.test", MEMBER_PASSWORD)).response.status).toBe(200);
    } finally {
      off.close();
    }
  });
});

describe("compatibility invariant and unknown roles (CF-02, CF-03)", () => {
  it("rejects (role, status) pairs outside the invariant in the database", async () => {
    const ctx = await setup();
    const db = ctx.fixture.controlPlane.db;
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    for (const [role, status] of [["workshop", "ACTIVE"], ["production", "ACTIVE"], ["member", "ACTIVE_SCOPED"], ["auditor", "ACTIVE"]]) {
      expect(() => db.prepare(`UPDATE organization_memberships SET role = ?, status = ? WHERE membership_id = ?`).run(role, status, memberRow.membershipId)).toThrow(/membership_role_status_invalid/);
    }
    ctx.fixture.close();
  });

  it("an unknown role is refused entirely, never treated as member", async () => {
    const ctx = await setup();
    const db = ctx.fixture.controlPlane.db;
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    db.exec(`DROP TRIGGER memberships_role_status_update`);
    db.prepare(`UPDATE organization_memberships SET role = 'auditor' WHERE user_id = ?`).run(ctx.member.userId);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/customers")).status).toBe(403);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/jobs")).status).toBe(403);
    const login = await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD);
    expect(login.response.status).toBe(403);
    expect(login.body.error).toBe("no_membership");
    ctx.fixture.close();
  });
});

describe("C1 · password change keeps only the current device, with a new token", () => {
  it("rotates the current session, revokes all others, invalidates the old cookie", async () => {
    const ctx = await setup();
    const a = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const b = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const changed = await call(ctx.fixture, a, "POST", "/api/account/password", { currentPassword: MEMBER_PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect(changed.json?.otherSessionsClosed).toBe(1);
    const rotated = cloudCookie(changed.response);
    expect(rotated).not.toBe(a);
    expect((await call(ctx.fixture, a, "GET", "/api/customers")).status).toBe(401);
    expect((await call(ctx.fixture, b, "GET", "/api/customers")).status).toBe(401);
    expect((await call(ctx.fixture, rotated, "GET", "/api/customers")).status).toBe(200);
    // Refresh: the new cookie resolves a session.
    expect(((await call(ctx.fixture, rotated, "GET", "/api/cloud/session")).json?.user as Json).email).toBe("member@a.test");
    expect((await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).response.status).toBe(401);
    expect((await loginCloud(ctx.fixture.app, "member@a.test", NEW_PASSWORD)).response.status).toBe(200);
    const pwd = ctx.fixture.controlPlane.db.prepare(`SELECT password_changed_at FROM users WHERE user_id = ?`).get(ctx.member.userId) as { password_changed_at: string | null };
    expect(pwd.password_changed_at).not.toBeNull();
    ctx.fixture.close();
  });

  it("wrong current password changes nothing", async () => {
    const ctx = await setup();
    const a = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const wrong = await call(ctx.fixture, a, "POST", "/api/account/password", { currentPassword: "nu-este-ea-123", newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(401);
    expect((await call(ctx.fixture, a, "GET", "/api/customers")).status).toBe(200);
    ctx.fixture.close();
  });

  it("concurrent changes on the same session: one wins, the other is refused, no lockout of the winner", async () => {
    const ctx = await setup();
    const a = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const [one, two] = await Promise.all([
      call(ctx.fixture, a, "POST", "/api/account/password", { currentPassword: MEMBER_PASSWORD, newPassword: "ParolaUnu12345" }),
      call(ctx.fixture, a, "POST", "/api/account/password", { currentPassword: MEMBER_PASSWORD, newPassword: "ParolaDoi12345" }),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    const winner = one.status === 200 ? one : two;
    expect((await call(ctx.fixture, cloudCookie(winner.response), "GET", "/api/customers")).status).toBe(200);
    ctx.fixture.close();
  });

  it("a failure inside the transaction rolls everything back (old password and session stay valid)", async () => {
    const ctx = await setup();
    const login = await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD);
    const resolved = ctx.fixture.controlPlane.resolveSession(String(login.cookie).split("=")[1]);
    if (!resolved.ok) throw new Error("session");
    await expect(
      changePassword(ctx.fixture.controlPlane, {
        user: resolved.user,
        session: resolved.session,
        currentPassword: MEMBER_PASSWORD,
        newPassword: NEW_PASSWORD,
        hooks: { beforeCommit: () => { throw new Error("synthetic failure"); } },
      }),
    ).rejects.toThrow("synthetic failure");
    expect((await call(ctx.fixture, login.cookie, "GET", "/api/customers")).status).toBe(200);
    expect((await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).response.status).toBe(200);
    ctx.fixture.close();
  });
});

describe("C2 · email verified means proof of control; recovery only on a verified channel (D7)", () => {
  function outbox(): { dir: string; read(): Json[] } {
    const dir = mkdtempSync(join(tmpdir(), "workos-outbox-"));
    return { dir, read: () => readdirSync(dir).sort().map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Json) };
  }

  it("SMTP_FAILED → LINK_COPIED → INVITATION_ACCEPTED → EMAIL_VERIFIED_AT = NULL", async () => {
    const box = outbox();
    const ctx = await setup({ WORKOS_ACCESS_OUTBOX_DIR: box.dir, WORKOS_ACCESS_OUTBOX_FAIL: "1" });
    const invited = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "smtp@a.test", role: "member" });
    expect((invited.json?.invitation as Json).deliveryChannel).toBe("EMAIL");
    expect((invited.json?.invitation as Json).deliveryStatus).toBe("FAILED");
    expect(invited.json?.inviteUrl).toBeTruthy(); // fallback: copied by hand
    const accepted = await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token: tokenFromUrl(invited.json?.inviteUrl), mode: "new", password: "ParolaNoua123" });
    expect(accepted.status).toBe(200);
    const row = ctx.fixture.controlPlane.db.prepare(`SELECT email_verified_at FROM users WHERE email = 'smtp@a.test'`).get() as { email_verified_at: string | null };
    expect(row.email_verified_at).toBeNull();
    ctx.fixture.close();
  });

  it("an email-delivered invitation does not verify the address either", async () => {
    const box = outbox();
    const ctx = await setup({ WORKOS_ACCESS_OUTBOX_DIR: box.dir });
    const invited = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "mail@a.test", role: "member" });
    expect(invited.json?.inviteUrl).toBeNull(); // sent: the owner never sees the link
    const message = box.read().find((m) => m.kind === "INVITATION")!;
    await call(ctx.fixture, null, "POST", "/api/cloud/invitations/accept", { token: tokenFromUrl(message.url), mode: "new", password: "ParolaNoua123" });
    const row = ctx.fixture.controlPlane.db.prepare(`SELECT email_verified_at FROM users WHERE email = 'mail@a.test'`).get() as { email_verified_at: string | null };
    expect(row.email_verified_at).toBeNull();
    ctx.fixture.close();
  });

  it("recovery is refused on an unverified channel and works after verification; the owner never sees a token", async () => {
    const box = outbox();
    const ctx = await setup({ WORKOS_ACCESS_OUTBOX_DIR: box.dir });
    const memberRow = ctx.fixture.controlPlane.getMembershipForUserInOrganization(ctx.member.userId, ctx.orgA.organizationId)!;
    const refused = await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/send-recovery`);
    expect(refused.status).toBe(409);
    expect(refused.json?.error).toBe("recovery_channel_unavailable");
    // Self-service on an unverified address: neutral and nothing issued.
    const neutral = await call(ctx.fixture, null, "POST", "/api/cloud/password-reset/request", { email: "member@a.test" });
    expect(neutral.status).toBe(202);
    expect((ctx.fixture.controlPlane.db.prepare(`SELECT count(*) AS n FROM credential_tokens WHERE purpose = 'PASSWORD_RESET'`).get() as { n: number }).n).toBe(0);
    // Verify the email (proof of control through the delivered link).
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    expect((await call(ctx.fixture, memberCookie, "POST", "/api/account/email-verification")).status).toBe(202);
    const verification = box.read().find((m) => m.kind === "EMAIL_VERIFICATION")!;
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/email-verification/complete", { token: tokenFromUrl(verification.url) })).status).toBe(204);
    // Now the owner may request recovery; the answer carries no token or URL.
    const requested = await call(ctx.fixture, ctx.ownerCookie, "POST", `/api/admin/access/memberships/${encodeURIComponent(memberRow.membershipId)}/send-recovery`);
    expect(requested.status).toBe(202);
    expect(requested.text).not.toMatch(/#t=|resetare-parola|token/i);
    const reset = box.read().filter((m) => m.kind === "PASSWORD_RESET").pop()!;
    expect(reset.to).toBe("member@a.test");
    // The reset link expires in one hour (D6).
    const tokenRow = ctx.fixture.controlPlane.db.prepare(`SELECT created_at, expires_at FROM credential_tokens WHERE purpose = 'PASSWORD_RESET' AND status = 'ISSUED'`).get() as { created_at: string; expires_at: string };
    expect(Date.parse(tokenRow.expires_at) - Date.parse(tokenRow.created_at)).toBe(60 * 60 * 1000);
    // Completing it revokes every session.
    const other = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/password-reset/complete", { token: tokenFromUrl(reset.url), newPassword: NEW_PASSWORD })).status).toBe(204);
    expect((await call(ctx.fixture, memberCookie, "GET", "/api/customers")).status).toBe(401);
    expect((await call(ctx.fixture, other, "GET", "/api/customers")).status).toBe(401);
    expect((await call(ctx.fixture, null, "POST", "/api/cloud/password-reset/complete", { token: tokenFromUrl(reset.url), newPassword: "AltaNoua123456" })).status).toBe(410);
    // Audit never stores tokens.
    const audit = ctx.fixture.controlPlane.db.prepare(`SELECT detail_json FROM access_audit_events`).all() as Array<{ detail_json: string }>;
    for (const row of audit) expect(row.detail_json).not.toContain(tokenFromUrl(reset.url));
    ctx.fixture.close();
  });

  it("the audit log is append-only", async () => {
    const ctx = await setup();
    await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/admin/access/invitations", { email: "a1@a.test", role: "member" });
    expect(() => ctx.fixture.controlPlane.db.prepare(`UPDATE access_audit_events SET action = 'x'`).run()).toThrow(/append_only/);
    expect(() => ctx.fixture.controlPlane.db.prepare(`DELETE FROM access_audit_events`).run()).toThrow(/append_only/);
    ctx.fixture.close();
  });
});

describe("CF-08 · platform-assisted recovery (pilot only)", () => {
  it("issues a 1-hour, single-use link to the platform operator, audited, without any password in argv", async () => {
    const ctx = await setup();
    const root = ctx.fixture.cloudRoot;
    ctx.fixture.close();
    const { runIssuePasswordRecovery, IssuePasswordRecoveryError } = await import("../src/cloud/issuePasswordRecoveryCli.js");
    expect(() => runIssuePasswordRecovery(["node", "cli", "--root", root, "--email", "member@a.test", "--public-origin", ORIGIN])).toThrow(IssuePasswordRecoveryError);
    expect(() => runIssuePasswordRecovery(["node", "cli", "--root", root, "--email", "member@a.test", "--public-origin", ORIGIN, "--password", "x", "--confirm-controlled-access-change"])).toThrow();
    const issued = runIssuePasswordRecovery(["node", "cli", "--root", root, "--email", "member@a.test", "--public-origin", ORIGIN, "--confirm-controlled-access-change"]);
    expect(issued.expiresInMinutes).toBe(60);
    expect(issued.link.startsWith(`${ORIGIN}/resetare-parola#t=`)).toBe(true);
    const { openCloudFixture } = await import("./cloud-harness.js");
    const reopened = openCloudFixture(root, { env: { NODE_ENV: "test" } });
    try {
      const done = await call(reopened, null, "POST", "/api/cloud/password-reset/complete", { token: tokenFromUrl(issued.link), newPassword: NEW_PASSWORD });
      expect(done.status).toBe(204);
      expect((await loginCloud(reopened.app, "member@a.test", NEW_PASSWORD)).response.status).toBe(200);
      const actions = (reopened.controlPlane.db.prepare(`SELECT action FROM access_audit_events`).all() as Array<{ action: string }>).map((row) => row.action);
      expect(actions).toContain("credential.recovery_issued_by_platform");
      expect(actions).toContain("credential.password_reset");
      // Platform recovery is not proof of email control (C2).
      const row = reopened.controlPlane.db.prepare(`SELECT email_verified_at FROM users WHERE email = 'member@a.test'`).get() as { email_verified_at: string | null };
      expect(row.email_verified_at).toBeNull();
    } finally {
      reopened.close();
    }
  });

  it("CF-06 · a newer recovery link supersedes the older one, and an expired link is refused", async () => {
    const ctx = await setup();
    const root = ctx.fixture.cloudRoot;
    ctx.fixture.close();
    const { runIssuePasswordRecovery } = await import("../src/cloud/issuePasswordRecoveryCli.js");
    const argv = ["node", "cli", "--root", root, "--email", "member@a.test", "--public-origin", ORIGIN, "--confirm-controlled-access-change"];
    const first = runIssuePasswordRecovery(argv);
    const second = runIssuePasswordRecovery(argv);
    const { openCloudFixture } = await import("./cloud-harness.js");
    const reopened = openCloudFixture(root, { env: { NODE_ENV: "test" } });
    try {
      expect((await call(reopened, null, "POST", "/api/cloud/password-reset/complete", { token: tokenFromUrl(first.link), newPassword: NEW_PASSWORD })).status).toBe(410);
      reopened.controlPlane.db.prepare(`UPDATE credential_tokens SET expires_at = ? WHERE status = 'ISSUED'`).run(new Date(Date.now() - 1000).toISOString());
      expect((await call(reopened, null, "POST", "/api/cloud/password-reset/complete", { token: tokenFromUrl(second.link), newPassword: NEW_PASSWORD })).status).toBe(410);
      expect((await loginCloud(reopened.app, "member@a.test", MEMBER_PASSWORD)).response.status).toBe(200);
    } finally {
      reopened.close();
    }
  });
});

describe("server-side protection for the scoped roles (scenarios 1, 3, 5)", () => {
  it("production and workshop are denied commercial endpoints; owner and member are unchanged", async () => {
    const ctx = await setup({ WORKOS_ORG_ROLES_V1: "on" });
    const production = await inviteAndAccept(ctx, "prod@a.test", "production");
    const workshop = await inviteAndAccept(ctx, "atelier@a.test", "workshop");
    const memberCookie = (await loginCloud(ctx.fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const customer = await call(ctx.fixture, ctx.ownerCookie, "POST", "/api/customers", { displayName: "Client Sintetic SRL" });
    const customerId = ((customer.json?.customer as Json).customerId as string);
    const commercial = [
      "/api/quotes",
      `/api/customers/${encodeURIComponent(customerId)}/commercial-terms`,
      `/api/customers/${encodeURIComponent(customerId)}/workspace`,
      `/api/customers/${encodeURIComponent(customerId)}/history`,
      "/api/admin/commercial-policy",
      "/api/admin/access",
      "/api/seller",
      "/api/assemblies",
      "/api/product-catalog",
      "/api/admin/assembly-operation-cost",
    ];
    for (const path of commercial) {
      expect((await call(ctx.fixture, production.cookie, "GET", path)).status, `production ${path}`).toBe(403);
      expect((await call(ctx.fixture, workshop.cookie, "GET", path)).status, `workshop ${path}`).toBe(403);
    }
    expect((await call(ctx.fixture, workshop.cookie, "GET", "/api/customers")).status).toBe(403);
    expect((await call(ctx.fixture, workshop.cookie, "GET", "/api/admin/formulas")).status).toBe(403);
    expect((await call(ctx.fixture, production.cookie, "GET", "/api/admin/formulas")).status).toBe(200);
    expect((await call(ctx.fixture, production.cookie, "GET", "/api/customers")).status).toBe(200);
    expect((await call(ctx.fixture, production.cookie, "POST", "/api/people", { displayName: "X" })).status).toBe(403);
    expect((await call(ctx.fixture, production.cookie, "PUT", "/api/people/x/operator-pin", { pin: "1234" })).status).toBe(403);
    expect((await call(ctx.fixture, production.cookie, "POST", "/api/inventory/x/adjustments", {})).status).toBe(403);
    // Owner and member keep their access.
    for (const path of ["/api/quotes", `/api/customers/${encodeURIComponent(customerId)}/commercial-terms`, "/api/customers", "/api/seller"]) {
      expect((await call(ctx.fixture, ctx.ownerCookie, "GET", path)).status).toBe(200);
      expect((await call(ctx.fixture, memberCookie, "GET", path)).status).toBe(200);
    }
    ctx.fixture.close();
  });

  it("answers carry Cache-Control: no-store", async () => {
    const ctx = await setup();
    const r = await call(ctx.fixture, ctx.ownerCookie, "GET", "/api/customers");
    expect(r.response.headers.get("cache-control")).toBe("no-store");
    ctx.fixture.close();
  });
});
