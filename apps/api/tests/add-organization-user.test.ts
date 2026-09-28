import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addOrganizationUser,
  AddOrganizationUserError,
  type AddOrganizationUserResult,
} from "../src/cloud/addOrganizationUser.js";
import { runAddOrganizationUserCli } from "../src/cloud/addOrganizationUserCli.js";
import { resolveProviderRegistryKind } from "../src/cloud/bootstrapPolicy.js";
import {
  normalizeEmail,
  resetCloudLoginAttemptGuard,
  type ControlPlane,
} from "../src/cloud/controlPlane.js";
import { listOrganizationAccessMembers } from "../src/cloud/organizationAccess.js";
import {
  openProvisionedControlPlane,
  provisionControlledOrganization,
  provisionOrganizationWithPlane,
  type ProvisionResult,
} from "../src/cloud/provision.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { loginCloud, openCloudFixture, OWNER_PASSWORD } from "./cloud-harness.js";

const ADDITIONAL_PASSWORD = "AdditionalPass12";
const SENTINEL_PASSWORD = "DoNotPrintThisSecret99";

const temps: string[] = [];

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "workos-add-org-user-"));
  temps.push(root);
  return root;
}

afterEach(() => {
  resetCloudLoginAttemptGuard();
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore Windows handle races
    }
  }
});

function provisionOrg(root: string, displayName: string, email: string) {
  return provisionControlledOrganization({
    cloudRoot: root,
    displayName,
    email,
    password: OWNER_PASSWORD,
    intent: "NEW_ORGANIZATION",
    confirmControlledProvision: true,
  });
}

async function createPendingOrganization(root: string): Promise<string> {
  const controlPlane = openProvisionedControlPlane(root);
  try {
    const pending = await provisionOrganizationWithPlane(controlPlane, {
      displayName: "In curs",
      bootstrapPolicy: "SYNTHETIC_TEST",
    });
    return pending.organization.organizationId;
  } finally {
    controlPlane.close();
  }
}

function withPlane<T>(root: string, read: (controlPlane: ControlPlane) => T): T {
  const controlPlane = openProvisionedControlPlane(root);
  try {
    return read(controlPlane);
  } finally {
    controlPlane.close();
  }
}

function credentialSnapshot(root: string, email: string) {
  return withPlane(root, (controlPlane) => {
    const row = controlPlane.db
      .prepare(
        `SELECT password_hash, password_salt, kdf, status, updated_at
         FROM users WHERE email = ?`,
      )
      .get(normalizeEmail(email)) as
      | {
          password_hash: Buffer;
          password_salt: Buffer;
          kdf: string;
          status: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      passwordHash: row.password_hash.toString("hex"),
      passwordSalt: row.password_salt.toString("hex"),
      kdf: row.kdf,
      status: row.status,
      updatedAt: row.updated_at,
    };
  });
}

function membershipSnapshot(root: string, organizationId: string) {
  return withPlane(root, (controlPlane) =>
    controlPlane.listMembershipsForOrganization(organizationId).map((item) => ({
      membershipId: item.membershipId,
      userId: item.userId,
      role: item.role,
      status: item.status,
    })),
  );
}

async function runAdd(input: {
  root: string;
  organizationId: string;
  email: string;
  role: string;
  confirm?: boolean;
  password?: string;
  passwordSupplied?: boolean;
  hooks?: { beforeMembership?: () => void };
}): Promise<AddOrganizationUserResult> {
  return addOrganizationUser({
    cloudRoot: input.root,
    organizationId: input.organizationId,
    email: input.email,
    role: input.role,
    confirmControlledAccessChange: input.confirm ?? true,
    passwordSupplied: input.passwordSupplied ?? input.password !== undefined,
    readPassword: async () => {
      if (input.password === undefined) {
        throw new Error("password_not_requested");
      }
      return input.password;
    },
    hooks: input.hooks,
  });
}

function cliArgs(
  root: string,
  organizationId: string,
  email: string,
  role: string,
  extra: string[] = [],
): string[] {
  return [
    "--root",
    root,
    "--organization-id",
    organizationId,
    "--email",
    email,
    "--role",
    role,
    "--confirm-controlled-access-change",
    ...extra,
  ];
}

describe("additional organization user tooling", () => {
  it("creates a new member, lets that member log in, and keeps the password out of output", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Membru", "owner@member-org.test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runAddOrganizationUserCli(
        cliArgs(root, owner.organization.organizationId, "Member@Example.TEST", "member", [
          "--password-stdin",
        ]),
        Readable.from([`${ADDITIONAL_PASSWORD}\n`]),
      );
      const printed = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join("\n");
      expect(printed).toContain("result: CREATED_NEW_USER");
      expect(printed).toContain(`organizationId: ${owner.organization.organizationId}`);
      expect(printed).toContain("email: member@example.test");
      expect(printed).toContain("role: member");
      expect(printed).not.toContain(ADDITIONAL_PASSWORD);
      expect(printed).not.toContain(OWNER_PASSWORD);
      expect(printed).not.toContain("scrypt");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }

    const world = openCloudFixture(root);
    try {
      const login = await loginCloud(
        world.app,
        "member@example.test",
        ADDITIONAL_PASSWORD,
        owner.organization.organizationId,
      );
      expect(login.response.status).toBe(200);
      const memberships = world.controlPlane.listMembershipsForOrganization(
        owner.organization.organizationId,
      );
      expect(memberships).toHaveLength(2);
      expect(memberships.filter((item) => item.role === "member")).toHaveLength(1);
    } finally {
      world.close();
    }
  });

  it("creates a new additional owner", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Owner", "owner@owner-org.test");
    const created = await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "second.owner@example.test",
      role: "owner",
      password: ADDITIONAL_PASSWORD,
    });
    expect(created).toEqual({
      kind: "CREATED_NEW_USER",
      organizationId: owner.organization.organizationId,
      email: "second.owner@example.test",
      role: "owner",
    });
    const owners = withPlane(root, (controlPlane) =>
      controlPlane.listActiveOwnerMemberships(owner.organization.organizationId),
    );
    expect(owners).toHaveLength(2);
  });

  it("attaches an existing active user to a second organization and preserves both passwords", async () => {
    const root = freshRoot();
    const first = await provisionOrg(root, "Firma Unu", "owner-a@example.test");
    const second = await provisionOrg(root, "Firma Doi", "owner-b@example.test");
    const beforeA = credentialSnapshot(root, "owner-a@example.test");
    const beforeB = credentialSnapshot(root, "owner-b@example.test");
    const beforeFirstMemberships = membershipSnapshot(root, first.organization.organizationId);
    const beforeSecondOwners = membershipSnapshot(root, second.organization.organizationId);

    const attached = await runAdd({
      root,
      organizationId: second.organization.organizationId,
      email: "Owner-A@Example.TEST",
      role: "member",
    });
    expect(attached).toEqual({
      kind: "ATTACHED_EXISTING_USER",
      organizationId: second.organization.organizationId,
      email: "owner-a@example.test",
      role: "member",
    });
    expect(credentialSnapshot(root, "owner-a@example.test")).toEqual(beforeA);
    expect(credentialSnapshot(root, "owner-b@example.test")).toEqual(beforeB);
    expect(membershipSnapshot(root, first.organization.organizationId)).toEqual(
      beforeFirstMemberships,
    );
    const secondMemberships = membershipSnapshot(root, second.organization.organizationId);
    expect(secondMemberships).toHaveLength(2);
    expect(secondMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: beforeSecondOwners[0]?.membershipId,
          role: "owner",
          status: "ACTIVE",
        }),
        expect.objectContaining({ role: "member", status: "ACTIVE" }),
      ]),
    );

    const world = openCloudFixture(root);
    try {
      const oldPassword = await loginCloud(
        world.app,
        "owner-a@example.test",
        OWNER_PASSWORD,
        second.organization.organizationId,
      );
      expect(oldPassword.response.status).toBe(200);
      const stillHome = await loginCloud(
        world.app,
        "owner-a@example.test",
        OWNER_PASSWORD,
        first.organization.organizationId,
      );
      expect(stillHome.response.status).toBe(200);
    } finally {
      world.close();
    }
  });

  it("rejects a supplied password for an existing user without writing credentials or memberships", async () => {
    const root = freshRoot();
    const first = await provisionOrg(root, "Firma Parola", "owner-a@example.test");
    const second = await provisionOrg(root, "Firma Alta", "owner-b@example.test");
    const before = credentialSnapshot(root, "owner-a@example.test");
    const beforeCount = withPlane(
      root,
      (controlPlane) => controlPlane.countMemberships(second.organization.organizationId),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        runAddOrganizationUserCli(
          cliArgs(root, second.organization.organizationId, "owner-a@example.test", "member", [
            "--password-stdin",
          ]),
          Readable.from([`${SENTINEL_PASSWORD}\n`]),
        ),
      ).rejects.toBeInstanceOf(AddOrganizationUserError);
      const printed = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join("\n");
      expect(printed).not.toContain(SENTINEL_PASSWORD);
      expect(printed).not.toContain(OWNER_PASSWORD);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    expect(credentialSnapshot(root, "owner-a@example.test")).toEqual(before);
    expect(
      withPlane(
        root,
        (controlPlane) => controlPlane.countMemberships(second.organization.organizationId),
      ),
    ).toBe(beforeCount);
    expect(
      withPlane(root, (controlPlane) =>
        controlPlane.getActiveMembership(
          controlPlane.getUserByEmail("owner-a@example.test")!.userId,
          second.organization.organizationId,
        ),
      ),
    ).toBeNull();
    expect(first.organization.organizationId).not.toBe(second.organization.organizationId);
  });

  it("returns ALREADY_MEMBER and does not duplicate or change an active membership", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Existenta", "owner@existing.test");
    await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "member@existing.test",
      role: "member",
      password: ADDITIONAL_PASSWORD,
    });
    const before = membershipSnapshot(root, owner.organization.organizationId);
    const again = await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "member@existing.test",
      role: "owner",
    });
    expect(again.kind).toBe("ALREADY_MEMBER");
    expect(again.role).toBe("member");
    expect(membershipSnapshot(root, owner.organization.organizationId)).toEqual(before);
    expect(withPlane(root, (controlPlane) => controlPlane.countUsers())).toBe(2);
  });

  it("reactivates a revoked membership in place and applies the requested role", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Revocare", "owner@revoked.test");
    await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "member@revoked.test",
      role: "member",
      password: ADDITIONAL_PASSWORD,
    });
    const member = withPlane(root, (controlPlane) => {
      const user = controlPlane.getUserByEmail("member@revoked.test");
      const membership = controlPlane.getMembershipForUserInOrganization(
        user!.userId,
        owner.organization.organizationId,
      );
      const revoked = controlPlane.revokeMembership({
        membershipId: membership!.membershipId,
        organizationId: owner.organization.organizationId,
      });
      if (!revoked.ok) {
        throw new Error(revoked.error);
      }
      return revoked.membership;
    });
    expect(member.status).toBe("REVOKED");
    const beforeCredential = credentialSnapshot(root, "member@revoked.test");
    const reactivated = await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "member@revoked.test",
      role: "owner",
    });
    expect(reactivated).toEqual({
      kind: "REACTIVATED_MEMBERSHIP",
      organizationId: owner.organization.organizationId,
      email: "member@revoked.test",
      role: "owner",
    });
    const after = withPlane(root, (controlPlane) =>
      controlPlane.getMembershipForUserInOrganization(
        member.userId,
        owner.organization.organizationId,
      ),
    );
    expect(after).toMatchObject({
      membershipId: member.membershipId,
      role: "owner",
      status: "ACTIVE",
    });
    expect(
      withPlane(
        root,
        (controlPlane) => controlPlane.countMemberships(owner.organization.organizationId),
      ),
    ).toBe(2);
    expect(credentialSnapshot(root, "member@revoked.test")).toEqual(beforeCredential);
  });

  it("fails closed for a disabled global user", async () => {
    const root = freshRoot();
    const first = await provisionOrg(root, "Firma Dezactivat", "owner-a@example.test");
    const second = await provisionOrg(root, "Firma Tinta", "owner-b@example.test");
    const before = credentialSnapshot(root, "owner-a@example.test");
    withPlane(root, (controlPlane) => {
      controlPlane.db
        .prepare(`UPDATE users SET status = 'DISABLED' WHERE email = ?`)
        .run("owner-a@example.test");
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        runAddOrganizationUserCli(
          cliArgs(root, second.organization.organizationId, "owner-a@example.test", "member", [
            "--password-stdin",
          ]),
          Readable.from([`${SENTINEL_PASSWORD}\n`]),
        ),
      ).rejects.toMatchObject({ code: "user_disabled" });
      const printed = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join("\n");
      expect(printed).toContain("result: USER_DISABLED");
      expect(printed).toContain("email: owner-a@example.test");
      expect(printed).not.toContain(SENTINEL_PASSWORD);
      expect(printed).not.toContain(first.organization.organizationId);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    const after = credentialSnapshot(root, "owner-a@example.test");
    expect(after).toEqual({ ...before, status: "DISABLED" });
    expect(withPlane(root, (controlPlane) => controlPlane.countUsers())).toBe(2);
    expect(
      withPlane(root, (controlPlane) =>
        controlPlane.getMembershipForUserInOrganization(
          controlPlane.getUserByEmail("owner-a@example.test")!.userId,
          second.organization.organizationId,
        ),
      ),
    ).toBeNull();
    const world = openCloudFixture(root);
    try {
      const login = await world.controlPlane.verifyLogin(
        "owner-a@example.test",
        OWNER_PASSWORD,
      );
      expect(login).toEqual({ ok: false, error: "disabled" });
    } finally {
      world.close();
    }
  });

  it("fails for a missing, provisioning, or disabled organization without creating a user", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Valida", "owner@valid.test");
    await expect(
      runAdd({
        root,
        organizationId: "org:missing",
        email: "nobody@example.test",
        role: "member",
        password: ADDITIONAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "organization_missing" });

    const pendingId = await createPendingOrganization(root);
    await expect(
      runAdd({
        root,
        organizationId: pendingId,
        email: "nobody@example.test",
        role: "member",
        password: ADDITIONAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "organization_not_administrable" });

    withPlane(root, (controlPlane) => {
      controlPlane.db
        .prepare(`UPDATE organizations SET status = 'DISABLED' WHERE organization_id = ?`)
        .run(owner.organization.organizationId);
    });
    await expect(
      runAdd({
        root,
        organizationId: owner.organization.organizationId,
        email: "nobody@example.test",
        role: "member",
        password: ADDITIONAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "organization_not_administrable" });
    expect(withPlane(root, (controlPlane) => controlPlane.getUserByEmail("nobody@example.test"))).toBeNull();

    const empty = freshRoot();
    await expect(
      runAdd({
        root: empty,
        organizationId: owner.organization.organizationId,
        email: "nobody@example.test",
        role: "member",
        password: ADDITIONAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "organization_missing" });
    expect(existsSync(join(empty, "control", "control-plane.sqlite"))).toBe(false);
  });

  it("fails for an invalid role or a missing confirmation before mutation", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Rol", "owner@role.test");
    const before = credentialSnapshot(root, "owner@role.test");
    await expect(
      runAdd({
        root,
        organizationId: owner.organization.organizationId,
        email: "member@role.test",
        role: "admin",
        password: ADDITIONAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_role" });
    await expect(
      runAddOrganizationUserCli([
        "--root",
        root,
        "--organization-id",
        owner.organization.organizationId,
        "--email",
        "member@role.test",
        "--role",
        "member",
        "--password-stdin",
      ]),
    ).rejects.toMatchObject({ code: "confirm_required" });
    expect(withPlane(root, (controlPlane) => controlPlane.countUsers())).toBe(1);
    expect(credentialSnapshot(root, "owner@role.test")).toEqual(before);
  });

  it("rejects --password argv and does not echo the value", async () => {
    const root = freshRoot();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        runAddOrganizationUserCli([
          "--root",
          root,
          "--organization-id",
          "org:missing",
          "--email",
          "a@example.test",
          "--role",
          "member",
          "--confirm-controlled-access-change",
          "--password",
          SENTINEL_PASSWORD,
        ]),
      ).rejects.toThrow(
        "Passwords must not be passed as --password. Use a TTY prompt or --password-stdin.",
      );
      await expect(
        runAddOrganizationUserCli([
          "--password=DoNotPrintThisSecret99",
          "--root",
          root,
          "--organization-id",
          "org:missing",
          "--email",
          "a@example.test",
          "--role",
          "member",
        ]),
      ).rejects.toThrow(/--password/);
      const printed = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join("\n");
      expect(printed).not.toContain(SENTINEL_PASSWORD);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    expect(existsSync(join(root, "control", "control-plane.sqlite"))).toBe(false);
  });

  it("rolls back a new user when membership creation fails", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Atomica", "owner@atomic.test");
    await expect(
      runAdd({
        root,
        organizationId: owner.organization.organizationId,
        email: "rollback@example.test",
        role: "member",
        password: ADDITIONAL_PASSWORD,
        hooks: {
          beforeMembership() {
            throw new Error("stop-before-membership");
          },
        },
      }),
    ).rejects.toThrow("stop-before-membership");
    expect(withPlane(root, (controlPlane) => controlPlane.getUserByEmail("rollback@example.test"))).toBeNull();
    expect(
      withPlane(
        root,
        (controlPlane) => controlPlane.countMemberships(owner.organization.organizationId),
      ),
    ).toBe(1);
  });

  it("keeps first-owner provisioning on an empty foundation and does not touch People", async () => {
    const root = freshRoot();
    const created = await provisionOrg(root, "Firma Fundatie", "owner@foundation.test");
    expect(created.plane.bootstrapPolicy).toBe("NEW_ORGANIZATION");
    expect(resolveProviderRegistryKind(created.plane.bootstrapPolicy)).toBe("EMPTY_FOUNDATION");
    expectPeopleUntouched(created);
    await runAdd({
      root,
      organizationId: created.organization.organizationId,
      email: "later@foundation.test",
      role: "member",
      password: ADDITIONAL_PASSWORD,
    });
    const after = withPlane(root, (controlPlane) => controlPlane.getPlaneByOrganization(
      created.organization.organizationId,
    ));
    expect(after?.bootstrapPolicy).toBe("NEW_ORGANIZATION");
    expect(after?.planeKey).toBe(created.plane.planeKey);
    expectPeopleUntouched(created);
  });

  it("keeps browser create unavailable and last-owner protection intact", async () => {
    const root = freshRoot();
    const owner = await provisionOrg(root, "Firma Acces", "owner@access.test");
    await runAdd({
      root,
      organizationId: owner.organization.organizationId,
      email: "member@access.test",
      role: "member",
      password: ADDITIONAL_PASSWORD,
    });
    const world = openCloudFixture(root);
    try {
      const login = await loginCloud(
        world.app,
        "owner@access.test",
        OWNER_PASSWORD,
        owner.organization.organizationId,
      );
      expect(login.response.status).toBe(200);
      const listed = await world.app.request("/api/admin/access", {
        headers: { cookie: login.cookie! },
      });
      expect(listed.status).toBe(200);
      const body = (await listed.json()) as {
        canEdit: boolean;
        members: Array<{ email: string; role: string; status: string }>;
      };
      expect(body.canEdit).toBe(true);
      expect(body.members.map((item) => item.email).sort()).toEqual([
        "member@access.test",
        "owner@access.test",
      ]);
      const create = await world.app.request("/api/admin/access/users", {
        method: "POST",
        headers: {
          cookie: login.cookie!,
          "content-type": "application/json",
          origin: "http://127.0.0.1:5173",
        },
        body: JSON.stringify({
          email: "probe@access.test",
          role: "member",
          password: ADDITIONAL_PASSWORD,
        }),
      });
      expect(create.status).toBe(404);
      expect(world.controlPlane.getUserByEmail("probe@access.test")).toBeNull();

      const ownerRow = listOrganizationAccessMembers(
        world.controlPlane,
        owner.organization.organizationId,
      ).find((item) => item.email === "owner@access.test");
      const memberRow = listOrganizationAccessMembers(
        world.controlPlane,
        owner.organization.organizationId,
      ).find((item) => item.email === "member@access.test");
      const lastOwner = await world.app.request(
        `/api/admin/access/memberships/${encodeURIComponent(ownerRow!.membershipId)}/revoke`,
        {
          method: "POST",
          headers: { cookie: login.cookie!, origin: "http://127.0.0.1:5173" },
        },
      );
      expect(lastOwner.status).toBe(409);
      const revokedMember = await world.app.request(
        `/api/admin/access/memberships/${encodeURIComponent(memberRow!.membershipId)}/revoke`,
        {
          method: "POST",
          headers: { cookie: login.cookie!, origin: "http://127.0.0.1:5173" },
        },
      );
      expect(revokedMember.status).toBe(200);
      expect(
        world.controlPlane.getActiveMembership(
          world.controlPlane.getUserByEmail("owner@access.test")!.userId,
          owner.organization.organizationId,
        )?.role,
      ).toBe("owner");
    } finally {
      world.close();
    }

    const routes = readFileSync(
      new URL("../src/cloud/organizationAccessRoutes.ts", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../../../src/surfaces/AccessAdminPage.tsx", import.meta.url),
      "utf8",
    );
    expect(routes.includes('"/api/admin/access/users"')).toBe(false);
    expect(page.includes("/api/admin/access/users")).toBe(false);
  });

  it("does not introduce a HUB MEDIA seed or branch", () => {
    const command = readFileSync(
      new URL("../src/cloud/addOrganizationUser.ts", import.meta.url),
      "utf8",
    );
    const cli = readFileSync(
      new URL("../src/cloud/addOrganizationUserCli.ts", import.meta.url),
      "utf8",
    );
    expect(command.includes("HUB MEDIA")).toBe(false);
    expect(command.includes("HUB_MEDIA")).toBe(false);
    expect(cli.includes("HUB MEDIA")).toBe(false);
    expect(cli.includes("HUB_MEDIA")).toBe(false);
  });
});

function expectPeopleUntouched(created: ProvisionResult): void {
  const runtime = createProductSystemRuntime(created.paths.sqlitePath, {
    documentsRoot: created.paths.documentsRoot,
    bootstrapPolicy: created.plane.bootstrapPolicy,
  });
  try {
    expect(runtime.providerRegistry.workcenters).toEqual([]);
    expect(runtime.providerRegistry.machines).toEqual([]);
    expect(runtime.listPeople()).toEqual([]);
  } finally {
    runtime.close();
  }
}
