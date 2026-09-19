import {
  SITE_INSTALLATION_SCOPE_ID,
  applyOrganizationServiceOffer,
  projectOperationalServicesAdmin,
  resolveOrganizationServiceOffer,
  type OperationalServicesAdminProjection,
  type OrganizationServiceOffer,
  type OrganizationServiceOfferMutationResult,
  type OrganizationServiceOfferRecord,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type OfferRow = {
  capability_id: string;
  offer_mode: string;
  version: number;
  updated_at: string;
};

function recordFromRow(row: OfferRow): OrganizationServiceOfferRecord | null {
  const resolved = resolveOrganizationServiceOffer({
    offerMode: row.offer_mode,
    version: row.version,
    updatedAt: row.updated_at,
  });
  if (!resolved.configured || resolved.offerMode === null || resolved.version === null) {
    return null;
  }
  return {
    capabilityId: SITE_INSTALLATION_SCOPE_ID,
    offerMode: resolved.offerMode,
    version: resolved.version,
    updatedAt: row.updated_at,
  };
}

export function readOrganizationServiceOffer(
  db: SqliteDatabase,
): OrganizationServiceOffer {
  const row = db
    .prepare(
      `
      SELECT capability_id, offer_mode, version, updated_at
      FROM organization_operational_service_capabilities
      WHERE capability_id = ?
    `,
    )
    .get(SITE_INSTALLATION_SCOPE_ID) as OfferRow | undefined;
  return resolveOrganizationServiceOffer(
    row
      ? {
          offerMode: row.offer_mode,
          version: row.version,
          updatedAt: row.updated_at,
        }
      : null,
  );
}

export function readOrganizationServiceOfferRecord(
  db: SqliteDatabase,
): OrganizationServiceOfferRecord | null {
  const row = db
    .prepare(
      `
      SELECT capability_id, offer_mode, version, updated_at
      FROM organization_operational_service_capabilities
      WHERE capability_id = ?
    `,
    )
    .get(SITE_INSTALLATION_SCOPE_ID) as OfferRow | undefined;
  return row ? recordFromRow(row) : null;
}

export function readOperationalServicesAdmin(
  db: SqliteDatabase,
): OperationalServicesAdminProjection {
  return projectOperationalServicesAdmin(readOrganizationServiceOffer(db));
}

export function persistOrganizationServiceOffer(
  db: SqliteDatabase,
  capabilityId: string,
  offerMode: string,
  updatedAt = new Date().toISOString(),
): OrganizationServiceOfferMutationResult {
  const current = readOrganizationServiceOfferRecord(db);
  const updated = applyOrganizationServiceOffer({
    capabilityId,
    offerMode,
    current,
    updatedAt,
  });
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  const persist = db.transaction(() => {
    if (current) {
      db.prepare(
        `
        INSERT INTO organization_operational_service_capability_history (
          capability_id, version, offer_mode, updated_at
        ) VALUES (?, ?, ?, ?)
      `,
      ).run(current.capabilityId, current.version, current.offerMode, current.updatedAt);
    }
    db.prepare(
      `
      INSERT INTO organization_operational_service_capabilities (
        capability_id, offer_mode, version, updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(capability_id) DO UPDATE SET
        offer_mode = excluded.offer_mode,
        version = excluded.version,
        updated_at = excluded.updated_at
    `,
    ).run(
      updated.record.capabilityId,
      updated.record.offerMode,
      updated.record.version,
      updated.record.updatedAt,
    );
  });
  persist();
  return updated;
}
