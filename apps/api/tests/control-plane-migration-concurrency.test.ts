import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import {
  openControlPlaneDatabase,
  resolveControlPlaneSqlitePath,
} from "../src/persistence/controlPlaneSqlite.js";
import { cleanupCloudTemps, trackTempDir } from "./cloud-harness.js";

const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");
const WORKER_PROTOCOL = "workos-cp-mig-open-worker-v1";

afterEach(() => {
  cleanupCloudTemps();
});

type OpenWorkerResult =
  | {
      ok: true;
      migrations: string[];
      organizationColumns: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function runOpenWorker(cloudRoot: string): Promise<OpenWorkerResult> {
  const worker = fileURLToPath(new URL("./control-plane-migration-open-worker.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, worker], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "test",
        WORKOS_CP_MIG_WORKER_ROOT: cloudRoot,
      },
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () => {
      try {
        const payload = JSON.parse(stdout) as {
          protocol?: string;
          ok?: unknown;
          migrations?: unknown;
          organizationColumns?: unknown;
          code?: unknown;
          message?: unknown;
        };
        if (payload.protocol !== WORKER_PROTOCOL || typeof payload.ok !== "boolean") {
          reject(new Error(`invalid worker output: ${stdout}`));
          return;
        }
        if (payload.ok) {
          resolve({
            ok: true,
            migrations: Array.isArray(payload.migrations)
              ? payload.migrations.map(String)
              : [],
            organizationColumns: Array.isArray(payload.organizationColumns)
              ? payload.organizationColumns.map(String)
              : [],
          });
          return;
        }
        resolve({
          ok: false,
          code: typeof payload.code === "string" ? payload.code : "",
          message: typeof payload.message === "string" ? payload.message : "",
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe("Control Plane migration concurrency", () => {
  it("lets two fresh processes open the same control plane without duplicate DDL", async () => {
    const cloudRoot = trackTempDir();
    const [first, second] = await Promise.all([
      runOpenWorker(cloudRoot),
      runOpenWorker(cloudRoot),
    ]);

    expect(first.ok, first.ok ? undefined : `${first.code}:${first.message}`).toBe(true);
    expect(second.ok, second.ok ? undefined : `${second.code}:${second.message}`).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.migrations).toEqual(second.migrations);
    expect(first.migrations).toEqual([
      "001_organizations_users_sessions.sql",
      "002_organization_provisioning_state.sql",
    ]);
    expect(first.organizationColumns).toContain("organization_id");
    expect(first.organizationColumns).toContain("provision_owner_email");

    const db = openControlPlaneDatabase(resolveControlPlaneSqlitePath(cloudRoot));
    try {
      const ledger = db
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all()
        .map((row) => (row as { id: string }).id);
      expect(ledger).toEqual([
        "001_organizations_users_sessions.sql",
        "002_organization_provisioning_state.sql",
      ]);
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number },
      ).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  });

  it("reopens an already-migrated control plane without rewriting the ledger", () => {
    const cloudRoot = trackTempDir();
    const path = resolveControlPlaneSqlitePath(cloudRoot);
    const first = openControlPlaneDatabase(path);
    first.close();
    const second = openControlPlaneDatabase(path);
    try {
      const ledger = second
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all()
        .map((row) => (row as { id: string }).id);
      expect(ledger).toEqual([
        "001_organizations_users_sessions.sql",
        "002_organization_provisioning_state.sql",
      ]);
    } finally {
      second.close();
    }
  });
});
