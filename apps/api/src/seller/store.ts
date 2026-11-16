import {
  SELLER_FIELDS,
  changedSellerFields,
  syntheticDemoSellerProfile,
  initializeSellerProfile,
  sellerFromRow,
  updateSellerProfile,
  validateSellerProfileInput,
  type SellerField,
  type SellerFieldIssue,
  type SellerProfile,
  type SellerProfileInput,
  type SellerProfileVersion,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type SellerRow = {
  profile_id: string;
  legal_name: string;
  brand: string;
  fiscal_id: string;
  trade_register: string;
  address: string;
  locality: string;
  iban: string;
  bank: string;
  updated_at: string;
};

type SellerVersionRow = {
  version: number;
  legal_name: string;
  brand: string;
  fiscal_id: string;
  trade_register: string;
  address: string;
  locality: string;
  iban: string;
  bank: string;
  changed_fields: string;
  created_at: string;
  created_by_user_id: string;
  created_by_label: string;
};

export function readSellerProfile(db: SqliteDatabase): SellerProfile | null {
  const row = db
    .prepare(
      `
      SELECT profile_id, legal_name, brand, fiscal_id, trade_register,
             address, locality, iban, bank, updated_at
      FROM seller_profile
      WHERE profile_id = 'seller:current'
    `,
    )
    .get() as SellerRow | undefined;
  if (!row) {
    return null;
  }
  return sellerFromRow(
    row.profile_id,
    row.legal_name,
    row.brand,
    row.fiscal_id,
    row.trade_register,
    row.address,
    row.locality,
    row.iban,
    row.bank,
    row.updated_at,
  );
}

const SYNTHETIC_SEED_UPDATED_AT = "2026-08-17T00:00:00.000Z";

/**
 * Commercial & Financial V1: Cloud organization planes are never seeded; they stay unconfigured
 * until the Owner saves the company identity. Only the local single-plane runtime (development and
 * automated tests, refused in production) receives the visibly synthetic demonstration seller.
 * No real company identifier exists in code.
 */
export function getSellerProfile(
  db: SqliteDatabase,
  options: { syntheticLocalSeed?: boolean } = {},
): SellerProfile | null {
  const current = readSellerProfile(db);
  if (current || !options.syntheticLocalSeed) {
    return current;
  }
  const seeded = syntheticDemoSellerProfile(SYNTHETIC_SEED_UPDATED_AT);
  persistSellerProfile(db, seeded);
  return seeded;
}

/** Current version number. 0 = no recorded history (unconfigured, or a pre-V1 profile). */
export function readSellerProfileVersionNumber(db: SqliteDatabase): number {
  const row = db.prepare("SELECT MAX(version) AS version FROM seller_profile_versions").get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? 0;
}

export function listSellerProfileVersions(db: SqliteDatabase): SellerProfileVersion[] {
  const rows = db
    .prepare("SELECT * FROM seller_profile_versions ORDER BY version DESC")
    .all() as SellerVersionRow[];
  return rows.map((row) => ({
    version: row.version,
    values: {
      legalName: row.legal_name,
      brand: row.brand,
      fiscalId: row.fiscal_id,
      tradeRegister: row.trade_register,
      address: row.address,
      locality: row.locality,
      iban: row.iban,
      bank: row.bank,
    },
    changedFields: readChangedFields(row.changed_fields),
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    createdByLabel: row.created_by_label,
  }));
}

function readChangedFields(raw: string): SellerField[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SellerField => (SELLER_FIELDS as readonly string[]).includes(item))
      : [];
  } catch {
    return [];
  }
}

export type SellerSaveResult =
  | { ok: true; profile: SellerProfile; version: number; alreadyApplied: boolean; warnings: SellerFieldIssue[] }
  | { ok: false; error: "invalid_profile"; issues: SellerFieldIssue[] }
  | { ok: false; error: "version_conflict"; currentVersion: number };

/**
 * Validated, versioned save. `expectedVersion` protects against concurrent edits: it must equal
 * the current version (0 for a profile without history). Compatibility: a client that does not
 * send `expectedVersion` (pre-V1 seeds and scripts) keeps last-write-wins, but every write is still
 * validated and versioned. The Administration page always sends it. The current row and an
 * immutable version row are written in one transaction.
 */
export function saveSellerProfile(
  db: SqliteDatabase,
  input: SellerProfileInput,
  actor: { userId: string; label: string },
  expectedVersion: number | null,
  now = new Date().toISOString(),
): SellerSaveResult {
  const validated = validateSellerProfileInput(input);
  if (!validated.ok) {
    return { ok: false, error: "invalid_profile", issues: validated.issues };
  }
  return db.transaction((): SellerSaveResult => {
    const current = readSellerProfile(db);
    const currentVersion = readSellerProfileVersionNumber(db);
    if (expectedVersion !== null && expectedVersion !== currentVersion) {
      return { ok: false, error: "version_conflict", currentVersion };
    }
    const updated = current
      ? updateSellerProfile(current, validated.input, now)
      : initializeSellerProfile(validated.input, now);
    if (!updated.ok) {
      return { ok: false, error: "invalid_profile", issues: [] };
    }
    if (updated.alreadyApplied) {
      return { ok: true, profile: updated.profile, version: currentVersion, alreadyApplied: true, warnings: validated.warnings };
    }
    const version = currentVersion + 1;
    persistSellerProfile(db, updated.profile);
    db.prepare(
      `INSERT INTO seller_profile_versions (
        version, legal_name, brand, fiscal_id, trade_register, address, locality, iban, bank,
        changed_fields, created_at, created_by_user_id, created_by_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      version,
      updated.profile.legalName,
      updated.profile.brand,
      updated.profile.fiscalId,
      updated.profile.tradeRegister,
      updated.profile.address,
      updated.profile.locality,
      updated.profile.iban,
      updated.profile.bank,
      JSON.stringify(changedSellerFields(current, validated.input)),
      now,
      actor.userId,
      actor.label,
    );
    return { ok: true, profile: updated.profile, version, alreadyApplied: false, warnings: validated.warnings };
  })();
}

export function persistSellerProfile(db: SqliteDatabase, profile: SellerProfile): void {
  db.prepare(
    `
    INSERT INTO seller_profile (
      profile_id, legal_name, brand, fiscal_id, trade_register,
      address, locality, iban, bank, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      legal_name = excluded.legal_name,
      brand = excluded.brand,
      fiscal_id = excluded.fiscal_id,
      trade_register = excluded.trade_register,
      address = excluded.address,
      locality = excluded.locality,
      iban = excluded.iban,
      bank = excluded.bank,
      updated_at = excluded.updated_at
  `,
  ).run(
    profile.profileId,
    profile.legalName,
    profile.brand,
    profile.fiscalId,
    profile.tradeRegister,
    profile.address,
    profile.locality,
    profile.iban,
    profile.bank,
    profile.updatedAt,
  );
}
