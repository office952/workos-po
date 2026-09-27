import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProviderRegistryKind } from "../src/cloud/bootstrapPolicy.js";
import { runControlledProvisionCli } from "../src/cloud/controlledProvisionCli.js";
import {
  addOrganizationAccessMember,
  listOrganizationAccessMembers,
  revokeOrganizationAccessMember,
} from "../src/cloud/organizationAccess.js";
import {
  assertCloudProvisionNotProduction,
  assertControlledProvisionSafeguards,
  openProvisionedControlPlane,
  provisionCloudUser,
  provisionControlledOrganization,
  ProvisionConflictError,
  provisionMembership,
  provisionOrganizationWithPlane,
  resumeControlledOrganizationProvision,
} from "../src/cloud/provision.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  openCloudFixture,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

const temps: string[] = [];

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "workos-controlled-provision-"));
  temps.push(root);
  return root;
}

afterEach(() => {
  cleanupCloudTemps();
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore Windows handle races
    }
  }
});

describe("controlled organization provisioning", () => {
  it("keeps the production refusal on the dev helper path", () => {
    expect(() => assertCloudProvisionNotProduction({ NODE_ENV: "production" })).toThrow(
      /production_refused/,
    );
    expect(() =>
      assertControlledProvisionSafeguards({
        intent: "NEW_ORGANIZATION",
        confirmControlledProvision: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertControlledProvisionSafeguards({
        intent: "ADOPT_EXISTING",
        confirmControlledProvision: true,
      }),
    ).toThrow(/intent_required/);
    expect(() =>
      assertControlledProvisionSafeguards({
        intent: "NEW_ORGANIZATION",
        confirmControlledProvision: false,
      }),
    ).toThrow(/confirm_required/);
  });

  it("provisions a NEW_ORGANIZATION foundation with first Owner and empty providers", async () => {
    const root = freshRoot();
    const result = await provisionControlledOrganization({
      cloudRoot: root,
      displayName: "Firma Generica",
      email: "owner@generic.test",
      password: OWNER_PASSWORD,
      intent: "NEW_ORGANIZATION",
      confirmControlledProvision: true,
    });

    expect(result.alreadyActive).toBe(false);
    expect(result.organization.status).toBe("ACTIVE");
    expect(result.plane.bootstrapPolicy).toBe("NEW_ORGANIZATION");
    expect(resolveProviderRegistryKind(result.plane.bootstrapPolicy)).toBe("EMPTY_FOUNDATION");
    expect(result.user.email).toBe("owner@generic.test");

    const controlPlane = openProvisionedControlPlane(root);
    try {
      const membership = controlPlane.getActiveMembership(
        result.user.userId,
        result.organization.organizationId,
      );
      expect(membership?.role).toBe("owner");
    } finally {
      controlPlane.close();
    }

    const runtime = createProductSystemRuntime(result.paths.sqlitePath, {
      documentsRoot: result.paths.documentsRoot,
      bootstrapPolicy: result.plane.bootstrapPolicy,
    });
    try {
      expect(runtime.providerRegistry.workcenters).toEqual([]);
      expect(runtime.providerRegistry.machines).toEqual([]);
      expect(runtime.listPeople()).toEqual([]);
      expect(runtime.getSellerProfile()).toBeNull();
      expect(runtime.readMaterialReadiness().mode).toBe("DISABLED");
      expect(runtime.readExternalProductionHandoff().mode).toBe("DISABLED");
    } finally {
      runtime.close();
    }

    const world = openCloudFixture(root);
    try {
      const good = await loginCloud(world.app, "owner@generic.test", OWNER_PASSWORD);
      expect(good.response.status).toBe(200);
      const bad = await loginCloud(world.app, "owner@generic.test", "WrongPass12");
      expect(bad.response.status).toBe(401);
    } finally {
      world.close();
    }
  });

  it("fails closed on duplicate create after a completed provisioning", async () => {
    const root = freshRoot();
    const first = await provisionControlledOrganization({
      cloudRoot: root,
      displayName: "Firma Unu",
      email: "owner@one.test",
      password: OWNER_PASSWORD,
      intent: "NEW_ORGANIZATION",
      confirmControlledProvision: true,
    });

    await expect(
      provisionControlledOrganization({
        cloudRoot: root,
        displayName: "Firma Doi",
        email: "owner@one.test",
        password: OWNER_PASSWORD,
        intent: "NEW_ORGANIZATION",
        confirmControlledProvision: true,
      }),
    ).rejects.toBeInstanceOf(ProvisionConflictError);

    const controlPlane = openProvisionedControlPlane(root);
    try {
      expect(controlPlane.listOrganizations()).toHaveLength(1);
      expect(controlPlane.countUsers()).toBe(1);
      expect(controlPlane.countMemberships(first.organization.organizationId)).toBe(1);
    } finally {
      controlPlane.close();
    }
  });

  it("resumes a failed controlled provision without inventing a second org", async () => {
    const root = freshRoot();
    await expect(
      provisionControlledOrganization({
        cloudRoot: root,
        displayName: "Firma Partial",
        email: "owner@partial.test",
        password: OWNER_PASSWORD,
        intent: "NEW_ORGANIZATION",
        confirmControlledProvision: true,
        hooks: { fault: "during_operational_plane" },
      }),
    ).rejects.toBeInstanceOf(ProvisionConflictError);

    const controlPlane = openProvisionedControlPlane(root);
    let organizationId = "";
    try {
      const orgs = controlPlane.listOrganizations();
      expect(orgs).toHaveLength(1);
      organizationId = orgs[0]!.organizationId;
      expect(orgs[0]!.status).toBe("FAILED_RETRYABLE");
    } finally {
      controlPlane.close();
    }

    const resumed = await resumeControlledOrganizationProvision({
      cloudRoot: root,
      organizationId,
      email: "owner@partial.test",
      password: OWNER_PASSWORD,
      intent: "NEW_ORGANIZATION",
      confirmControlledProvision: true,
    });
    expect(resumed.organization.status).toBe("ACTIVE");
    expect(resumed.plane.bootstrapPolicy).toBe("NEW_ORGANIZATION");
  });

  it("runs the controlled CLI without printing the password", async () => {
    const root = freshRoot();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runControlledProvisionCli(
        [
          "--root",
          root,
          "--org",
          "Firma CLI",
          "--email",
          "owner@cli.test",
          "--intent",
          "NEW_ORGANIZATION",
          "--confirm-controlled-provision",
          "--password-stdin",
        ],
        Readable.from([`${OWNER_PASSWORD}\n`]),
      );
      const printed = [...logSpy.mock.calls, ...errSpy.mock.calls]
        .flat()
        .map(String)
        .join("\n");
      expect(printed).not.toContain(OWNER_PASSWORD);
      expect(printed).toContain("controlled-operator");
      expect(printed).toContain("NEW_ORGANIZATION");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("refuses controlled CLI without confirm or wrong intent", async () => {
    const root = freshRoot();
    await expect(
      runControlledProvisionCli(
        [
          "--root",
          root,
          "--org",
          "X",
          "--email",
          "a@b.test",
          "--intent",
          "NEW_ORGANIZATION",
          "--password-stdin",
        ],
        Readable.from([`${OWNER_PASSWORD}\n`]),
      ),
    ).rejects.toMatchObject({ code: "confirm_required" });

    await expect(
      runControlledProvisionCli(
        [
          "--root",
          root,
          "--org",
          "X",
          "--email",
          "a@b.test",
          "--intent",
          "ADOPT_EXISTING",
          "--confirm-controlled-provision",
          "--password-stdin",
        ],
        Readable.from([`${OWNER_PASSWORD}\n`]),
      ),
    ).rejects.toMatchObject({ code: "intent_required" });
    expect(existsSync(join(root, "control"))).toBe(false);
  });
});

describe("organization access membership admin", () => {
  it("lets Owner manage members with org isolation and last-owner protection", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await provisionOrganizationWithPlane(fixture.controlPlane, {
        displayName: "Org A",
        bootstrapPolicy: "NEW_ORGANIZATION",
      });
      const orgB = await provisionOrganizationWithPlane(fixture.controlPlane, {
        displayName: "Org B",
        bootstrapPolicy: "NEW_ORGANIZATION",
      });
      const ownerA = await provisionCloudUser(fixture.controlPlane, {
        email: "owner-a@test.local",
        password: OWNER_PASSWORD,
      });
      const ownerB = await provisionCloudUser(fixture.controlPlane, {
        email: "owner-b@test.local",
        password: OWNER_PASSWORD,
      });
      provisionMembership(fixture.controlPlane, {
        userId: ownerA.userId,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      provisionMembership(fixture.controlPlane, {
        userId: ownerB.userId,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      fixture.controlPlane.activateOrganization(orgA.organization.organizationId);
      fixture.controlPlane.activateOrganization(orgB.organization.organizationId);

      const ownerLogin = await loginCloud(
        fixture.app,
        "owner-a@test.local",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      expect(ownerLogin.cookie).toBeTruthy();
      const ownerCookie = ownerLogin.cookie!;

      const listed = await fixture.app.request("/api/admin/access", {
        headers: { cookie: ownerCookie },
      });
      expect(listed.status).toBe(200);
      const listedBody = (await listed.json()) as {
        canEdit: boolean;
        members: Array<{ email: string }>;
      };
      expect(listedBody.canEdit).toBe(true);
      expect(listedBody.members.map((item) => item.email)).toEqual(["owner-a@test.local"]);

      const created = await fixture.app.request("/api/admin/access/users", {
        method: "POST",
        headers: {
          cookie: ownerCookie,
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
        },
        body: JSON.stringify({
          email: "member-a@test.local",
          role: "member",
          password: MEMBER_PASSWORD,
        }),
      });
      expect(created.status).toBe(201);

      const memberLogin = await loginCloud(
        fixture.app,
        "member-a@test.local",
        MEMBER_PASSWORD,
        orgA.organization.organizationId,
      );
      expect(memberLogin.response.status).toBe(200);
      expect(memberLogin.cookie).toBeTruthy();
      const memberCookie = memberLogin.cookie!;

      const memberCreate = await fixture.app.request("/api/admin/access/users", {
        method: "POST",
        headers: {
          cookie: memberCookie,
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
        },
        body: JSON.stringify({
          email: "other@test.local",
          role: "member",
          password: MEMBER_PASSWORD,
        }),
      });
      expect(memberCreate.status).toBe(403);

      const ownerBLogin = await loginCloud(
        fixture.app,
        "owner-b@test.local",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const foreign = await fixture.app.request("/api/admin/access", {
        headers: { cookie: ownerBLogin.cookie! },
      });
      const foreignBody = (await foreign.json()) as { members: Array<{ email: string }> };
      expect(foreignBody.members.map((item) => item.email)).toEqual(["owner-b@test.local"]);
      expect(foreignBody.members.some((item) => item.email.includes("member-a"))).toBe(false);

      const ownerMembership = listOrganizationAccessMembers(
        fixture.controlPlane,
        orgA.organization.organizationId,
      ).find((item) => item.email === "owner-a@test.local");
      expect(ownerMembership).toBeTruthy();
      expect(
        revokeOrganizationAccessMember(fixture.controlPlane, {
          organizationId: orgA.organization.organizationId,
          membershipId: ownerMembership!.membershipId,
        }),
      ).toEqual({ ok: false, error: "last_owner_removal" });

      const secondOwner = await addOrganizationAccessMember(fixture.controlPlane, {
        organizationId: orgA.organization.organizationId,
        email: "owner-a2@test.local",
        role: "owner",
        password: OWNER_PASSWORD,
      });
      expect(secondOwner.ok).toBe(true);

      const memberRow = listOrganizationAccessMembers(
        fixture.controlPlane,
        orgA.organization.organizationId,
      ).find((item) => item.email === "member-a@test.local");
      const revoked = await fixture.app.request(
        `/api/admin/access/memberships/${encodeURIComponent(memberRow!.membershipId)}/revoke`,
        {
          method: "POST",
          headers: {
            cookie: ownerCookie,
            origin: "http://127.0.0.1:5173",
          },
        },
      );
      expect(revoked.status).toBe(200);

      const afterRevoke = await fixture.app.request("/api/customers", {
        headers: { cookie: memberCookie },
      });
      expect([401, 403]).toContain(afterRevoke.status);

      const attach = await addOrganizationAccessMember(fixture.controlPlane, {
        organizationId: orgB.organization.organizationId,
        email: "owner-a@test.local",
        role: "member",
      });
      expect(attach.ok).toBe(true);
      if (attach.ok) {
        expect(attach.attachedExistingUser).toBe(true);
      }
      const stillOwnerA = await fixture.controlPlane.verifyLogin(
        "owner-a@test.local",
        OWNER_PASSWORD,
      );
      expect(stillOwnerA.ok).toBe(true);

      const rejectsAuthority = await fixture.app.request("/api/admin/access/users", {
        method: "POST",
        headers: {
          cookie: ownerCookie,
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
        },
        body: JSON.stringify({
          email: "x@test.local",
          role: "member",
          password: MEMBER_PASSWORD,
          organizationId: orgB.organization.organizationId,
        }),
      });
      expect(rejectsAuthority.status).toBe(400);

      const accessAgain = await fixture.app.request("/api/admin/access", {
        headers: { cookie: ownerCookie },
      });
      const serialized = JSON.stringify(await accessAgain.json());
      expect(serialized).not.toMatch(/password_hash|passwordHash|scrypt/i);
    } finally {
      fixture.close();
    }
  });
});
