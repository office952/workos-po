import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createControlPlane } from "../src/cloud/controlPlane.js";
import { derivePlanePaths } from "../src/cloud/paths.js";
import { evaluateReadiness } from "../src/ops/readiness.js";
import { cleanupCloudTemps, createCloudFixture, addOrganization } from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("controlled pilot multi-organization readiness", () => {
  it("fails closed if one of two active operational planes has a migration mismatch", async () => {
    const fixture = createCloudFixture();
    try {
      await addOrganization(fixture, "Readiness Org A");
      const second = await addOrganization(fixture, "Readiness Org B");
      const before = evaluateReadiness({
        mode: "cloud",
        cloudRoot: fixture.cloudRoot,
        controlPlane: fixture.controlPlane,
      });
      expect(before.status).toBe("ready");

      const planePath = derivePlanePaths(fixture.cloudRoot, second.plane.planeKey).sqlitePath;
      const db = new Database(planePath);
      try {
        db.prepare("DELETE FROM schema_migrations WHERE id = (SELECT id FROM schema_migrations LIMIT 1)").run();
      } finally {
        db.close();
      }

      const result = evaluateReadiness({
        mode: "cloud",
        cloudRoot: fixture.cloudRoot,
        controlPlane: createControlPlane(fixture.controlPlane.db, fixture.cloudRoot),
      });
      expect(result.status).toBe("not_ready");
      expect(result.checks.migrationsValid).toBe(false);
      expect(JSON.stringify(result)).not.toContain(second.organization.organizationId);
      expect(JSON.stringify(result)).not.toContain(second.plane.planeKey);
      expect(JSON.stringify(result)).not.toContain(planePath);
    } finally {
      fixture.close();
    }
  });
});
