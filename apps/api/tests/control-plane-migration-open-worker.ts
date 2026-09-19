import {
  openControlPlaneDatabase,
  resolveControlPlaneSqlitePath,
} from "../src/persistence/controlPlaneSqlite.js";

const cloudRoot = process.env.WORKOS_CP_MIG_WORKER_ROOT;
if (!cloudRoot) {
  process.stderr.write("missing WORKOS_CP_MIG_WORKER_ROOT\n");
  process.exit(1);
}

try {
  const dbPath = resolveControlPlaneSqlitePath(cloudRoot);
  const db = openControlPlaneDatabase(dbPath);
  const migrations = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => (row as { id: string }).id);
  const organizationColumns = db
    .prepare("PRAGMA table_info(organizations)")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  db.close();
  process.stdout.write(
    JSON.stringify({
      protocol: "workos-cp-mig-open-worker-v1",
      ok: true,
      migrations,
      organizationColumns,
    }),
  );
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  process.stdout.write(
    JSON.stringify({
      protocol: "workos-cp-mig-open-worker-v1",
      ok: false,
      code,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 2;
}
