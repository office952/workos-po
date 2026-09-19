import Database from "better-sqlite3";

export function readAppliedMigrationIds(db: {
  prepare: (sql: string) => { all: () => unknown[] };
}): string[] {
  return db
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => (row as { id: string }).id)
    .sort();
}

export function readSqliteMigrationIds(filePath: string): string[] {
  const db = new Database(filePath, { fileMustExist: true, readonly: true });
  try {
    return readAppliedMigrationIds(db);
  } finally {
    db.close();
  }
}

export function migrationSetsEqual(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((id, index) => id === right[index]);
}
