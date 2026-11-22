import { getOrderSnapshotByQuoteSnapshotId } from "./store.js";
import { readAssemblyOrderByQuote } from "../assembly/store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { readVariant, readVariantByQuote } from "../requests/variantStore.js";

/** R2 F29 · accepting an alternative of an already ordered sibling needs an explicit confirmation. */

export function readAlternativeAcceptanceConfirmed(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("alternativeAcceptanceConfirmed" in body)) return false;
  return (body as { alternativeAcceptanceConfirmed: unknown }).alternativeAcceptanceConfirmed === true;
}

export function checkAlternativeAcceptance(input: {
  db: SqliteDatabase;
  organizationId: string;
  quoteSnapshotId: string;
  alreadyAccepted: boolean;
  confirmed: boolean;
}): { ok: true } | { ok: false; status: 409; body: Record<string, unknown> } {
  if (input.alreadyAccepted) return { ok: true };
  const variant = readVariantByQuote(input.db, input.quoteSnapshotId);
  if (!variant?.alternativeOfVariantId) return { ok: true };
  const origin = readVariant(input.db, variant.alternativeOfVariantId);
  if (!origin?.quoteSnapshotId) return { ok: true };
  const originOrder =
    getOrderSnapshotByQuoteSnapshotId(input.db, origin.quoteSnapshotId) ??
    readAssemblyOrderByQuote(input.db, input.organizationId, origin.quoteSnapshotId);
  if (!originOrder) return { ok: true };
  if (input.confirmed) return { ok: true };
  return {
    ok: false,
    status: 409,
    body: {
      error: "alternative_of_ordered_offer",
      reasons: [
        "Această variantă este alternativa unei oferte deja comandate. Confirmă explicit că o accepți ca o comandă distinctă, nu ca înlocuire a celeilalte.",
      ],
      originQuoteSnapshotId: origin.quoteSnapshotId,
    },
  };
}
