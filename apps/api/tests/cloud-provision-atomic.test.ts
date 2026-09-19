import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyControlPlaneMigrations,
  openControlPlaneDatabase,
  resolveControlPlaneSqlitePath,
} from "../src/persistence/controlPlaneSqlite.js";
import { createControlPlane, resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  readProvisionPassword,
  rejectArgvPassword,
  runDevProvisionCli,
} from "../src/cloud/devProvisionCli.js";
import {
  inspectOperationalPlane,
  inspectOrganizationProvision,
  isOrganizationResumeEligible,
  listResumeEligibleOrganizations,
  openProvisionedControlPlane,
  provisionNewOrganization,
  provisionOrganizationWithPlane,
  ProvisionConflictError,
  resumeOrganizationProvision,
  type ProvisionFaultHook,
} from "../src/cloud/provision.js";
import { CloudPasswordError } from "../src/cloud/password.js";
import {
  cleanupCloudTemps,
  loginCloud,
  openCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";

const FORBIDDEN_ROOT = "C:\\Users\\offic\\workos-cloud-data\\hub-media-pilot";
const CONTROL_PLANE_MIGRATION_001 = fileURLToPath(
  new URL("../src/persistence/control-plane-migrations/001_organizations_users_sessions.sql", import.meta.url),
);

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
  vi.restoreAllMocks();
});

function freshRoot(): string {
  const root = join(trackTempDir(), "cloud-root");
  expect(root).not.toBe(FORBIDDEN_ROOT);
  return root;
}

function controlPlaneCounts(cloudRoot: string): {
  exists: boolean;
  organizations: number;
  planes: number;
  users: number;
  memberships: number;
  owners: number;
} {
  const sqlitePath = resolveControlPlaneSqlitePath(cloudRoot);
  if (!existsSync(sqlitePath)) {
    return { exists: false, organizations: 0, planes: 0, users: 0, memberships: 0, owners: 0 };
  }
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const count = (table: string): number =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    return {
      exists: true,
      organizations: count("organizations"),
      planes: count("operational_planes"),
      users: count("users"),
      memberships: count("organization_memberships"),
      owners: (
        db
          .prepare(
            `SELECT count(*) AS n FROM organization_memberships
             WHERE role = 'owner' AND status = 'ACTIVE'`,
          )
          .get() as { n: number }
      ).n,
    };
  } finally {
    db.close();
  }
}

function ownerEmails(cloudRoot: string): string[] {
  const sqlitePath = resolveControlPlaneSqlitePath(cloudRoot);
  if (!existsSync(sqlitePath)) {
    return [];
  }
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare(
          `SELECT u.email AS email
           FROM users u
           JOIN organization_memberships m ON m.user_id = u.user_id
           WHERE m.role = 'owner' AND m.status = 'ACTIVE'
           ORDER BY u.email`,
        )
        .all() as Array<{ email: string }>
    ).map((row) => row.email);
  } finally {
    db.close();
  }
}

function expectNoBusinessRows(cloudRoot: string): void {
  const counts = controlPlaneCounts(cloudRoot);
  expect(counts.organizations).toBe(0);
  expect(counts.planes).toBe(0);
  expect(counts.users).toBe(0);
  expect(counts.memberships).toBe(0);
}

function expectSecretAbsent(haystack: string, password: string): void {
  expect(haystack).not.toContain(password);
  expect(haystack.toLowerCase()).not.toContain("password_hash");
  expect(haystack.toLowerCase()).not.toContain("passwordsalt");
}

async function captureCli(
  argv: string[],
  input: NodeJS.ReadableStream,
  env: NodeJS.ProcessEnv = { NODE_ENV: "test" },
): Promise<{ stdout: string; stderr: string }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  const errWrite = process.stderr.write.bind(process.stderr);
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk, ...rest) => {
    errors.push(String(chunk));
    return errWrite(chunk, ...(rest as []));
  });
  try {
    await runDevProvisionCli(argv, env, input);
    return { stdout: logs.join("\n"), stderr: errors.join("") };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

async function seedLegacyIncompleteActive(cloudRoot: string): Promise<{
  organizationId: string;
  planeId: string;
}> {
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  try {
    const seeded = await provisionOrganizationWithPlane(controlPlane, {
      displayName: "Incident Fixture",
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    controlPlane.db
      .prepare(
        `UPDATE organizations
         SET status = 'ACTIVE', provision_owner_email = NULL, provision_failure_code = NULL
         WHERE organization_id = ?`,
      )
      .run(seeded.organization.organizationId);
    expect(controlPlane.countUsers()).toBe(0);
    expect(controlPlane.countMemberships(seeded.organization.organizationId)).toBe(0);
    expect(controlPlane.countPlanes(seeded.organization.organizationId)).toBe(1);
    return {
      organizationId: seeded.organization.organizationId,
      planeId: seeded.plane.planeId,
    };
  } finally {
    controlPlane.close();
  }
}

describe("Cloud provisioning password prevalidation", () => {
  it.each([
    ["too short", "short"],
    ["no letters", "1234567890!"],
    ["no digits", "abcdefghij"],
    ["pin-like", "1234567890"],
  ])("refuses %s before any Control Plane write", async (_label, password) => {
    const root = freshRoot();
    await expect(
      runDevProvisionCli(
        ["--root", root, "--org", "HUB MEDIA", "--email", "owner@example.test", "--password-stdin"],
        { NODE_ENV: "test" },
        Readable.from([`${password}\n`]),
      ),
    ).rejects.toBeInstanceOf(CloudPasswordError);
    expect(existsSync(root)).toBe(false);
    expectNoBusinessRows(root);
  });

  it("refuses EOF before any write", async () => {
    const root = freshRoot();
    await expect(
      runDevProvisionCli(
        ["--root", root, "--org", "HUB MEDIA", "--email", "owner@example.test"],
        { NODE_ENV: "test" },
        Readable.from([]),
      ),
    ).rejects.toThrow(/Password required/);
    expect(existsSync(root)).toBe(false);
    expectNoBusinessRows(root);
  });

  it("refuses an invalid resume password before opening an existing root", async () => {
    const root = freshRoot();
    const seeded = await seedLegacyIncompleteActive(root);
    const sqlitePath = resolveControlPlaneSqlitePath(root);
    const before = existsSync(sqlitePath) ? readFileSync(sqlitePath) : Buffer.alloc(0);
    await expect(
      resumeOrganizationProvision({
        cloudRoot: root,
        organizationId: seeded.organizationId,
        email: "owner@example.test",
        password: "short",
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toBeInstanceOf(CloudPasswordError);
    expect(readFileSync(sqlitePath).equals(before)).toBe(true);
    expect(controlPlaneCounts(root)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 0,
      memberships: 0,
    });
  });

  it("refuses cancelled TTY input before any write", async () => {
    const root = freshRoot();
    const input = new Readable({
      read() {
        this.push("\u0003");
        this.push(null);
      },
    });
    Object.assign(input, {
      isTTY: true,
      setRawMode: () => undefined,
    });
    await expect(readProvisionPassword([], input)).rejects.toThrow(/cancelled/);
    expect(existsSync(root)).toBe(false);
    expectNoBusinessRows(root);
  });

  it("accepts a valid password and creates one owner", async () => {
    const root = freshRoot();
    const output = await captureCli(
      ["--root", root, "--org", "Atelier Valid", "--email", "owner@example.test", "--password-stdin"],
      Readable.from([`${OWNER_PASSWORD}\n`]),
    );
    expectSecretAbsent(output.stdout, OWNER_PASSWORD);
    expectSecretAbsent(output.stderr, OWNER_PASSWORD);
    const counts = controlPlaneCounts(root);
    expect(counts).toMatchObject({
      exists: true,
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
    });
    const fixture = openCloudFixture(root);
    try {
      const organization = fixture.controlPlane.listOrganizations()[0];
      expect(organization.status).toBe("ACTIVE");
      expect(organization.provisionFailureCode).toBeNull();
      expect(JSON.stringify(organization)).not.toContain(OWNER_PASSWORD);
      const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
      expect(login.response.status).toBe(200);
    } finally {
      fixture.close();
    }
  });
});

describe("Cloud provisioning fault injection", () => {
  const faults: Array<{
    fault: ProvisionFaultHook;
    persisted: "none" | "retryable";
  }> = [
    { fault: "before_control_plane_open", persisted: "none" },
    { fault: "after_org_intent", persisted: "none" },
    { fault: "after_plane_registration", persisted: "retryable" },
    { fault: "during_operational_plane", persisted: "retryable" },
    { fault: "after_operational_plane", persisted: "retryable" },
    { fault: "during_user_hashing", persisted: "retryable" },
    { fault: "after_user_insert", persisted: "retryable" },
    { fault: "before_membership", persisted: "retryable" },
    { fault: "after_membership_before_active", persisted: "retryable" },
  ];

  it.each(faults)(
    "keeps $fault fail-closed and resumable without duplicates",
    async ({ fault, persisted }) => {
      const root = freshRoot();
      const input = {
        cloudRoot: root,
        displayName: "Fault Org",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        bootstrapPolicy: "SYNTHETIC_TEST" as const,
        hooks: { fault },
        env: { NODE_ENV: "test" },
      };
      await expect(provisionNewOrganization(input)).rejects.toBeInstanceOf(ProvisionConflictError);
      const counts = controlPlaneCounts(root);
      if (persisted === "none") {
        expect(counts.organizations).toBe(0);
        expect(counts.planes).toBe(0);
        expect(counts.users).toBe(0);
        expect(counts.memberships).toBe(0);
      } else {
        expect(counts.organizations).toBe(1);
        expect(counts.users).toBe(0);
        expect(counts.memberships).toBe(0);
        const controlPlane = openProvisionedControlPlane(root);
        try {
          const organization = controlPlane.listOrganizations()[0];
          expect(organization.status).not.toBe("ACTIVE");
          expect(organization.provisionFailureCode).toBeTruthy();
          expect(organization.provisionFailureCode).not.toContain(OWNER_PASSWORD);
          expect(isOrganizationResumeEligible(organization, controlPlane)).toBe(true);
        } finally {
          controlPlane.close();
        }
        expect(controlPlaneCounts(root).users).toBe(0);
        expect(controlPlaneCounts(root).memberships).toBe(0);
        const blocked = openCloudFixture(root);
        try {
          const login = await loginCloud(blocked.app, "owner@example.test", OWNER_PASSWORD);
          expect(login.response.status).not.toBe(200);
        } finally {
          blocked.close();
        }
      }

      if (persisted === "none") {
        await expect(
          resumeOrganizationProvision({
            cloudRoot: root,
            organizationId: "org:missing",
            email: "owner@example.test",
            password: OWNER_PASSWORD,
            env: { NODE_ENV: "test" },
          }),
        ).rejects.toMatchObject({ code: "organization_missing" });
        expectNoBusinessRows(root);
        return;
      }

      const first = await resumeOrganizationProvision({
        cloudRoot: root,
        organizationId: openAndReadOrgId(root),
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      });
      expect(first.alreadyActive).toBe(false);
      expect(first.organization.status).toBe("ACTIVE");
      expect(controlPlaneCounts(root)).toMatchObject({
        organizations: 1,
        planes: 1,
        users: 1,
        memberships: 1,
      });
      const fingerprint = readPasswordFingerprint(root, "owner@example.test");
      const second = await resumeOrganizationProvision({
        cloudRoot: root,
        organizationId: first.organization.organizationId,
        email: "owner@example.test",
        password: "OtherPass12",
        env: { NODE_ENV: "test" },
      });
      expect(second.alreadyActive).toBe(true);
      expect(second.user.userId).toBe(first.user.userId);
      expect(readPasswordFingerprint(root, "owner@example.test")).toEqual(fingerprint);
      expect(controlPlaneCounts(root)).toMatchObject({
        organizations: 1,
        planes: 1,
        users: 1,
        memberships: 1,
      });
    },
  );
});

function readPasswordFingerprint(cloudRoot: string, email: string): { hash: string; salt: string } {
  const db = new Database(resolveControlPlaneSqlitePath(cloudRoot), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const row = db
      .prepare(`SELECT password_hash, password_salt FROM users WHERE email = ?`)
      .get(email) as { password_hash: Buffer; password_salt: Buffer };
    return {
      hash: Buffer.from(row.password_hash).toString("hex"),
      salt: Buffer.from(row.password_salt).toString("hex"),
    };
  } finally {
    db.close();
  }
}

function openAndReadOrgId(cloudRoot: string): string {
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  try {
    return controlPlane.listOrganizations()[0]?.organizationId ?? "";
  } finally {
    controlPlane.close();
  }
}

describe("Cloud resume of the current incident shape", () => {
  it("completes a legacy ACTIVE organization that has a plane and no owner", async () => {
    const root = freshRoot();
    const seeded = await seedLegacyIncompleteActive(root);
    const before = openProvisionedControlPlane(root);
    try {
      const inspection = inspectOrganizationProvision(before, seeded.organizationId);
      expect(inspection.organization?.status).toBe("ACTIVE");
      expect(inspection.userCount).toBe(0);
      expect(inspection.membershipCount).toBe(0);
      expect(inspection.planeCount).toBe(1);
      expect(inspection.operationalPlane).toEqual({ ok: true });
      expect(
        isOrganizationResumeEligible(inspection.organization!, before),
      ).toBe(true);
      expect(listResumeEligibleOrganizations(before)).toHaveLength(1);
    } finally {
      before.close();
    }

    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Second",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({
      code: "incomplete_organization_exists",
      detail: seeded.organizationId,
    });
    expect(controlPlaneCounts(root)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 0,
      memberships: 0,
    });

    const output = await captureCli(
      [
        "--resume",
        "--root",
        root,
        "--organization-id",
        seeded.organizationId,
        "--email",
        "owner@example.test",
        "--password-stdin",
      ],
      Readable.from([`${OWNER_PASSWORD}\n`]),
    );
    expect(output.stdout).not.toContain("already_active");
    expectSecretAbsent(output.stdout, OWNER_PASSWORD);
    expectSecretAbsent(output.stderr, OWNER_PASSWORD);
    expect(controlPlaneCounts(root)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
    });

    const fixture = openCloudFixture(root);
    try {
      const organization = fixture.controlPlane.getOrganization(seeded.organizationId);
      expect(organization?.status).toBe("ACTIVE");
      expect(organization?.provisionFailureCode).toBeNull();
      const plane = fixture.controlPlane.getPlaneByOrganization(seeded.organizationId);
      expect(plane?.planeId).toBe(seeded.planeId);
      const login = await loginCloud(
        fixture.app,
        "owner@example.test",
        OWNER_PASSWORD,
        seeded.organizationId,
      );
      expect(login.response.status).toBe(200);
    } finally {
      fixture.close();
    }

    const fingerprint = readPasswordFingerprint(root, "owner@example.test");
    const again = await resumeOrganizationProvision({
      cloudRoot: root,
      organizationId: seeded.organizationId,
      email: "owner@example.test",
      password: "OtherPass12",
      env: { NODE_ENV: "test" },
    });
    expect(again.alreadyActive).toBe(true);
    expect(readPasswordFingerprint(root, "owner@example.test")).toEqual(fingerprint);
    expect(controlPlaneCounts(root)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
    });
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Second",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "conflicting_user" });
    expect(controlPlaneCounts(root).organizations).toBe(1);

    const reopened = openProvisionedControlPlane(root);
    try {
      expect(reopened.getOrganization(seeded.organizationId)?.status).toBe("ACTIVE");
      expect(reopened.countUsers()).toBe(1);
      expect(reopened.countMemberships(seeded.organizationId)).toBe(1);
    } finally {
      reopened.close();
    }
  });
});

describe("Cloud provision conflict and isolation", () => {
  it("refuses an organization id that belongs to another root", async () => {
    const first = await provisionNewOrganization({
      cloudRoot: freshRoot(),
      displayName: "First",
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    const otherRoot = freshRoot();
    await expect(
      resumeOrganizationProvision({
        cloudRoot: otherRoot,
        organizationId: first.organization.organizationId,
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "organization_missing" });
    expectNoBusinessRows(otherRoot);
  });

  it("refuses a stored owner-email mismatch", async () => {
    const root = freshRoot();
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Mismatch",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        hooks: { fault: "after_plane_registration" },
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toBeInstanceOf(ProvisionConflictError);
    await expect(
      resumeOrganizationProvision({
        cloudRoot: root,
        organizationId: openAndReadOrgId(root),
        email: "other@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "email_mismatch" });
    expect(controlPlaneCounts(root).users).toBe(0);
  });

  it("refuses a membership that belongs to a different user", async () => {
    const root = freshRoot();
    const controlPlane = openProvisionedControlPlane(root);
    let organizationId = "";
    try {
      const seeded = await provisionOrganizationWithPlane(controlPlane, {
        displayName: "Conflict",
        ownerEmail: "owner@example.test",
        bootstrapPolicy: "SYNTHETIC_TEST",
      });
      organizationId = seeded.organization.organizationId;
      const stranger = await controlPlane.createUser({
        email: "stranger@example.test",
        password: OWNER_PASSWORD,
      });
      controlPlane.addMembership({
        userId: stranger.userId,
        organizationId,
        role: "member",
      });
    } finally {
      controlPlane.close();
    }
    await expect(
      resumeOrganizationProvision({
        cloudRoot: root,
        organizationId,
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "conflicting_membership" });
  });

  it("refuses a second plane for the same organization and a missing plane", async () => {
    const root = freshRoot();
    const controlPlane = openProvisionedControlPlane(root);
    let organizationId = "";
    try {
      const seeded = await provisionOrganizationWithPlane(controlPlane, {
        displayName: "Planes",
        bootstrapPolicy: "SYNTHETIC_TEST",
      });
      organizationId = seeded.organization.organizationId;
      expect(() =>
        controlPlane.createPlane({
          organizationId,
          bootstrapPolicy: "SYNTHETIC_TEST",
        }),
      ).toThrow(/UNIQUE/);
      controlPlane.removePlane(seeded.plane.planeId);
    } finally {
      controlPlane.close();
    }
    await expect(
      resumeOrganizationProvision({
        cloudRoot: root,
        organizationId,
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "plane_missing" });
  });

  it("detects a missing or incomplete Operational Plane and resume can rebuild it", async () => {
    const root = freshRoot();
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Heal",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        hooks: { fault: "after_plane_registration" },
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toBeInstanceOf(ProvisionConflictError);
    const controlPlane = openProvisionedControlPlane(root);
    try {
      const organization = controlPlane.listOrganizations()[0];
      const plane = controlPlane.getPlaneByOrganization(organization.organizationId);
      expect(inspectOperationalPlane(root, plane!.planeKey, plane!.bootstrapPolicy)).toEqual({
        ok: false,
        code: "plane_missing",
      });
    } finally {
      controlPlane.close();
    }
    const resumed = await resumeOrganizationProvision({
      cloudRoot: root,
      organizationId: openAndReadOrgId(root),
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    expect(resumed.organization.status).toBe("ACTIVE");
    expect(
      inspectOperationalPlane(root, resumed.plane.planeKey, resumed.plane.bootstrapPolicy),
    ).toEqual({ ok: true });
  });

  it("refuses resume of a complete organization with a different email without writing", async () => {
    const root = freshRoot();
    const created = await provisionNewOrganization({
      cloudRoot: root,
      displayName: "Complete",
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    await expect(
      resumeOrganizationProvision({
        cloudRoot: root,
        organizationId: created.organization.organizationId,
        email: "other@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "already_active" });
    expect(controlPlaneCounts(root)).toMatchObject({ users: 1, memberships: 1, organizations: 1 });
  });

  it("resumes only the requested incomplete organization when two exist", async () => {
    const root = freshRoot();
    const controlPlane = openProvisionedControlPlane(root);
    let firstId = "";
    let secondId = "";
    try {
      firstId = (
        await provisionOrganizationWithPlane(controlPlane, {
          displayName: "One",
          ownerEmail: "one@example.test",
          bootstrapPolicy: "SYNTHETIC_TEST",
        })
      ).organization.organizationId;
      secondId = (
        await provisionOrganizationWithPlane(controlPlane, {
          displayName: "Two",
          ownerEmail: "two@example.test",
          bootstrapPolicy: "SYNTHETIC_TEST",
        })
      ).organization.organizationId;
    } finally {
      controlPlane.close();
    }
    const resumed = await resumeOrganizationProvision({
      cloudRoot: root,
      organizationId: firstId,
      email: "one@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    expect(resumed.organization.organizationId).toBe(firstId);
    expect(resumed.organization.status).toBe("ACTIVE");
    const after = openProvisionedControlPlane(root);
    try {
      expect(after.getOrganization(secondId)?.status).toBe("PROVISIONING");
      expect(after.countMemberships(secondId)).toBe(0);
    } finally {
      after.close();
    }
  });

  it("refuses a second create when an incomplete organization already owns the email", async () => {
    const root = freshRoot();
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "First",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        hooks: { fault: "after_plane_registration" },
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toBeInstanceOf(ProvisionConflictError);
    const organizationId = openAndReadOrgId(root);
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Second",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({
      code: "incomplete_organization_exists",
      detail: organizationId,
    });
    expect(controlPlaneCounts(root).organizations).toBe(1);
  });

  it("does not overwrite an existing user's password on a new provision", async () => {
    const root = freshRoot();
    await provisionNewOrganization({
      cloudRoot: root,
      displayName: "Existing",
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Other",
        email: "owner@example.test",
        password: "OtherPass12",
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "conflicting_user" });
    expect(controlPlaneCounts(root)).toMatchObject({ organizations: 1, users: 1, memberships: 1 });
    const fixture = openCloudFixture(root);
    try {
      const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
      expect(login.response.status).toBe(200);
      const stolen = await loginCloud(fixture.app, "owner@example.test", "OtherPass12");
      expect(stolen.response.status).toBe(401);
    } finally {
      fixture.close();
    }
  });

  it("refuses production and argv passwords", async () => {
    const root = freshRoot();
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Prod",
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "production" },
      }),
    ).rejects.toMatchObject({ code: "production_refused" });
    expect(existsSync(root)).toBe(false);
    expect(() =>
      rejectArgvPassword(["--root", root, "--password", OWNER_PASSWORD]),
    ).toThrow(/must not be passed as --password/);
    expect(() =>
      rejectArgvPassword([`--password=${OWNER_PASSWORD}`]),
    ).toThrow(/must not be passed as --password/);
    await expect(
      runDevProvisionCli(
        ["--root", root, "--org", "X", "--email", "owner@example.test", "--password", OWNER_PASSWORD],
        { NODE_ENV: "test" },
        Readable.from([]),
      ),
    ).rejects.toThrow(/must not be passed as --password/);
    expect(existsSync(root)).toBe(false);
  });

  it("refuses --org as a resume selector", async () => {
    const root = freshRoot();
    await expect(
      runDevProvisionCli(
        [
          "--resume",
          "--root",
          root,
          "--org",
          "HUB MEDIA",
          "--email",
          "owner@example.test",
          "--password-stdin",
        ],
        { NODE_ENV: "test" },
        Readable.from([`${OWNER_PASSWORD}\n`]),
      ),
    ).rejects.toThrow(/Resume forbids --org/);
    expect(existsSync(root)).toBe(false);
  });
});

describe("Control Plane provisioning migration", () => {
  it("upgrades an existing organization row without inventing an owner", () => {
    const root = freshRoot();
    const sqlitePath = resolveControlPlaneSqlitePath(root);
    mkdirSync(dirname(sqlitePath), { recursive: true });
    const db = new Database(sqlitePath);
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    db.exec(readFileSync(CONTROL_PLANE_MIGRATION_001, "utf8"));
    db.prepare(`INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`).run(
      "001_organizations_users_sessions.sql",
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO organizations
       (organization_id, slug, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "org:legacy-upgrade",
      "legacy-upgrade",
      "Legacy",
      "ACTIVE",
      new Date().toISOString(),
      new Date().toISOString(),
    );
    db.close();

    const upgraded = openControlPlaneDatabase(sqlitePath);
    try {
      applyControlPlaneMigrations(upgraded);
      const columns = upgraded
        .prepare(`PRAGMA table_info(organizations)`)
        .all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["provision_owner_email", "provision_failure_code"]),
      );
      const row = upgraded
        .prepare(
          `SELECT status, provision_owner_email, provision_failure_code FROM organizations WHERE organization_id = ?`,
        )
        .get("org:legacy-upgrade") as {
        status: string;
        provision_owner_email: string | null;
        provision_failure_code: string | null;
      };
      expect(row.status).toBe("ACTIVE");
      expect(row.provision_owner_email).toBeNull();
      expect(row.provision_failure_code).toBeNull();
      const indexes = upgraded
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
        .all() as Array<{ name: string }>;
      expect(indexes.map((item) => item.name)).toContain(
        "idx_organizations_provision_owner_email",
      );
      const migrations = upgraded
        .prepare(`SELECT id FROM schema_migrations ORDER BY id`)
        .all() as Array<{ id: string }>;
      expect(migrations.map((item) => item.id)).toEqual([
        "001_organizations_users_sessions.sql",
        "002_organization_provisioning_state.sql",
      ]);
    } finally {
      upgraded.close();
    }

    const reopened = openControlPlaneDatabase(sqlitePath);
    try {
      applyControlPlaneMigrations(reopened);
      const again = reopened
        .prepare(`SELECT count(*) AS n FROM schema_migrations`)
        .get() as { n: number };
      expect(again.n).toBe(2);
    } finally {
      reopened.close();
    }
  });

  it("preserves ACTIVE-with-owner, DISABLED, PROVISIONING, FAILED_RETRYABLE, and two leftover rows", () => {
    const root = freshRoot();
    const sqlitePath = resolveControlPlaneSqlitePath(root);
    mkdirSync(dirname(sqlitePath), { recursive: true });
    const db = new Database(sqlitePath);
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    db.exec(readFileSync(CONTROL_PLANE_MIGRATION_001, "utf8"));
    db.prepare(`INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`).run(
      "001_organizations_users_sessions.sql",
      new Date().toISOString(),
    );
    const now = new Date().toISOString();
    const insertOrg = db.prepare(
      `INSERT INTO organizations (organization_id, slug, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertOrg.run("org:owned", "owned", "Owned", "ACTIVE", now, now);
    insertOrg.run("org:disabled", "disabled", "Disabled", "DISABLED", now, now);
    insertOrg.run("org:provisioning", "provisioning", "Provisioning", "PROVISIONING", now, now);
    insertOrg.run("org:failed", "failed", "Failed", "PROVISIONING", now, now);
    db.prepare(
      `INSERT INTO users (user_id, email, password_hash, password_salt, kdf, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("usr:owned", "owned@example.test", Buffer.alloc(8), Buffer.alloc(8), "scrypt:N=32768,r=8,p=1", "ACTIVE", now, now);
    db.prepare(
      `INSERT INTO organization_memberships
       (membership_id, user_id, organization_id, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("mem:owned", "usr:owned", "org:owned", "owner", "ACTIVE", now);
    db.close();

    const upgraded = openControlPlaneDatabase(sqlitePath);
    try {
      applyControlPlaneMigrations(upgraded);
      upgraded
        .prepare(`UPDATE organizations SET status = 'FAILED_RETRYABLE', provision_failure_code = 'test' WHERE organization_id = 'org:failed'`)
        .run();
      const plane = createControlPlane(upgraded, root);
      expect(plane.getOrganization("org:owned")?.status).toBe("ACTIVE");
      expect(isOrganizationResumeEligible(plane.getOrganization("org:owned")!, plane)).toBe(false);
      expect(isOrganizationResumeEligible(plane.getOrganization("org:disabled")!, plane)).toBe(false);
      expect(isOrganizationResumeEligible(plane.getOrganization("org:provisioning")!, plane)).toBe(true);
      expect(isOrganizationResumeEligible(plane.getOrganization("org:failed")!, plane)).toBe(true);
      expect(listResumeEligibleOrganizations(plane).map((item) => item.organizationId).sort()).toEqual([
        "org:failed",
        "org:provisioning",
      ]);
    } finally {
      upgraded.close();
    }
  });
});

describe("Cloud provision leftover fixtures and concurrency", () => {
  it("refuses create when two incomplete organizations exist", async () => {
    const root = freshRoot();
    const controlPlane = openProvisionedControlPlane(root);
    try {
      await provisionOrganizationWithPlane(controlPlane, {
        displayName: "One",
        ownerEmail: "one@example.test",
        bootstrapPolicy: "SYNTHETIC_TEST",
      });
      await provisionOrganizationWithPlane(controlPlane, {
        displayName: "Two",
        ownerEmail: "two@example.test",
        bootstrapPolicy: "SYNTHETIC_TEST",
      });
    } finally {
      controlPlane.close();
    }
    await expect(
      provisionNewOrganization({
        cloudRoot: root,
        displayName: "Third",
        email: "three@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ).rejects.toMatchObject({ code: "multiple_incomplete_organizations" });
    expect(controlPlaneCounts(root).organizations).toBe(2);
  });

  it("resumes a leftover user fixture without inventing a second user", async () => {
    const root = freshRoot();
    const controlPlane = openProvisionedControlPlane(root);
    let organizationId = "";
    try {
      const seeded = await provisionOrganizationWithPlane(controlPlane, {
        displayName: "Leftover User",
        ownerEmail: "owner@example.test",
        bootstrapPolicy: "SYNTHETIC_TEST",
      });
      organizationId = seeded.organization.organizationId;
      await controlPlane.createUser({
        email: "owner@example.test",
        password: OWNER_PASSWORD,
      });
    } finally {
      controlPlane.close();
    }
    const resumed = await resumeOrganizationProvision({
      cloudRoot: root,
      organizationId,
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      env: { NODE_ENV: "test" },
    });
    expect(resumed.alreadyActive).toBe(false);
    expect(controlPlaneCounts(root)).toMatchObject({
      organizations: 1,
      users: 1,
      memberships: 1,
    });
  });

  it("keeps one initial owner across in-process resume races", async () => {
    const sameRoot = freshRoot();
    const sameId = (await seedLegacyIncompleteActive(sameRoot)).organizationId;
    const same = await Promise.allSettled([
      resumeOrganizationProvision({
        cloudRoot: sameRoot,
        organizationId: sameId,
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
      resumeOrganizationProvision({
        cloudRoot: sameRoot,
        organizationId: sameId,
        email: "owner@example.test",
        password: "OtherPass12",
        env: { NODE_ENV: "test" },
      }),
    ]);
    expect(same.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect(controlPlaneCounts(sameRoot)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
    });
    const sameFixture = openCloudFixture(sameRoot);
    try {
      const original = await loginCloud(sameFixture.app, "owner@example.test", OWNER_PASSWORD);
      const rotated = await loginCloud(sameFixture.app, "owner@example.test", "OtherPass12");
      const successes = [original.response.status, rotated.response.status].filter((status) => status === 200);
      expect(successes).toHaveLength(1);
    } finally {
      sameFixture.close();
    }

    const diffRoot = freshRoot();
    const diffId = (await seedLegacyIncompleteActive(diffRoot)).organizationId;
    const different = await Promise.allSettled([
      resumeOrganizationProvision({
        cloudRoot: diffRoot,
        organizationId: diffId,
        email: "one@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
      resumeOrganizationProvision({
        cloudRoot: diffRoot,
        organizationId: diffId,
        email: "two@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
    ]);
    const fulfilled = different.filter((item) => item.status === "fulfilled");
    const rejected = different.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(controlPlaneCounts(diffRoot)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
    });

    const mixRoot = freshRoot();
    const mixId = (await seedLegacyIncompleteActive(mixRoot)).organizationId;
    const mixed = await Promise.allSettled([
      resumeOrganizationProvision({
        cloudRoot: mixRoot,
        organizationId: mixId,
        email: "owner@example.test",
        password: OWNER_PASSWORD,
        env: { NODE_ENV: "test" },
      }),
      provisionNewOrganization({
        cloudRoot: mixRoot,
        displayName: "Second",
        email: "other@example.test",
        password: OWNER_PASSWORD,
        bootstrapPolicy: "SYNTHETIC_TEST",
        env: { NODE_ENV: "test" },
      }),
    ]);
    expect(mixed.some((item) => item.status === "fulfilled")).toBe(true);
    expect(controlPlaneCounts(mixRoot).organizations).toBe(1);
    expect(controlPlaneCounts(mixRoot).users).toBe(1);
    expect(controlPlaneCounts(mixRoot).memberships).toBe(1);
  });

  it("keeps one initial owner across two processes", async () => {
    const resumeRoot = freshRoot();
    const resumeId = (await seedLegacyIncompleteActive(resumeRoot)).organizationId;
    const [first, second] = await Promise.all([
      runProvisionWorker({
        mode: "resume",
        root: resumeRoot,
        organizationId: resumeId,
        email: "one@example.test",
        password: OWNER_PASSWORD,
      }),
      runProvisionWorker({
        mode: "resume",
        root: resumeRoot,
        organizationId: resumeId,
        email: "two@example.test",
        password: OWNER_PASSWORD,
      }),
    ]);
    // Different-email resume: overlapping workers lose claimProvisionOwnerEmail
    // (email_mismatch). A late arriver that starts after the winner activated
    // the leftover org is refused as already_active — the same refusal as
    // "refuses resume of a complete organization with a different email".
    // Neither path writes a second owner.
    const resumeDomain = assertTwoProcessDomainOutcome([first, second], {
      loserCodes: ["email_mismatch", "already_active"],
    });
    expect(controlPlaneCounts(resumeRoot)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
      owners: 1,
    });
    expect(resumeDomain.winner.email).toBeTruthy();
    expect(resumeDomain.winner.email).toBeDefined();
    expect(ownerEmails(resumeRoot)).toEqual([resumeDomain.winner.email]);
    expect(resumeDomain.loser.requestedEmail).not.toBe(resumeDomain.winner.email);

    const createRoot = freshRoot();
    const [created, refused] = await Promise.all([
      runProvisionWorker({
        mode: "create",
        root: createRoot,
        displayName: "CreateA",
        email: "same@example.test",
        password: OWNER_PASSWORD,
      }),
      runProvisionWorker({
        mode: "create",
        root: createRoot,
        displayName: "CreateB",
        email: "same@example.test",
        password: OWNER_PASSWORD,
      }),
    ]);
    // Same-email create: the second process either sees the first org while it is
    // still resume-eligible, sees the finished user, or loses the reserved
    // Control Plane write lock before those checks. SQLITE_BUSY here is a
    // structured worker code from the real CLI path, not a parse/spawn failure.
    assertTwoProcessDomainOutcome([created, refused], {
      loserCodes: ["incomplete_organization_exists", "conflicting_user", "SQLITE_BUSY"],
    });
    expect(controlPlaneCounts(createRoot)).toMatchObject({
      organizations: 1,
      planes: 1,
      users: 1,
      memberships: 1,
      owners: 1,
    });
    expect(ownerEmails(createRoot)).toEqual(["same@example.test"]);
  });

  it("rejects an infrastructure worker failure as a two-process domain loser", () => {
    expect(() =>
      assertTwoProcessDomainOutcome(
        [
          {
            parsed: true,
            ok: true,
            requestedEmail: "one@example.test",
            email: "one@example.test",
          },
          {
            parsed: false,
            infrastructure: "worker_parse_failed",
            requestedEmail: "two@example.test",
          },
        ],
        { loserCodes: ["email_mismatch"] },
      ),
    ).toThrow(/worker_parse_failed/);
  });
});

const WORKER_PROTOCOL = "workos-provision-worker-v1";
const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");

type ParsedWorkerSuccess = {
  parsed: true;
  ok: true;
  requestedEmail: string;
  email?: string;
  userId?: string;
  alreadyActive?: boolean;
  organizationId?: string;
};

type ParsedWorkerFailure = {
  parsed: true;
  ok: false;
  requestedEmail: string;
  code: string;
};

type WorkerOutcome =
  | ParsedWorkerSuccess
  | ParsedWorkerFailure
  | { parsed: false; infrastructure: string; requestedEmail: string };

function assertParsedWorkerResult(
  result: WorkerOutcome,
  label: string,
): ParsedWorkerSuccess | ParsedWorkerFailure {
  expect(result.parsed, `${label} produced ${describeWorkerOutcome(result)}`).toBe(true);
  if (!result.parsed) {
    throw new Error(`${label}: infrastructure failure ${result.infrastructure}`);
  }
  return result;
}

function describeWorkerOutcome(result: WorkerOutcome): string {
  if (!result.parsed) {
    return `infrastructure:${result.infrastructure}`;
  }
  return result.ok ? `domain_success:${result.email ?? result.requestedEmail}` : `domain_rejection:${result.code}`;
}

function assertTwoProcessDomainOutcome(
  results: [WorkerOutcome, WorkerOutcome],
  input: { loserCodes: readonly string[] },
): { winner: ParsedWorkerSuccess; loser: ParsedWorkerFailure } {
  const parsed = results.map((result, index) =>
    assertParsedWorkerResult(result, `child ${index === 0 ? "A" : "B"}`),
  );
  const winners = parsed.filter((result) => result.ok);
  const losers = parsed.filter((result) => !result.ok);
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  const winner = winners[0];
  const loser = losers[0];
  if (!winner.ok || loser.ok) {
    throw new Error("two-process outcome must be one domain success and one domain rejection");
  }
  expect(input.loserCodes, `loser code ${loser.code}`).toContain(loser.code);
  return { winner, loser };
}

function runProvisionWorker(input: {
  mode: "resume" | "create";
  root: string;
  organizationId?: string;
  displayName?: string;
  email: string;
  password: string;
}): Promise<WorkerOutcome> {
  const worker = fileURLToPath(new URL("./cloud-provision-resume-worker.ts", import.meta.url));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, worker], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "test",
        WORKOS_PROVISION_WORKER_MODE: input.mode,
        WORKOS_PROVISION_WORKER_ROOT: input.root,
        WORKOS_PROVISION_WORKER_EMAIL: input.email,
        WORKOS_PROVISION_WORKER_PASSWORD: input.password,
        WORKOS_PROVISION_WORKER_ORG_ID: input.organizationId ?? "",
        WORKOS_PROVISION_WORKER_ORG_NAME: input.displayName ?? "",
      },
      windowsHide: true,
    });
    let stdout = "";
    let settled = false;
    const finish = (result: WorkerOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        parsed: false,
        infrastructure: `spawn_failed:${error.name}`,
        requestedEmail: input.email,
      });
    });
    child.on("close", () => {
      try {
        const payload = JSON.parse(stdout) as {
          protocol?: string;
          ok?: unknown;
          code?: unknown;
          email?: unknown;
          userId?: unknown;
          alreadyActive?: unknown;
          organizationId?: unknown;
        };
        if (payload.protocol !== WORKER_PROTOCOL || typeof payload.ok !== "boolean") {
          finish({
            parsed: false,
            infrastructure: "invalid_worker_output",
            requestedEmail: input.email,
          });
          return;
        }
        if (payload.ok) {
          finish({
            parsed: true,
            ok: true,
            requestedEmail: input.email,
            email: typeof payload.email === "string" ? payload.email : undefined,
            userId: typeof payload.userId === "string" ? payload.userId : undefined,
            alreadyActive: typeof payload.alreadyActive === "boolean" ? payload.alreadyActive : undefined,
            organizationId:
              typeof payload.organizationId === "string" ? payload.organizationId : undefined,
          });
          return;
        }
        if (typeof payload.code !== "string" || payload.code.length === 0) {
          finish({
            parsed: false,
            infrastructure: "missing_result",
            requestedEmail: input.email,
          });
          return;
        }
        finish({
          parsed: true,
          ok: false,
          requestedEmail: input.email,
          code: payload.code,
        });
      } catch {
        finish({
          parsed: false,
          infrastructure: stdout.trim() ? "worker_parse_failed" : "missing_result",
          requestedEmail: input.email,
        });
      }
    });
  });
}
