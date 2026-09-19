/**
 * Vitest must never inherit developer DEV persistence.
 * SQLite defaults to :memory: (see resolveProductSystemSqlitePath).
 * Filesystem writes go only under an OS-temp WorkOS data root.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

delete process.env.WORKOS_SQLITE_PATH;
process.env.VITEST = "true";

const isolatedRoot = mkdtempSync(join(tmpdir(), "workos-vitest-data-"));
process.env.WORKOS_TEST_DATA_DIR = isolatedRoot;
process.env.WORKOS_DATA_DIR = isolatedRoot;

afterAll(() => {
  rmSync(isolatedRoot, { recursive: true, force: true });
});
