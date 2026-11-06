import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudBackup } from "../src/cloud/backup.js";
import { connectDemoAppTransport } from "../src/cloud/demoAtelierHttp.js";
import { demoPlaneSqlitePath } from "../src/cloud/demoAtelierHistory.js";
import { DEMO_ATELIER_LEDGER, DEMO_ATELIER_MARKER } from "../src/cloud/demoAtelierIdentity.js";
import { fileDemoLedger } from "../src/cloud/demoAtelierLedger.js";
import { createDemoBundle, restoreDemoEnvironment, verifyDemoBundle } from "../src/cloud/demoAtelierRecovery.js";
import {
  DEMO_ATELIER_SECRETS,
  ensureDemoKey,
  generateDemoSecrets,
  loadDemoSecrets,
  readDemoSecretsFile,
  writeNewDemoSecrets,
} from "../src/cloud/demoAtelierSecrets.js";
import { prepareDemoAtelier } from "../src/cloud/demoAtelierSeed.js";
import { ensureOwnerReviewProvisioned, readOwnerReviewIdentity } from "../src/cloud/ownerReviewReset.js";
import { CloudRestoreError } from "../src/cloud/restore.js";
import { listOperationalMigrationFiles } from "../src/persistence/sqlite.js";
import { cleanupCloudTemps, openCloudFixture, trackTempDir } from "./cloud-harness.js";

const LATER_MIGRATIONS = [
  "048_work_representative_photos.sql",
  "049_customer_logo.sql",
  "050_organization_product_preset_revisions.sql",
  "051_commercial_closure_ledger.sql",
] as const;

const LATER_TABLES = [
  "work_representative_photos",
  "customer_logo_revisions",
  "organization_product_preset_revisions",
  "commercial_request_ledger",
  "commercial_ledger_operations",
  "commercial_ledger_events",
  "commercial_offer_dispositions",
] as const;

afterEach(() => {
  cleanupCloudTemps();
});

/** Temp roots only. Refuses every persistent WorkOS data root by path. */
function assertDisposableRoot(root: string): void {
  const resolved = resolve(root);
  const temp = resolve(tmpdir());
  expect(resolved.toLowerCase().startsWith(temp.toLowerCase() + "\\") || resolved.toLowerCase().startsWith(temp.toLowerCase() + "/")).toBe(true);
  const folded = resolved.toLowerCase();
  for (const forbidden of [
    "demo-atelier-n019",
    "demo-alpha-current-main",
    "reference-runtime",
    "\\workos\\",
    "/workos/",
  ]) {
    expect(folded.includes(forbidden)).toBe(false);
  }
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectRefusal(run: () => void, code: string): void {
  try {
    run();
    expect.fail("expected restore refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(CloudRestoreError);
    expect((error as CloudRestoreError).code).toBe(code);
  }
}

async function provisionedDemoRoot(): Promise<{ root: string; organizationId: string; password: string; email: string }> {
  const root = trackTempDir();
  assertDisposableRoot(root);
  const password = `t-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root, password, env: { NODE_ENV: "development" } });
  writeFileSync(join(root, DEMO_ATELIER_MARKER), "FIXTURE_KIND=DEMO_ATELIER_N019_V1\nSYNTHETIC_DEMO_DATA=YES\n");
  writeNewDemoSecrets(root, generateDemoSecrets());
  const fixture = openCloudFixture(root, { env: { NODE_ENV: "development" } });
  try {
    const transport = await connectDemoAppTransport({
      app: fixture.app,
      email: provisioned.identity.email,
      password,
      organizationId: provisioned.organizationId,
    });
    const report = await prepareDemoAtelier({
      transport,
      ledger: fileDemoLedger(root),
      secrets: loadDemoSecrets(root),
    });
    expect(report.refusals).toEqual([]);
    expect(report.people).toBe(10);
  } finally {
    fixture.close();
  }
  return {
    root,
    organizationId: provisioned.organizationId,
    password,
    email: provisioned.identity.email,
  };
}

function customerRows(db: Database.Database): unknown[] {
  return db.prepare("SELECT customer_id, display_name, status, created_at, updated_at FROM customers ORDER BY customer_id").all();
}

function migrationStamp(db: Database.Database, id: string): string {
  const row = db.prepare("SELECT applied_at FROM schema_migrations WHERE id = ?").get(id) as { applied_at: string } | undefined;
  if (!row) throw new Error(`missing migration ${id}`);
  return row.applied_at;
}

function sessionCounts(controlPath: string, planePath: string): { platform: number; operator: number; openWork: number } {
  const control = new Database(controlPath, { readonly: true, fileMustExist: true });
  const plane = new Database(planePath, { readonly: true, fileMustExist: true });
  try {
    const platform = control.prepare("SELECT COUNT(*) AS n FROM platform_sessions WHERE revoked_at IS NULL").get() as { n: number };
    const operator = plane.prepare("SELECT COUNT(*) AS n FROM operator_sessions WHERE revoked_at IS NULL").get() as { n: number };
    const openWork = plane.prepare("SELECT COUNT(*) AS n FROM execution_work_sessions WHERE ended_at IS NULL").get() as { n: number };
    return { platform: platform.n, operator: operator.n, openWork: openWork.n };
  } finally {
    control.close();
    plane.close();
  }
}

describe("N-019 compatibility with migrations 048-051", () => {
  it("upgrades a schema-047 synthetic copy once, keeps existing rows and the ledger, and does not duplicate on resume", async () => {
    const { root, organizationId, password, email } = await provisionedDemoRoot();
    const ledgerBefore = readFileSync(join(root, DEMO_ATELIER_LEDGER));
    const planePath = demoPlaneSqlitePath(root);
    const db = new Database(planePath);
    let customersBefore: unknown[];
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      customersBefore = customerRows(db);
      expect(customersBefore.length).toBeGreaterThan(0);
      expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '047_customer_dossier.sql'").get()).toBeTruthy();
      for (const id of LATER_MIGRATIONS) {
        expect(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id)).toBeTruthy();
      }
      for (const table of LATER_TABLES) {
        db.exec(`DROP TABLE ${table}`);
      }
      db.prepare(`DELETE FROM schema_migrations WHERE id IN (${LATER_MIGRATIONS.map(() => "?").join(", ")})`).run(...LATER_MIGRATIONS);
      const remaining = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{ id: string }>;
      expect(remaining.at(-1)?.id).toBe("047_customer_dossier.sql");
      expect(remaining.some((row) => LATER_MIGRATIONS.includes(row.id as (typeof LATER_MIGRATIONS)[number]))).toBe(false);
    } finally {
      db.close();
    }

    const first = openCloudFixture(root, { env: { NODE_ENV: "development" } });
    try {
      const transport = await connectDemoAppTransport({ app: first.app, email, password, organizationId });
      const customers = (await transport.client.request("GET", "/api/customers")).body?.customers as unknown[];
      expect(customers).toHaveLength(customersBefore.length);
    } finally {
      first.close();
    }

    const stamped = new Database(planePath, { readonly: true, fileMustExist: true });
    let stamps: Record<string, string>;
    try {
      stamps = Object.fromEntries(LATER_MIGRATIONS.map((id) => [id, migrationStamp(stamped, id)]));
      for (const id of LATER_MIGRATIONS) {
        expect(stamped.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = ?").get(id)).toEqual({ n: 1 });
      }
      expect(stamped.prepare("SELECT id FROM schema_migrations ORDER BY id").all().map((row) => (row as { id: string }).id)).toEqual(
        listOperationalMigrationFiles(),
      );
    } finally {
      stamped.close();
    }

    const second = openCloudFixture(root, { env: { NODE_ENV: "development" } });
    try {
      const transport = await connectDemoAppTransport({ app: second.app, email, password, organizationId });
      const again = await prepareDemoAtelier({ transport, ledger: fileDemoLedger(root), secrets: loadDemoSecrets(root) });
      expect(again.applied).toEqual([]);
      expect(again.people).toBe(10);
      const people = (await transport.client.request("GET", "/api/people")).body?.people as unknown[];
      expect(people).toHaveLength(10);
    } finally {
      second.close();
    }

    const after = new Database(planePath, { readonly: true, fileMustExist: true });
    try {
      expect(customerRows(after)).toEqual(customersBefore);
      for (const id of LATER_MIGRATIONS) {
        expect(migrationStamp(after, id)).toBe(stamps[id]);
        expect(after.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = ?").get(id)).toEqual({ n: 1 });
      }
      for (const table of LATER_TABLES) {
        expect(after.prepare("SELECT COUNT(*) AS n FROM " + table).get()).toEqual({ n: 0 });
      }
    } finally {
      after.close();
    }
    expect(readFileSync(join(root, DEMO_ATELIER_LEDGER))).toEqual(ledgerBefore);
    expect(sha256(ledgerBefore)).toBe(sha256(readFileSync(join(root, DEMO_ATELIER_LEDGER))));
  }, 180_000);
});

describe("N-019 restore compatibility with current restoreCloudBackup", () => {
  it("restores into an empty temp target without the original, and refuses unsafe targets", async () => {
    const { root, password } = await provisionedDemoRoot();
    const pins = readDemoSecretsFile(root)!.operatorPins;
    const keyRoot = trackTempDir();
    assertDisposableRoot(keyRoot);
    ensureDemoKey(keyRoot);
    const backupRoot = trackTempDir();
    assertDisposableRoot(backupRoot);
    const data = await createCloudBackup({ cloudRoot: root, backupRoot });
    const bundle = createDemoBundle({ root, dataBackupDir: data.backupDir, keyRoot, codeVersion: "n019-compat" });
    const manifest = verifyDemoBundle(bundle, data.backupDir);
    expect(manifest.dataBackup.manifestSha256).toBe(sha256(readFileSync(join(data.backupDir, "manifest.json"))));
    expect(readFileSync(join(bundle, "credentials.sealed.json"), "utf8")).not.toContain(pins.cnc1);
    const backupSessions = sessionCounts(
      join(data.backupDir, "control", "control-plane.sqlite"),
      join(data.backupDir, relative(root, demoPlaneSqlitePath(root))),
    );

    const occupied = join(trackTempDir(), "occupied");
    assertDisposableRoot(occupied);
    mkdirSync(occupied);
    writeFileSync(join(occupied, "keep.txt"), "keep");
    expectRefusal(
      () => restoreDemoEnvironment({ dataBackupDir: data.backupDir, bundleDir: bundle, targetRoot: occupied, keyRoot }),
      "restore_target_not_empty",
    );
    expect(readFileSync(join(occupied, "keep.txt"), "utf8")).toBe("keep");

    const protectedRoot = trackTempDir();
    assertDisposableRoot(protectedRoot);
    mkdirSync(join(protectedRoot, "control"), { recursive: true });
    writeFileSync(join(protectedRoot, "control", "control-plane.sqlite"), "");
    const nested = join(protectedRoot, "nested-target");
    expectRefusal(
      () => restoreDemoEnvironment({ dataBackupDir: data.backupDir, bundleDir: bundle, targetRoot: nested, keyRoot }),
      "restore_target_not_isolated",
    );
    expect(existsSync(nested)).toBe(false);
    expect(readFileSync(join(protectedRoot, "control", "control-plane.sqlite"), "utf8")).toBe("");

    const linkParent = trackTempDir();
    assertDisposableRoot(linkParent);
    const linkDestination = join(linkParent, "destination");
    mkdirSync(linkDestination);
    writeFileSync(join(linkDestination, "marker.txt"), "marker");
    const junction = join(linkParent, "junction");
    symlinkSync(linkDestination, junction, process.platform === "win32" ? "junction" : "dir");
    expect(lstatSync(junction).isSymbolicLink()).toBe(true);
    expectRefusal(
      () => restoreDemoEnvironment({ dataBackupDir: data.backupDir, bundleDir: bundle, targetRoot: junction, keyRoot }),
      "restore_target_not_empty",
    );
    expect(lstatSync(junction).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(linkDestination, "marker.txt"), "utf8")).toBe("marker");

    const symlinkTarget = join(linkParent, "symlink");
    try {
      symlinkSync(linkDestination, symlinkTarget, "dir");
      expect(lstatSync(symlinkTarget).isSymbolicLink()).toBe(true);
      expectRefusal(
        () => restoreDemoEnvironment({ dataBackupDir: data.backupDir, bundleDir: bundle, targetRoot: symlinkTarget, keyRoot }),
        "restore_target_not_empty",
      );
      expect(lstatSync(symlinkTarget).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(linkDestination, "marker.txt"), "utf8")).toBe("marker");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code !== "EPERM" && code !== "EACCES") throw error;
    }

    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);

    const emptyTarget = join(trackTempDir(), "empty-target");
    assertDisposableRoot(emptyTarget);
    mkdirSync(emptyTarget);
    const restored = restoreDemoEnvironment({
      dataBackupDir: data.backupDir,
      bundleDir: bundle,
      targetRoot: emptyTarget,
      keyRoot,
    });
    expect(restored.targetRoot).toBe(resolve(emptyTarget));
    expect(existsSync(join(emptyTarget, "demo-atelier-api.pid.json"))).toBe(false);
    expect(existsSync(join(emptyTarget, "ops", "runtime-lease.json"))).toBe(false);
    expect(readDemoSecretsFile(emptyTarget)?.operatorPins).toEqual(pins);
    expect(readOwnerReviewIdentity(emptyTarget)!.password).toBe(password);
    expect(resolve(join(emptyTarget, DEMO_ATELIER_SECRETS)).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase())).toBe(true);
    const restoredPlane = demoPlaneSqlitePath(emptyTarget);
    expect(sessionCounts(join(emptyTarget, "control", "control-plane.sqlite"), restoredPlane)).toEqual(backupSessions);
    expect(sessionCounts(join(emptyTarget, "control", "control-plane.sqlite"), restoredPlane).openWork).toBe(0);
  }, 180_000);
});
