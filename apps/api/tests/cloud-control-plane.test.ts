import { afterEach, describe, expect, it } from "vitest";
import {
  CLOUD_SESSION_TTL_MS,
  ControlPlaneInvariantError,
  createControlPlane,
  resetCloudLoginAttemptGuard,
} from "../src/cloud/controlPlane.js";
import { validateCloudPassword } from "../src/cloud/password.js";
import { openControlPlaneDatabase } from "../src/persistence/controlPlaneSqlite.js";
import { OWNER_PASSWORD, trackTempDir, cleanupCloudTemps } from "./cloud-harness.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("Cloud Control Plane", () => {
  it("creates organization, user, membership and plane identities", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    const organization = plane.createOrganization({ displayName: "Atelier Alpha" });
    expect(organization.organizationId.startsWith("org:")).toBe(true);
    expect(organization.status).toBe("PROVISIONING");
    expect(organization.slug).toMatch(/^[a-z0-9-]{3,48}$/);

    const user = await plane.createUser({
      email: "Owner@Example.TEST",
      password: OWNER_PASSWORD,
    });
    expect(user.email).toBe("owner@example.test");
    expect(user.userId.startsWith("usr:")).toBe(true);

    const membership = plane.addMembership({
      userId: user.userId,
      organizationId: organization.organizationId,
      role: "owner",
    });
    expect(membership.membershipId.startsWith("mem:")).toBe(true);
    expect(plane.getActiveMembership(user.userId, organization.organizationId)?.role).toBe(
      "owner",
    );

    const descriptor = plane.createPlane({
      organizationId: organization.organizationId,
      bootstrapPolicy: "SYNTHETIC_TEST",
    });
    expect(descriptor.planeId.startsWith("pln:")).toBe(true);
    expect(descriptor.planeKey).toMatch(/^[a-z0-9]{24}$/);
    expect(plane.getPlaneByOrganization(organization.organizationId)?.planeId).toBe(
      descriptor.planeId,
    );
    plane.close();
  });

  it("rejects weak passwords before hashing", async () => {
    expect(validateCloudPassword("short")).toBe("too_short");
    expect(validateCloudPassword("1234567890")).toBe("pin_like");
    expect(validateCloudPassword("abcdefghij")).toBe("too_simple");
    expect(validateCloudPassword(OWNER_PASSWORD)).toBeNull();

    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    await expect(
      plane.createUser({ email: "weak@example.test", password: "1234567890" }),
    ).rejects.toThrow(/invalid_password/);
    plane.close();
  });

  it("rate-limits repeated failed logins", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    for (let index = 0; index < 5; index += 1) {
      const result = await plane.verifyLogin("missing@example.test", "wrong-password");
      expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    }
    await expect(plane.verifyLogin("missing@example.test", "wrong-password")).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    plane.close();
  });

  it("refuses createSession and switch without a usable membership", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    const organization = plane.createOrganization({ displayName: "Atelier Alpha" });
    const other = plane.createOrganization({ displayName: "Atelier Beta" });
    const user = await plane.createUser({
      email: "owner@example.test",
      password: OWNER_PASSWORD,
    });
    expect(() => plane.activateOrganization(organization.organizationId)).toThrow(
      /organization_not_ready/,
    );
    expect(() =>
      plane.createSession({
        userId: user.userId,
        activeOrganizationId: organization.organizationId,
      }),
    ).toThrow(ControlPlaneInvariantError);

    plane.addMembership({
      userId: user.userId,
      organizationId: organization.organizationId,
      role: "owner",
    });
    expect(() =>
      plane.createSession({
        userId: user.userId,
        activeOrganizationId: organization.organizationId,
      }),
    ).toThrow(/organization_not_ready/);
    plane.activateOrganization(organization.organizationId);
    const { session } = plane.createSession({
      userId: user.userId,
      activeOrganizationId: organization.organizationId,
    });
    expect(
      plane.switchActiveOrganization(session.sessionId, other.organizationId),
    ).toBeNull();

    db.prepare(`UPDATE organizations SET status = 'DISABLED' WHERE organization_id = ?`).run(
      organization.organizationId,
    );
    expect(() =>
      plane.createSession({
        userId: user.userId,
        activeOrganizationId: organization.organizationId,
      }),
    ).toThrow(/organization_disabled/);
    expect(
      plane.switchActiveOrganization(session.sessionId, organization.organizationId),
    ).toBeNull();
    plane.close();
  });

  it("rejects expired and revoked sessions", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    const organization = plane.createOrganization({ displayName: "Atelier Alpha" });
    const user = await plane.createUser({
      email: "owner@example.test",
      password: OWNER_PASSWORD,
    });
    plane.addMembership({
      userId: user.userId,
      organizationId: organization.organizationId,
      role: "owner",
    });
    plane.activateOrganization(organization.organizationId);
    const created = plane.createSession({
      userId: user.userId,
      activeOrganizationId: organization.organizationId,
    });
    expect(plane.resolveSession(created.rawToken).ok).toBe(true);

    db.prepare(`UPDATE platform_sessions SET expires_at = ? WHERE session_id = ?`).run(
      new Date(Date.now() - 60_000).toISOString(),
      created.session.sessionId,
    );
    expect(plane.resolveSession(created.rawToken)).toEqual({
      ok: false,
      error: "invalid_session",
    });

    const fresh = plane.createSession({
      userId: user.userId,
      activeOrganizationId: organization.organizationId,
    });
    plane.revokeSession(fresh.rawToken);
    expect(plane.resolveSession(fresh.rawToken)).toEqual({
      ok: false,
      error: "invalid_session",
    });
    expect(CLOUD_SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    plane.close();
  });
});
