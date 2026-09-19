import {
  SITE_INSTALLATION_SCOPE_ID,
  applySiteInstallationFactsPatch,
  isSiteInstallationElectricalState,
  isSiteInstallationFacadeType,
  isSiteInstallationFixingMethod,
  isSiteInstallationMeasurementStatus,
  type SiteInstallationFacts,
  type SiteInstallationFactsMutationResult,
  type SiteInstallationFactsPatch,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type FactsRow = {
  request_id: string;
  version: number;
  site_name: string | null;
  street: string;
  city: string;
  county: string | null;
  postal_code: string | null;
  country_code: string;
  contact_name: string | null;
  contact_phone: string | null;
  access_notes: string | null;
  measurement_status: string;
  mounting_surface_width_mm: number | null;
  mounting_surface_height_mm: number | null;
  installation_elevation_mm: number | null;
  measured_at: string | null;
  measurement_notes: string | null;
  facade_type: string;
  facade_other_note: string | null;
  fixing_method: string;
  fixing_other_note: string | null;
  site_electrical: string;
  crew_size: number | null;
  planned_duration_hours: number | null;
  created_at: string;
  updated_at: string;
};

function factsFromRow(row: FactsRow): SiteInstallationFacts | null {
  if (
    !isSiteInstallationMeasurementStatus(row.measurement_status) ||
    !isSiteInstallationFacadeType(row.facade_type) ||
    !isSiteInstallationFixingMethod(row.fixing_method) ||
    !isSiteInstallationElectricalState(row.site_electrical)
  ) {
    return null;
  }
  return {
    requestId: row.request_id,
    version: row.version,
    siteName: row.site_name,
    street: row.street,
    city: row.city,
    county: row.county,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    accessNotes: row.access_notes,
    measurementStatus: row.measurement_status,
    mountingSurfaceWidthMm: row.mounting_surface_width_mm,
    mountingSurfaceHeightMm: row.mounting_surface_height_mm,
    installationElevationMm: row.installation_elevation_mm,
    measuredAt: row.measured_at,
    measurementNotes: row.measurement_notes,
    facadeType: row.facade_type,
    facadeOtherNote: row.facade_other_note,
    fixingMethod: row.fixing_method,
    fixingOtherNote: row.fixing_other_note,
    siteElectrical: row.site_electrical,
    crewSize: row.crew_size,
    plannedDurationHours: row.planned_duration_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getInstallationFacts(
  db: SqliteDatabase,
  requestId: string,
): SiteInstallationFacts | null {
  const row = db
    .prepare(
      `
      SELECT request_id, version, site_name, street, city, county, postal_code,
             country_code, contact_name, contact_phone, access_notes,
             measurement_status, mounting_surface_width_mm, mounting_surface_height_mm,
             installation_elevation_mm, measured_at, measurement_notes,
             facade_type, facade_other_note, fixing_method, fixing_other_note,
             site_electrical, crew_size, planned_duration_hours, created_at, updated_at
      FROM commercial_request_installation_facts
      WHERE request_id = ?
    `,
    )
    .get(requestId) as FactsRow | undefined;
  return row ? factsFromRow(row) : null;
}

export function deleteInstallationFacts(db: SqliteDatabase, requestId: string): void {
  db.prepare(
    `
    DELETE FROM commercial_request_installation_facts
    WHERE request_id = ?
  `,
  ).run(requestId);
}

function factsBindValues(facts: SiteInstallationFacts): unknown[] {
  return [
    facts.requestId,
    facts.version,
    facts.siteName,
    facts.street,
    facts.city,
    facts.county,
    facts.postalCode,
    facts.countryCode,
    facts.contactName,
    facts.contactPhone,
    facts.accessNotes,
    facts.measurementStatus,
    facts.mountingSurfaceWidthMm,
    facts.mountingSurfaceHeightMm,
    facts.installationElevationMm,
    facts.measuredAt,
    facts.measurementNotes,
    facts.facadeType,
    facts.facadeOtherNote,
    facts.fixingMethod,
    facts.fixingOtherNote,
    facts.siteElectrical,
    facts.crewSize,
    facts.plannedDurationHours,
    facts.createdAt,
    facts.updatedAt,
  ];
}

function isFactsUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code.includes("CONSTRAINT") ||
    message.includes("UNIQUE constraint failed") ||
    message.includes("commercial_request_installation_facts")
  );
}

function insertInstallationFactsIfAbsent(
  db: SqliteDatabase,
  facts: SiteInstallationFacts,
): boolean {
  try {
    db.prepare(
      `
      INSERT INTO commercial_request_installation_facts (
        request_id, version, site_name, street, city, county, postal_code,
        country_code, contact_name, contact_phone, access_notes,
        measurement_status, mounting_surface_width_mm, mounting_surface_height_mm,
        installation_elevation_mm, measured_at, measurement_notes,
        facade_type, facade_other_note, fixing_method, fixing_other_note,
        site_electrical, crew_size, planned_duration_hours, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(...factsBindValues(facts));
    return true;
  } catch (error) {
    if (isFactsUniqueConflict(error)) {
      return false;
    }
    throw error;
  }
}

function updateInstallationFactsIfVersion(
  db: SqliteDatabase,
  facts: SiteInstallationFacts,
  expectedVersion: number,
): boolean {
  const result = db
    .prepare(
      `
      UPDATE commercial_request_installation_facts
      SET version = ?,
          site_name = ?,
          street = ?,
          city = ?,
          county = ?,
          postal_code = ?,
          country_code = ?,
          contact_name = ?,
          contact_phone = ?,
          access_notes = ?,
          measurement_status = ?,
          mounting_surface_width_mm = ?,
          mounting_surface_height_mm = ?,
          installation_elevation_mm = ?,
          measured_at = ?,
          measurement_notes = ?,
          facade_type = ?,
          facade_other_note = ?,
          fixing_method = ?,
          fixing_other_note = ?,
          site_electrical = ?,
          crew_size = ?,
          planned_duration_hours = ?,
          updated_at = ?
      WHERE request_id = ? AND version = ?
    `,
    )
    .run(
      facts.version,
      facts.siteName,
      facts.street,
      facts.city,
      facts.county,
      facts.postalCode,
      facts.countryCode,
      facts.contactName,
      facts.contactPhone,
      facts.accessNotes,
      facts.measurementStatus,
      facts.mountingSurfaceWidthMm,
      facts.mountingSurfaceHeightMm,
      facts.installationElevationMm,
      facts.measuredAt,
      facts.measurementNotes,
      facts.facadeType,
      facts.facadeOtherNote,
      facts.fixingMethod,
      facts.fixingOtherNote,
      facts.siteElectrical,
      facts.crewSize,
      facts.plannedDurationHours,
      facts.updatedAt,
      facts.requestId,
      expectedVersion,
    );
  return result.changes === 1;
}

function requestExists(db: SqliteDatabase, requestId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present
      FROM commercial_requests
      WHERE request_id = ?
    `,
    )
    .get(requestId) as { present: number } | undefined;
  return row !== undefined;
}

function isSiteInstallationSelected(db: SqliteDatabase, requestId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present
      FROM commercial_request_optional_scopes
      WHERE request_id = ? AND scope_id = ?
    `,
    )
    .get(requestId, SITE_INSTALLATION_SCOPE_ID) as { present: number } | undefined;
  return row !== undefined;
}

function requestHasLinkedQuotes(db: SqliteDatabase, requestId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present
      FROM commercial_request_quote_links
      WHERE request_id = ?
    `,
    )
    .get(requestId) as { present: number } | undefined;
  return row !== undefined;
}

export function persistUpdatedInstallationFacts(
  db: SqliteDatabase,
  requestId: string,
  patch: SiteInstallationFactsPatch,
  expectedVersion: number,
): SiteInstallationFactsMutationResult {
  return db.transaction((): SiteInstallationFactsMutationResult => {
    if (!requestExists(db, requestId)) {
      return { ok: false, error: "not_found" };
    }
    const current = getInstallationFacts(db, requestId);
    const updated = applySiteInstallationFactsPatch({
      selected: isSiteInstallationSelected(db, requestId),
      hasLinkedQuotes: requestHasLinkedQuotes(db, requestId),
      current,
      patch,
      expectedVersion,
      requestId,
    });
    if (!updated.ok || updated.alreadyApplied) {
      return updated;
    }
    const wrote =
      current === null
        ? insertInstallationFactsIfAbsent(db, updated.facts)
        : updateInstallationFactsIfVersion(db, updated.facts, expectedVersion);
    if (!wrote) {
      return { ok: false, error: "version_conflict" };
    }
    return updated;
  }).immediate();
}
