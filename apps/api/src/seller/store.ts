import {
  OWNER_CONFIRMED_SELLER,
  initializeSellerProfile,
  ownerConfirmedSellerProfile,
  sellerFromRow,
  updateSellerProfile,
  type SellerProfile,
  type SellerProfileInput,
  type SellerMutationResult,
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

const SEED_UPDATED_AT = "2026-08-17T00:00:00.000Z";

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

export function getSellerProfile(
  db: SqliteDatabase,
  options: { lazyHubSeed?: boolean } = {},
): SellerProfile | null {
  const current = readSellerProfile(db);
  if (current) {
    return current;
  }
  if (!options.lazyHubSeed) {
    return null;
  }
  const seeded = ownerConfirmedSellerProfile(SEED_UPDATED_AT);
  persistSellerProfile(db, seeded);
  return seeded;
}

export function persistUpdatedSeller(
  db: SqliteDatabase,
  input: SellerProfileInput,
): SellerMutationResult {
  const current = readSellerProfile(db);
  const updated = current
    ? updateSellerProfile(current, input)
    : initializeSellerProfile(input);
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  persistSellerProfile(db, updated.profile);
  return updated;
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

export function isHubMediaSeller(profile: SellerProfile | null): boolean {
  return (
    profile?.legalName === OWNER_CONFIRMED_SELLER.legalName &&
    profile.fiscalId === OWNER_CONFIRMED_SELLER.fiscalId
  );
}
