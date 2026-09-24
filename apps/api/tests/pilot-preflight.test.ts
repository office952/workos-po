import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createControlPlane } from "../src/cloud/controlPlane.js";
import { assertDevProvisionSafe } from "../src/cloud/devProvisionCli.js";
import { derivePlanePaths } from "../src/cloud/paths.js";
import { resolveControlPlaneSqlitePath } from "../src/persistence/controlPlaneSqlite.js";
import { runPilotPreflightCli } from "../src/ops/pilotPreflightCli.js";
import {
  evaluateProductionPilotReadiness,
  pilotPreflightExitCode,
  type PilotIntent,
  type ProductionPilotReadinessV1,
} from "../src/ops/pilotPreflight.js";
import { evaluateReadiness } from "../src/ops/readiness.js";
import { cloudRuntimeLeasePath } from "../src/ops/runtimeLease.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

const ORIGIN = "https://pilot.example";
const OWNER_EMAIL = "owner@example.test";

function productionEnv(input: {
  cloudRoot: string;
  backupRoot: string;
  staticRoot: string;
  origin?: string;
}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    WORKOS_CLOUD_ROOT: input.cloudRoot,
    WORKOS_BACKUP_ROOT: input.backupRoot,
    WORKOS_STATIC_ROOT: input.staticRoot,
    WORKOS_PUBLIC_ORIGIN: input.origin ?? ORIGIN,
  };
}

async function readyWorld() {
  const fixture = createCloudFixture();
  const created = await addOrganization(fixture, "Pilot Org");
  await addUser(fixture, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    organizationId: created.organization.organizationId,
    role: "owner",
  });
  const staticRoot = trackTempDir();
  writeFileSync(join(staticRoot, "index.html"), "<!doctype html><title>WorkOS</title>\n");
  const backupRoot = trackTempDir();
  const cloudRoot = fixture.cloudRoot;
  const planeKey = created.plane.planeKey;
  const organizationId = created.organization.organizationId;
  fixture.close();
  return { cloudRoot, backupRoot, staticRoot, planeKey, organizationId };
}

function evaluate(world: Awaited<ReturnType<typeof readyWorld>>, intent?: PilotIntent, origin?: string) {
  return evaluateProductionPilotReadiness({
    env: productionEnv({ ...world, origin }),
    intent,
  });
}

function writeLease(cloudRoot: string, pid: number, purpose: "api" | "backup"): void {
  const path = cloudRuntimeLeasePath(cloudRoot);
  mkdirSync(join(cloudRoot, "ops"), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({
      version: 1,
      leaseId: "lease-pilot-preflight-01",
      pid,
      startedAt: "2026-01-01T00:00:00.000Z",
      purpose,
    })}\n`,
  );
}

function openPlane(cloudRoot: string, planeKey: string) {
  return new Database(derivePlanePaths(cloudRoot, planeKey).sqlitePath);
}

function assertSanitized(result: ProductionPilotReadinessV1, secret: string): void {
  const text = JSON.stringify(result);
  expect(text).not.toContain(secret);
  expect(text).not.toMatch(/org:|plane:|\.sqlite|@[a-z0-9.-]+\.[a-z]{2,}/i);
}

describe("production pilot preflight", () => {
  it("A. is READY for an existing synthetic organization with no lease", async () => {
    const world = await readyWorld();
    const before = statSync(resolveControlPlaneSqlitePath(world.cloudRoot)).mtimeMs;
    const beforeNames = readdirSync(world.cloudRoot).sort();
    const result = evaluate(world);
    expect(pilotPreflightExitCode(result)).toBe(0);
    expect(result.overallStatus).toBe("READY");
    expect(readdirSync(world.cloudRoot).sort()).toEqual(beforeNames);
    expect(result.blockers).toEqual([]);
    expect(result.pilotIntent).toBe("EXISTING_ORGANIZATION");
    expect(result.backupProcedureSupported).toBe("YES");
    expect(result.restoreValidationSupported).toBe("YES");
    expect(result.productionOrgProvisioning).toBe("NOT_READY");
    expect(result.primaryUserJourneyContract).toBe("AVAILABLE");
    expect(result.advisories).toContain("production_org_provisioning");
    expect(statSync(resolveControlPlaneSqlitePath(world.cloudRoot)).mtimeMs).toBe(before);
    assertSanitized(result, world.cloudRoot);
    assertSanitized(result, world.backupRoot);
    assertSanitized(result, world.planeKey);
    assertSanitized(result, world.organizationId);
    assertSanitized(result, OWNER_EMAIL);
    assertSanitized(result, OWNER_PASSWORD);
  });

  it("B/C/D. blocks missing origin, HTTP origin, and missing static build", async () => {
    const world = await readyWorld();
    const missing = evaluateProductionPilotReadiness({
      env: { ...productionEnv(world), WORKOS_PUBLIC_ORIGIN: undefined },
    });
    expect(missing.overallStatus).toBe("BLOCKED");
    expect(missing.blockers).toContain("public_origin");

    const http = evaluate(world, undefined, "http://pilot.example");
    expect(http.overallStatus).toBe("BLOCKED");
    expect(http.blockers).toContain("public_origin");
    expect(JSON.stringify(http)).not.toContain("http://pilot.example");

    const emptyStatic = trackTempDir();
    const noBuild = evaluateProductionPilotReadiness({
      env: productionEnv({ ...world, staticRoot: emptyStatic }),
    });
    expect(noBuild.overallStatus).toBe("BLOCKED");
    expect(noBuild.blockers).toContain("frontend_static_build");
  });

  it("E/F. blocks an active organization missing a plane or an owner", async () => {
    const missingPlane = await readyWorld();
    const control = new Database(resolveControlPlaneSqlitePath(missingPlane.cloudRoot));
    control.prepare("DELETE FROM operational_planes").run();
    control.close();
    const planeResult = evaluate(missingPlane);
    expect(planeResult.overallStatus).toBe("BLOCKED");
    expect(planeResult.blockers).toContain("active_organization_plane");

    const fixture = createCloudFixture();
    const created = await addOrganization(fixture, "No Owner");
    fixture.controlPlane.db
      .prepare("UPDATE organizations SET status = 'ACTIVE' WHERE organization_id = ?")
      .run(created.organization.organizationId);
    const cloudRoot = fixture.cloudRoot;
    fixture.close();
    const staticRoot = trackTempDir();
    writeFileSync(join(staticRoot, "index.html"), "<!doctype html>\n");
    const noOwner = evaluateProductionPilotReadiness({
      env: productionEnv({ cloudRoot, backupRoot: trackTempDir(), staticRoot }),
    });
    expect(noOwner.overallStatus).toBe("BLOCKED");
    expect(noOwner.blockers).toContain("active_organization_owner");
  });

  it("G/H. blocks provisioning and failed-retryable organizations", async () => {
    const provisioning = createCloudFixture();
    await addOrganization(provisioning, "Still Provisioning");
    const provisioningRoot = provisioning.cloudRoot;
    provisioning.close();
    const staticRoot = trackTempDir();
    writeFileSync(join(staticRoot, "index.html"), "<!doctype html>\n");
    const provisioningResult = evaluateProductionPilotReadiness({
      env: productionEnv({
        cloudRoot: provisioningRoot,
        backupRoot: trackTempDir(),
        staticRoot,
      }),
    });
    expect(provisioningResult.blockers).toContain("organization_provisioning");

    const failed = createCloudFixture();
    const created = await addOrganization(failed, "Failed Org");
    failed.controlPlane.markOrganizationFailed(created.organization.organizationId, "stopped");
    const failedRoot = failed.cloudRoot;
    failed.close();
    const failedResult = evaluateProductionPilotReadiness({
      env: productionEnv({ cloudRoot: failedRoot, backupRoot: trackTempDir(), staticRoot }),
    });
    expect(failedResult.overallStatus).toBe("BLOCKED");
    expect(failedResult.blockers).toContain("organization_failed_retryable");
  });

  it("I/J. blocks migration mismatch and plane identity mismatch, and stays stricter than ready", async () => {
    const migrated = await readyWorld();
    const plane = openPlane(migrated.cloudRoot, migrated.planeKey);
    plane.prepare("DELETE FROM schema_migrations WHERE id = (SELECT id FROM schema_migrations LIMIT 1)").run();
    plane.close();
    const migrationResult = evaluate(migrated);
    expect(migrationResult.overallStatus).toBe("BLOCKED");
    expect(migrationResult.blockers).toContain("schema_contract");
    const readonly = new Database(resolveControlPlaneSqlitePath(migrated.cloudRoot), {
      readonly: true,
      fileMustExist: true,
    });
    const readiness = evaluateReadiness({
      mode: "cloud",
      cloudRoot: migrated.cloudRoot,
      controlPlane: createControlPlane(readonly, migrated.cloudRoot),
    });
    readonly.close();
    expect(readiness.status).toBe("not_ready");
    expect(migrationResult.overallStatus).not.toBe("READY");

    const identity = await readyWorld();
    const identityDb = openPlane(identity.cloudRoot, identity.planeKey);
    identityDb.prepare("UPDATE operational_plane_identity SET plane_id = 'plane:other'").run();
    identityDb.close();
    const identityResult = evaluate(identity);
    expect(identityResult.overallStatus).toBe("BLOCKED");
    expect(identityResult.blockers).toContain("plane_identity");
    expect(identityResult.blockers).toContain("data_plane_readiness");
  });

  it("K/L/M/N. blocks active leases, unknown liveness, and nested backup roots", async () => {
    const apiLease = await readyWorld();
    writeLease(apiLease.cloudRoot, process.pid, "api");
    expect(evaluate(apiLease).blockers).toContain("runtime_lease");
    expect(evaluate(apiLease).checks.find((item) => item.id === "runtime_lease")?.safeDetail).toBe(
      "ACTIVE_API_LEASE",
    );

    const backupLease = await readyWorld();
    writeLease(backupLease.cloudRoot, process.pid, "backup");
    expect(evaluate(backupLease).checks.find((item) => item.id === "runtime_lease")?.safeDetail).toBe(
      "ACTIVE_BACKUP_LEASE",
    );

    const unknown = await readyWorld();
    writeLease(unknown.cloudRoot, -1, "api");
    expect(evaluate(unknown).checks.find((item) => item.id === "runtime_lease")?.safeDetail).toBe(
      "UNKNOWN",
    );

    const nested = await readyWorld();
    const nestedBackup = join(nested.cloudRoot, "nested-backup");
    mkdirSync(nestedBackup);
    const nestedResult = evaluateProductionPilotReadiness({
      env: productionEnv({ ...nested, backupRoot: nestedBackup }),
    });
    expect(nestedResult.overallStatus).toBe("BLOCKED");
    expect(nestedResult.blockers).toContain("root_isolation");
    expect(JSON.stringify(nestedResult)).not.toContain(nested.cloudRoot);
    expect(readFileSync(cloudRuntimeLeasePath(apiLease.cloudRoot), "utf8")).toContain("lease-pilot-preflight-01");
  });

  it("O/P/Q/R. blocks new-org provisioning debt without blocking optional modules or faking SaaS debt", async () => {
    const world = await readyWorld();
    const created = evaluate(world, "NEW_ORGANIZATION");
    expect(created.overallStatus).toBe("BLOCKED");
    expect(created.blockers).toContain("production_org_provisioning");
    expect(created.checks.find((item) => item.id === "production_org_provisioning")?.safeDetail).toBe(
      "ADMIN_TOOLING_DEBT",
    );

    const existing = evaluate(world);
    expect(existing.overallStatus).toBe("READY");
    expect(existing.blockers.some((id) => /site_installation|product_enablement|totem/i.test(id))).toBe(
      false,
    );
    expect(existing.checks.find((item) => item.id === "optional_modules")?.status).toBe(
      "NOT_APPLICABLE",
    );
    for (const id of [
      "password_recovery_not_implemented",
      "mfa_not_implemented",
      "billing_not_implemented",
    ]) {
      expect(existing.advisories).toContain(id);
      expect(existing.checks.find((item) => item.id === id)?.status).toBe("ADVISORY");
    }
  });

  it("keeps production provisioning refusal and sanitizes CLI inspection errors", async () => {
    expect(() => assertDevProvisionSafe({ NODE_ENV: "production" })).toThrow(
      /must not bootstrap production accounts/,
    );
    const world = await readyWorld();
    writeFileSync(resolveControlPlaneSqlitePath(world.cloudRoot), "not-a-database");
    const cli = runPilotPreflightCli(
      ["--json", "--cloud-root", world.cloudRoot, "--backup-root", world.backupRoot, "--static-root", world.staticRoot, "--public-origin", ORIGIN],
      { NODE_ENV: "production" },
    );
    expect(cli.exitCode).toBe(3);
    expect(cli.ok).toBe(false);
    const text = JSON.stringify(cli.ok ? cli.result : cli.body);
    expect(text).not.toContain(world.cloudRoot);
    expect(text).not.toContain("not-a-database");
  });
});
