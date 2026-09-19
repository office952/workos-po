import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createCloudBackup, CloudBackupError, type CloudBackupManifest } from "../src/cloud/backup.js";
import { CloudRestoreError, restoreCloudBackup } from "../src/cloud/restore.js";
import {
  ProductionOriginConfigError,
  mutatingOriginAllowed,
  PRODUCTION_HSTS_VALUE,
} from "../src/ops/origin.js";
import { cloudRuntimeLeasePath, CloudRuntimeLeaseError } from "../src/ops/runtimeLease.js";
import { startWorkosApi } from "../src/startApi.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  openCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";
import { provisionHostileIsolationWorld } from "./cloud-isolation-fixture.js";

afterEach(() => {
  cleanupCloudTemps();
});

const PRODUCTION_ORIGIN = "https://workos.example";

function readManifest(backupDir: string): CloudBackupManifest {
  return JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8")) as CloudBackupManifest;
}

function writeManifest(backupDir: string, manifest: CloudBackupManifest): void {
  writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const pid = child.pid;
  if (!pid) {
    throw new Error("missing child pid");
  }
  await new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
  return pid;
}

function writeLease(
  cloudRoot: string,
  lease: { leaseId: string; pid: number; startedAt?: string; purpose?: "api" | "backup" },
): void {
  const path = cloudRuntimeLeasePath(cloudRoot);
  mkdirSync(join(cloudRoot, "ops"), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({
      version: 1,
      leaseId: lease.leaseId,
      pid: lease.pid,
      startedAt: lease.startedAt ?? new Date().toISOString(),
      purpose: lease.purpose ?? "api",
    })}\n`,
  );
}

async function startCloudApi(
  cloudRoot: string,
  env: NodeJS.ProcessEnv = {},
) {
  return startWorkosApi(
    {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      WORKOS_CLOUD_ROOT: cloudRoot,
      WORKOS_SQLITE_PATH: "",
      WORKOS_PUBLIC_ORIGIN: env.WORKOS_PUBLIC_ORIGIN ?? "",
      WORKOS_TRUSTED_ORIGINS: "",
      ...env,
    },
    { installSignals: false },
  );
}

async function provisionSimpleCloud(): Promise<string> {
  const fixture = createCloudFixture();
  await addOrganization(fixture, "Runtime Org");
  const cloudRoot = fixture.cloudRoot;
  fixture.close();
  return cloudRoot;
}

describe("cloud runtime recovery safety closure", () => {
  it("A: refuses backup while a live Cloud API holds the runtime lease", async () => {
    const cloudRoot = await provisionSimpleCloud();
    const started = await startCloudApi(cloudRoot);
    try {
      await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
      throw new Error("expected live runtime backup to fail");
    } catch (error) {
      expect((error as CloudBackupError).code).toBe("cloud_runtime_active");
    } finally {
      await started.close();
    }
  });

  it("B: backs up after a clean API stop", async () => {
    const cloudRoot = await provisionSimpleCloud();
    const started = await startCloudApi(cloudRoot);
    await started.close();
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
    const backup = await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
    expect(backup.manifest.organizationCount).toBe(1);
    expect(backup.manifest.planeCount).toBe(1);
  });

  it("C: recovers a stale runtime marker after the process is proven dead", async () => {
    const cloudRoot = await provisionSimpleCloud();
    writeLease(cloudRoot, { leaseId: "stalelease12", pid: await deadPid(), purpose: "api" });
    const backup = await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
    expect(backup.manifest.planeCount).toBe(1);
    const started = await startCloudApi(cloudRoot);
    try {
      const lease = JSON.parse(readFileSync(cloudRuntimeLeasePath(cloudRoot), "utf8")) as {
        pid: number;
        leaseId: string;
      };
      expect(lease.pid).toBe(process.pid);
      expect(lease.leaseId).not.toBe("stalelease12");
    } finally {
      await started.close();
    }
  });

  it("A2: refuses API start while backup holds the exclusive lease", async () => {
    const cloudRoot = await provisionSimpleCloud();
    const backup = await createCloudBackup({
      cloudRoot,
      backupRoot: trackTempDir(),
      onAfterControlSnapshot: async () => {
        await expect(startCloudApi(cloudRoot)).rejects.toMatchObject({
          code: "cloud_runtime_active",
        });
        const held = JSON.parse(readFileSync(cloudRuntimeLeasePath(cloudRoot), "utf8")) as {
          purpose: string;
        };
        expect(held.purpose).toBe("backup");
      },
    });
    expect(backup.manifest.planeCount).toBe(1);
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("A3: refuses a second backup while a backup lease is held", async () => {
    const cloudRoot = await provisionSimpleCloud();
    await createCloudBackup({
      cloudRoot,
      backupRoot: trackTempDir(),
      onAfterControlSnapshot: async () => {
        await expect(
          createCloudBackup({ cloudRoot, backupRoot: trackTempDir() }),
        ).rejects.toMatchObject({ code: "cloud_runtime_active" });
      },
    });
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("A4: releases the backup lease after a handled failure", async () => {
    const cloudRoot = await provisionSimpleCloud();
    await expect(
      createCloudBackup({
        cloudRoot,
        backupRoot: trackTempDir(),
        onAfterControlSnapshot: () => {
          throw new Error("injected backup failure");
        },
      }),
    ).rejects.toThrow(/injected backup failure/);
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("A5: removes the backup lease after a successful backup", async () => {
    const cloudRoot = await provisionSimpleCloud();
    await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("A6: recovers a stale backup lease from a proven-dead process", async () => {
    const cloudRoot = await provisionSimpleCloud();
    writeLease(cloudRoot, {
      leaseId: "stalebackup12",
      pid: await deadPid(),
      purpose: "backup",
    });
    const recovered = await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
    expect(recovered.manifest.planeCount).toBe(1);
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
    writeLease(cloudRoot, {
      leaseId: "stalebackup13",
      pid: await deadPid(),
      purpose: "backup",
    });
    const started = await startCloudApi(cloudRoot);
    try {
      const lease = JSON.parse(readFileSync(cloudRuntimeLeasePath(cloudRoot), "utf8")) as {
        purpose: string;
        pid: number;
      };
      expect(lease.purpose).toBe("api");
      expect(lease.pid).toBe(process.pid);
    } finally {
      await started.close();
    }
    const backup = await createCloudBackup({ cloudRoot, backupRoot: trackTempDir() });
    expect(backup.manifest.planeCount).toBe(1);
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("D: refuses a second API process for the same Cloud root", async () => {
    const cloudRoot = await provisionSimpleCloud();
    const first = await startCloudApi(cloudRoot);
    try {
      await startCloudApi(cloudRoot);
      throw new Error("expected second API to be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(CloudRuntimeLeaseError);
      expect((error as CloudRuntimeLeaseError).code).toBe("cloud_runtime_active");
    } finally {
      await first.close();
    }
  });

  it("E: reads Control Plane inventory from the backup snapshot, not the live source", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const liveControl = join(world.fixture.cloudRoot, "control", "control-plane.sqlite");
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
      onAfterControlSnapshot: () => {
        const db = new Database(liveControl);
        try {
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO organizations (
               organization_id, slug, display_name, status, created_at, updated_at
             ) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
          ).run("org:live-only", "live-only", "Live Only", now, now);
        } finally {
          db.close();
        }
      },
    });
    const countOrganizations = (sqlitePath: string): number => {
      const db = new Database(sqlitePath, { readonly: true });
      try {
        return (db.prepare("SELECT COUNT(*) AS n FROM organizations").get() as { n: number }).n;
      } finally {
        db.close();
      }
    };
    const liveOrgs = countOrganizations(liveControl);
    const snapshotOrgs = countOrganizations(
      join(backup.backupDir, "control", "control-plane.sqlite"),
    );
    expect(liveOrgs).toBe(3);
    expect(snapshotOrgs).toBe(2);
    expect(backup.manifest.organizationCount).toBe(2);
    expect(backup.manifest.planeCount).toBe(2);
  });

  it("F: restore fails closed when a schema migration ledger is tampered", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const controlSqlite = join(backup.backupDir, "control", "control-plane.sqlite");
    const removed = backup.manifest.controlPlaneMigrations[0];
    if (!removed) {
      throw new Error("missing control migration");
    }
    const db = new Database(controlSqlite);
    try {
      db.prepare("DELETE FROM schema_migrations WHERE id = ?").run(removed);
    } finally {
      db.close();
    }
    const manifest = readManifest(backup.backupDir);
    const artifact = manifest.artifacts.find((item) => item.path === "control/control-plane.sqlite");
    if (!artifact) {
      throw new Error("missing control artifact");
    }
    const bytes = readFileSync(controlSqlite);
    artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    artifact.bytes = bytes.byteLength;
    writeManifest(backup.backupDir, manifest);
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected schema mismatch");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("schema_mismatch");
    }
  });

  it("G: restore fails when manifest organizationCount is tampered", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    writeManifest(backup.backupDir, { ...backup.manifest, organizationCount: 99 });
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected organization count failure");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("invalid_manifest");
    }
  });

  it("H: restore fails when manifest planeCount is tampered", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    writeManifest(backup.backupDir, { ...backup.manifest, planeCount: 99 });
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected plane count failure");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("invalid_manifest");
    }
  });

  it("I: restore fails when a manifest path escapes the backup directory", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const escaped: CloudBackupManifest = {
      ...backup.manifest,
      artifacts: [
        ...backup.manifest.artifacts,
        {
          path: "../escape.sqlite",
          sha256: "ab".repeat(32),
          kind: "sqlite",
          bytes: 1,
        },
      ],
    };
    writeManifest(backup.backupDir, escaped);
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected path escape failure");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("invalid_manifest");
    }
  });

  it("J: second active plane missing makes /api/ready return 503", async () => {
    const world = await provisionHostileIsolationWorld();
    const secondSqlite = join(world.testCompany.planeRoot, "product-system.sqlite");
    world.fixture.close();
    rmSync(secondSqlite);
    const fixture = openCloudFixture(world.fixture.cloudRoot);
    const response = await fixture.app.request("/api/ready");
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, boolean>;
    };
    expect(response.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(JSON.stringify(body)).not.toMatch(/org:|organizations\\|planeKey/i);
    fixture.close();
  });

  it("K: second active plane identity mismatch makes /api/ready return 503", async () => {
    const world = await provisionHostileIsolationWorld();
    const secondSqlite = join(world.testCompany.planeRoot, "product-system.sqlite");
    world.fixture.close();
    const db = new Database(secondSqlite);
    try {
      db.prepare(
        `UPDATE operational_plane_identity SET organization_id = 'org:other' WHERE id = 'current'`,
      ).run();
    } finally {
      db.close();
    }
    const fixture = openCloudFixture(world.fixture.cloudRoot);
    const response = await fixture.app.request("/api/ready");
    const body = (await response.json()) as { status: string };
    expect(response.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(JSON.stringify(body)).not.toMatch(/org:other|org:/i);
    fixture.close();
  });

  it("L: production Cloud missing WORKOS_PUBLIC_ORIGIN fails closed at startup", async () => {
    const cloudRoot = await provisionSimpleCloud();
    await expect(
      startCloudApi(cloudRoot, {
        NODE_ENV: "production",
        WORKOS_PUBLIC_ORIGIN: "",
      }),
    ).rejects.toMatchObject({ code: "production_origin_missing" });
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);

    const fixture = createCloudFixture();
    expect(() =>
      createApp({
        cloud: { controlPlane: fixture.controlPlane, registry: fixture.registry },
        env: { NODE_ENV: "production" },
      }),
    ).toThrow(ProductionOriginConfigError);
    fixture.close();
  });

  it("M: production Cloud rejects malformed and non-HTTPS public origins", async () => {
    const cloudRoot = await provisionSimpleCloud();
    await expect(
      startCloudApi(cloudRoot, {
        NODE_ENV: "production",
        WORKOS_PUBLIC_ORIGIN: "http://example.com",
      }),
    ).rejects.toMatchObject({ code: "production_origin_not_https" });
    await expect(
      startCloudApi(cloudRoot, {
        NODE_ENV: "production",
        WORKOS_PUBLIC_ORIGIN: "https://example.com/app",
      }),
    ).rejects.toMatchObject({ code: "production_origin_invalid" });
    await expect(
      startCloudApi(cloudRoot, {
        NODE_ENV: "production",
        WORKOS_PUBLIC_ORIGIN: "not-a-url",
      }),
    ).rejects.toMatchObject({ code: "production_origin_invalid" });
    expect(existsSync(cloudRuntimeLeasePath(cloudRoot))).toBe(false);
  });

  it("N: foreign mutating Origin is 403 on production Cloud", async () => {
    const fixture = createCloudFixture({
      env: { NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN },
    });
    const response = await fixture.app.request("/api/cloud/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ email: "a@b.test", password: OWNER_PASSWORD }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_forbidden" });
    fixture.close();
  });

  it("O: trusted same-origin mutation is allowed on production Cloud", async () => {
    const fixture = createCloudFixture({
      env: { NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN },
    });
    const org = await addOrganization(fixture, "Trusted Org");
    await addUser(fixture, {
      email: "owner@trusted.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const login = await loginCloud(
      fixture.app,
      "owner@trusted.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
      { origin: PRODUCTION_ORIGIN },
    );
    expect(login.response.status).toBe(200);
    fixture.close();
  });

  it("P: production HSTS is applied to frontend and API responses", async () => {
    const root = mkdtempSync(join(tmpdir(), "workos-hsts-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>WorkOS</title>");
    const fixture = createCloudFixture({
      env: { NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN },
    });
    const app = createApp({
      cloud: { controlPlane: fixture.controlPlane, registry: fixture.registry },
      env: { NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN },
      staticRoot: root,
    });
    const page = await app.request("/", {
      headers: { "x-forwarded-proto": "https" },
    });
    const health = await app.request("/api/health", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(page.status).toBe(200);
    expect(page.headers.get("strict-transport-security")).toBe(PRODUCTION_HSTS_VALUE);
    expect(health.headers.get("strict-transport-security")).toBe(PRODUCTION_HSTS_VALUE);
    fixture.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("production Cloud does not allow mutating requests when trusted origins are empty", () => {
    expect(
      mutatingOriginAllowed({ NODE_ENV: "production" }, "POST", "https://workos.example", {
        cloud: true,
      }),
    ).toBe(false);
    expect(
      mutatingOriginAllowed({ NODE_ENV: "production" }, "POST", undefined, {
        cloud: true,
      }),
    ).toBe(false);
  });

  it("production Cloud rejects malformed or non-HTTPS trusted origins", () => {
    const fixture = createCloudFixture();
    expect(() =>
      createApp({
        cloud: { controlPlane: fixture.controlPlane, registry: fixture.registry },
        env: {
          NODE_ENV: "production",
          WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN,
          WORKOS_TRUSTED_ORIGINS: "http://extra.example",
        },
      }),
    ).toThrow(ProductionOriginConfigError);
    expect(() =>
      createApp({
        cloud: { controlPlane: fixture.controlPlane, registry: fixture.registry },
        env: {
          NODE_ENV: "production",
          WORKOS_PUBLIC_ORIGIN: PRODUCTION_ORIGIN,
          WORKOS_TRUSTED_ORIGINS: "https://extra.example/path",
        },
      }),
    ).toThrow(ProductionOriginConfigError);
    fixture.close();
  });
});

describe("restore target isolation", () => {
  async function backupSimpleCloud() {
    const cloudRoot = await provisionSimpleCloud();
    const backup = await createCloudBackup({
      cloudRoot,
      backupRoot: trackTempDir(),
    });
    return { cloudRoot, backupDir: backup.backupDir };
  }

  function expectIsolated(
    backupDir: string,
    targetRoot: string,
    sourceCloudRoot: string,
  ): void {
    try {
      restoreCloudBackup({ backupDir, targetRoot, sourceCloudRoot });
      throw new Error("expected restore isolation failure");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("restore_target_not_isolated");
    }
  }

  it("B1: refuses target equal to the source Cloud root", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, cloudRoot, cloudRoot);
  });

  it("B2: refuses a child of the source Cloud root", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, join(cloudRoot, "nested-restore"), cloudRoot);
  });

  it("B3: refuses a parent of the source Cloud root", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, dirname(cloudRoot), cloudRoot);
  });

  it("B4: refuses target equal to the backup directory", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, backupDir, cloudRoot);
  });

  it("B5: refuses a child of the backup directory", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, join(backupDir, "nested-restore"), cloudRoot);
  });

  it("B6: refuses a parent that contains the backup directory", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    expectIsolated(backupDir, dirname(backupDir), cloudRoot);
  });

  it("B7: restores into an independent sibling temp root", async () => {
    const { cloudRoot, backupDir } = await backupSimpleCloud();
    const restored = restoreCloudBackup({
      backupDir,
      targetRoot: trackTempDir(),
      sourceCloudRoot: cloudRoot,
    });
    expect(restored.organizationCount).toBe(1);
    expect(restored.planeCount).toBe(1);
  });
});
