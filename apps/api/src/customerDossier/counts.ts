import type { SqliteDatabase } from "../persistence/sqlite.js";

/**
 * Historical works per customer, for the counts of the Clienți family. A dependency-free module so
 * the product-system runtime can read it without importing the dossier routes.
 */
export function countHistoricalWorksByCustomer(db: SqliteDatabase): Map<string, number> {
  const rows = db
    .prepare("SELECT customer_id, COUNT(*) AS n FROM customer_historical_works GROUP BY customer_id")
    .all() as Array<{ customer_id: string; n: number }>;
  return new Map(rows.map((row) => [row.customer_id, row.n]));
}
