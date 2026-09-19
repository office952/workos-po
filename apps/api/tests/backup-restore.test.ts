import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudBackup, type CloudBackupManifest } from "../src/cloud/backup.js";
import { CloudRestoreError, restoreCloudBackup } from "../src/cloud/restore.js";
import {
  ALPHA_ATTACHMENT_BYTES,
  ISOLATION_USER_A_EMAIL,
  ISOLATION_USER_B_EMAIL,
  TEST_COMPANY_ATTACHMENT_BYTES,
} from "./fixtures/cloudIsolation.js";
import {
  cleanupCloudTemps,
  loginCloud,
  openCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";
import { provisionHostileIsolationWorld } from "./cloud-isolation-fixture.js";

afterEach(() => {
  cleanupCloudTemps();
});

function countRows(sqlitePath: string, table: string): number {
  const db = new Database(sqlitePath, { fileMustExist: true, readonly: true });
  try {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function readManifest(backupDir: string): CloudBackupManifest {
  return JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8")) as CloudBackupManifest;
}

describe("cloud backup and restore", () => {
  it("backs up two organizations, restores into an isolated root, and preserves isolation", async () => {
    const world = await provisionHostileIsolationWorld();
    const controlPath = join(world.fixture.cloudRoot, "control", "control-plane.sqlite");
    const before = {
      organizations: countRows(controlPath, "organizations"),
      users: countRows(controlPath, "users"),
      customersAlpha: countRows(join(world.alpha.planeRoot, "product-system.sqlite"), "customers"),
      customersTest: countRows(
        join(world.testCompany.planeRoot, "product-system.sqlite"),
        "customers",
      ),
    };
    world.fixture.close();

    const backupRoot = trackTempDir();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot,
    });
    expect(backup.manifest.version).toBe("workos-cloud-backup-v1");
    expect(backup.manifest.organizationCount).toBe(2);
    expect(backup.manifest.planeCount).toBe(2);
    expect(JSON.stringify(backup.manifest)).not.toMatch(/password_hash|password_salt|OwnerPass12|token_hash/i);
    expect(countRows(controlPath, "organizations")).toBe(before.organizations);
    expect(countRows(controlPath, "users")).toBe(before.users);
    expect(countRows(join(world.alpha.planeRoot, "product-system.sqlite"), "customers")).toBe(
      before.customersAlpha,
    );
    expect(
      countRows(join(world.testCompany.planeRoot, "product-system.sqlite"), "customers"),
    ).toBe(before.customersTest);

    const targetRoot = trackTempDir();
    const restored = restoreCloudBackup({
      backupDir: backup.backupDir,
      targetRoot,
      sourceCloudRoot: world.fixture.cloudRoot,
    });
    expect(restored.organizationCount).toBe(2);

    const restoredApp = openCloudFixture(targetRoot);
    const loginA = await loginCloud(
      restoredApp.app,
      ISOLATION_USER_A_EMAIL,
      OWNER_PASSWORD,
      world.alpha.organizationId,
    );
    const loginB = await loginCloud(
      restoredApp.app,
      ISOLATION_USER_B_EMAIL,
      OWNER_PASSWORD,
      world.testCompany.organizationId,
    );
    expect(loginA.response.status).toBe(200);
    expect(loginB.response.status).toBe(200);

    const customersA = (await (
      await restoredApp.app.request("/api/customers", { headers: { cookie: loginA.cookie ?? "" } })
    ).json()) as { customers: Array<{ displayName: string }> };
    const customersB = (await (
      await restoredApp.app.request("/api/customers", { headers: { cookie: loginB.cookie ?? "" } })
    ).json()) as { customers: Array<{ displayName: string }> };
    expect(customersA.customers.map((item) => item.displayName)).toContain("Client Alpha");
    expect(customersA.customers.map((item) => item.displayName)).not.toContain("Client Test");
    expect(customersB.customers.map((item) => item.displayName)).toContain("Client Test");

    const alphaAttachment = await restoredApp.app.request(
      `/api/requests/${world.alpha.requestId}/attachments/${world.alpha.attachmentId}/download`,
      { headers: { cookie: loginA.cookie ?? "" } },
    );
    expect(alphaAttachment.status).toBe(200);
    expect(await alphaAttachment.text()).toContain(ALPHA_ATTACHMENT_BYTES);

    const testAttachment = await restoredApp.app.request(
      `/api/requests/${world.testCompany.requestId}/attachments/${world.testCompany.attachmentId}/download`,
      { headers: { cookie: loginB.cookie ?? "" } },
    );
    expect(testAttachment.status).toBe(200);
    expect(await testAttachment.text()).toContain(TEST_COMPANY_ATTACHMENT_BYTES);

    const quote = await restoredApp.app.request(
      `/api/quotes/${world.alpha.quoteId}`,
      { headers: { cookie: loginA.cookie ?? "" } },
    );
    expect(quote.status).toBe(200);
    const job = await restoredApp.app.request(`/api/jobs/${world.alpha.orderId}`, {
      headers: { cookie: loginA.cookie ?? "" },
    });
    expect(job.status).toBe(200);
    const foreign = await restoredApp.app.request(`/api/customers/${world.testCompany.customerId}`, {
      headers: { cookie: loginA.cookie ?? "" },
    });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    restoredApp.close();

    const original = openCloudFixture(world.fixture.cloudRoot);
    const originalLogin = await loginCloud(
      original.app,
      ISOLATION_USER_A_EMAIL,
      OWNER_PASSWORD,
      world.alpha.organizationId,
    );
    const originalCustomers = (await (
      await original.app.request("/api/customers", {
        headers: { cookie: originalLogin.cookie ?? "" },
      })
    ).json()) as { customers: Array<{ displayName: string }> };
    expect(originalCustomers.customers.map((item) => item.displayName)).toContain("Client Alpha");
    original.close();
  });

  it("fails closed on hash mismatch and missing files", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const sqliteArtifact = backup.manifest.artifacts.find((item) => item.kind === "sqlite");
    if (!sqliteArtifact) {
      throw new Error("missing sqlite artifact");
    }
    const tampered = join(backup.backupDir, sqliteArtifact.path);
    writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from("x")]));
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected hash mismatch");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("hash_mismatch");
    }
  });

  it("fails closed when a backup artifact is missing", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const first = backup.manifest.artifacts[0];
    if (!first) {
      throw new Error("missing artifact");
    }
    rmSync(join(backup.backupDir, first.path));
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected missing file");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("missing_file");
    }
  });

  it("fails closed on unsupported backup version", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const manifest = readManifest(backup.backupDir);
    writeFileSync(
      join(backup.backupDir, "manifest.json"),
      JSON.stringify({ ...manifest, version: "workos-cloud-backup-v0" }),
    );
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: trackTempDir(),
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected restore to fail");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("unsupported_backup_version");
    }
  });

  it("fails closed when restored plane identity does not match the control plane", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    const alphaPrefix = backup.manifest.organizations.find(
      (item) => item.organizationId === world.alpha.organizationId,
    )?.artifactPrefix;
    const testPrefix = backup.manifest.organizations.find(
      (item) => item.organizationId === world.testCompany.organizationId,
    )?.artifactPrefix;
    if (!alphaPrefix || !testPrefix) {
      throw new Error("missing prefixes");
    }
    const alphaSqlite = join(backup.backupDir, alphaPrefix, "product-system.sqlite");
    const testSqlite = join(backup.backupDir, testPrefix, "product-system.sqlite");
    const swapped = readFileSync(testSqlite);
    writeFileSync(alphaSqlite, swapped);
    const manifest = readManifest(backup.backupDir);
    const artifact = manifest.artifacts.find(
      (item) => item.path === `${alphaPrefix}/product-system.sqlite`,
    );
    if (!artifact) {
      throw new Error("missing artifact");
    }
    const swappedBytes = readFileSync(alphaSqlite);
    artifact.sha256 = createHash("sha256").update(swappedBytes).digest("hex");
    artifact.bytes = swappedBytes.byteLength;
    writeFileSync(join(backup.backupDir, "manifest.json"), JSON.stringify(manifest));
    const targetRoot = trackTempDir();
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot,
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected identity mismatch");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("plane_identity_mismatch");
    }
    expect(existsSync(join(targetRoot, "control"))).toBe(false);
  });

  it("refuses to restore onto the source cloud root", async () => {
    const world = await provisionHostileIsolationWorld();
    world.fixture.close();
    const backup = await createCloudBackup({
      cloudRoot: world.fixture.cloudRoot,
      backupRoot: trackTempDir(),
    });
    try {
      restoreCloudBackup({
        backupDir: backup.backupDir,
        targetRoot: world.fixture.cloudRoot,
        sourceCloudRoot: world.fixture.cloudRoot,
      });
      throw new Error("expected isolation failure");
    } catch (error) {
      expect((error as CloudRestoreError).code).toBe("restore_target_not_isolated");
    }
  });
});
