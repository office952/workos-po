import type { SqliteDatabase } from "../persistence/sqlite.js";

export type OperationalPlaneIdentity = {
  planeId: string;
  organizationId: string;
  boundAt: string;
};

export class PlaneIdentityError extends Error {
  readonly code: "plane_identity_missing" | "plane_identity_mismatch";

  constructor(code: "plane_identity_missing" | "plane_identity_mismatch") {
    super(code);
    this.name = "PlaneIdentityError";
    this.code = code;
  }
}

export function readOperationalPlaneIdentity(
  db: SqliteDatabase,
): OperationalPlaneIdentity | null {
  try {
    const row = db
      .prepare(
        `SELECT plane_id, organization_id, bound_at
         FROM operational_plane_identity
         WHERE id = 'current'`,
      )
      .get() as
      | { plane_id: string; organization_id: string; bound_at: string }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      planeId: row.plane_id,
      organizationId: row.organization_id,
      boundAt: row.bound_at,
    };
  } catch (error) {
    if (isMissingIdentityTable(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingIdentityTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

export function bindOperationalPlaneIdentity(
  db: SqliteDatabase,
  identity: { planeId: string; organizationId: string },
  boundAt = new Date().toISOString(),
): OperationalPlaneIdentity {
  const current = readOperationalPlaneIdentity(db);
  if (current) {
    assertPlaneIdentity(current, identity);
    return current;
  }
  db.prepare(
    `INSERT INTO operational_plane_identity (id, plane_id, organization_id, bound_at)
     VALUES ('current', ?, ?, ?)`,
  ).run(identity.planeId, identity.organizationId, boundAt);
  return {
    planeId: identity.planeId,
    organizationId: identity.organizationId,
    boundAt,
  };
}

export function assertPlaneIdentity(
  actual: OperationalPlaneIdentity | null,
  expected: { planeId: string; organizationId: string },
): void {
  if (!actual) {
    throw new PlaneIdentityError("plane_identity_missing");
  }
  if (
    actual.planeId !== expected.planeId ||
    actual.organizationId !== expected.organizationId
  ) {
    throw new PlaneIdentityError("plane_identity_mismatch");
  }
}
