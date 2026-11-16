import { getJson } from "./http";

/**
 * Read-only seller access for the configurator. Company identity writes go only through
 * Administrare › Date firmă (`saveCompanyIdentity`), which always sends `expectedVersion`.
 */
export async function fetchSeller(): Promise<unknown> {
  return getJson("/api/seller");
}
