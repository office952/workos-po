import { randomUUID } from "node:crypto";
import type { JournalEntryInput } from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

/**
 * Commercial Continuity V2 · persistence of quote variants and of the commercial journal.
 * Every write of a variant names the version it replaces; a stale write is refused and nothing is
 * overwritten silently. Journal entries and variant events are append-only.
 */

export type VariantActor = { userId: string; label: string };

export type VariantValues = Record<string, unknown>;

export type VariantRecord = {
  variantId: string;
  requestId: string;
  registrationIndex: number;
  productCode: string;
  alternativeOfVariantId: string | null;
  lifecycle: "ACTIVE" | "WITHDRAWN";
  version: number;
  values: VariantValues;
  notes: string | null;
  confirmedReviewId: string | null;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  confirmedByLabel: string | null;
  productNetPrice: number | null;
  priceReviewId: string | null;
  priceSetAt: string | null;
  priceSetByUserId: string | null;
  priceSetByLabel: string | null;
  priceSetByRole: "owner" | "member" | null;
  quoteSnapshotId: string | null;
  issuedAt: string | null;
  issuedByLabel: string | null;
  createdAt: string;
  createdByLabel: string;
  updatedAt: string;
  updatedByUserId: string;
  updatedByLabel: string;
};

type VariantRow = {
  variant_id: string;
  request_id: string;
  registration_index: number;
  product_code: string;
  alternative_of_variant_id: string | null;
  lifecycle: string;
  version: number;
  draft_values: string;
  notes: string | null;
  confirmed_review_id: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  confirmed_by_label: string | null;
  product_net_price: number | null;
  price_review_id: string | null;
  price_set_at: string | null;
  price_set_by_user_id: string | null;
  price_set_by_label: string | null;
  price_set_by_role: string | null;
  quote_snapshot_id: string | null;
  issued_at: string | null;
  issued_by_label: string | null;
  created_at: string;
  created_by_label: string;
  updated_at: string;
  updated_by_user_id: string;
  updated_by_label: string;
};

function parseValues(raw: string): VariantValues {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as VariantValues) : {};
  } catch {
    return {};
  }
}

function variantFromRow(row: VariantRow): VariantRecord {
  return {
    variantId: row.variant_id,
    requestId: row.request_id,
    registrationIndex: row.registration_index,
    productCode: row.product_code,
    alternativeOfVariantId: row.alternative_of_variant_id,
    lifecycle: row.lifecycle === "WITHDRAWN" ? "WITHDRAWN" : "ACTIVE",
    version: row.version,
    values: parseValues(row.draft_values),
    notes: row.notes,
    confirmedReviewId: row.confirmed_review_id,
    confirmedAt: row.confirmed_at,
    confirmedByUserId: row.confirmed_by_user_id,
    confirmedByLabel: row.confirmed_by_label,
    productNetPrice: row.product_net_price,
    priceReviewId: row.price_review_id,
    priceSetAt: row.price_set_at,
    priceSetByUserId: row.price_set_by_user_id,
    priceSetByLabel: row.price_set_by_label,
    priceSetByRole: row.price_set_by_role === "owner" || row.price_set_by_role === "member" ? row.price_set_by_role : null,
    quoteSnapshotId: row.quote_snapshot_id,
    issuedAt: row.issued_at,
    issuedByLabel: row.issued_by_label,
    createdAt: row.created_at,
    createdByLabel: row.created_by_label,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    updatedByLabel: row.updated_by_label,
  };
}

/** Key-ordered JSON, so two equal value sets always compare equal. */
export function canonicalValues(values: VariantValues): string {
  const ordered: VariantValues = {};
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

/** True when the database has the Continuity V2 tables (migration 054 applied). */
export function variantsAvailable(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'commercial_request_variants'")
    .get() as { present: number } | undefined;
  return Boolean(row);
}

export function listRequestVariants(db: SqliteDatabase, requestId: string): VariantRecord[] {
  if (!variantsAvailable(db)) return [];
  const rows = db
    .prepare("SELECT * FROM commercial_request_variants WHERE request_id = ? ORDER BY registration_index ASC")
    .all(requestId) as VariantRow[];
  return rows.map(variantFromRow);
}

/**
 * Where the unissued, active variants of a request stand, from stored facts only. The request
 * journey uses it so a request with a saved variant never asks for a product again.
 */
export function openVariantStages(
  db: SqliteDatabase,
  requestId: string,
): { variantId: string; stage: "IN_PROGRESS" | "AWAITING_PRICE" | "PRICED" }[] {
  return listRequestVariants(db, requestId)
    .filter((variant) => variant.lifecycle === "ACTIVE" && variant.quoteSnapshotId === null)
    .map((variant) => ({
      variantId: variant.variantId,
      stage:
        variant.confirmedReviewId === null
          ? ("IN_PROGRESS" as const)
          : variant.productNetPrice !== null && variant.priceReviewId === variant.confirmedReviewId
            ? ("PRICED" as const)
            : ("AWAITING_PRICE" as const),
    }));
}

export function readVariant(db: SqliteDatabase, variantId: string): VariantRecord | null {
  if (!variantsAvailable(db)) return null;
  const row = db.prepare("SELECT * FROM commercial_request_variants WHERE variant_id = ?").get(variantId) as
    | VariantRow
    | undefined;
  return row ? variantFromRow(row) : null;
}

export function readVariantByQuote(db: SqliteDatabase, quoteSnapshotId: string): VariantRecord | null {
  if (!variantsAvailable(db)) return null;
  const row = db
    .prepare("SELECT * FROM commercial_request_variants WHERE quote_snapshot_id = ?")
    .get(quoteSnapshotId) as VariantRow | undefined;
  return row ? variantFromRow(row) : null;
}

export type VariantEventKind =
  | "CREATED"
  | "VALUES_SAVED"
  | "CONFIRMED"
  | "CONFIRMATION_CLEARED"
  | "PRICE_SET"
  | "PRICE_CLEARED"
  | "APPROVAL_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "ISSUED"
  | "WITHDRAWN"
  | "RESUMED";

export type VariantEvent = {
  eventId: string;
  variantId: string;
  requestId: string;
  sequence: number;
  kind: VariantEventKind;
  actorLabel: string;
  occurredAt: string;
  variantVersion: number;
  netPrice: number | null;
  detail: string | null;
};

export function appendVariantEvent(
  db: SqliteDatabase,
  variant: Pick<VariantRecord, "variantId" | "requestId" | "version">,
  kind: VariantEventKind,
  actor: VariantActor,
  at: string,
  extra: { netPrice?: number | null; detail?: string | null } = {},
): void {
  const next = db
    .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM commercial_request_variant_events WHERE variant_id = ?")
    .get(variant.variantId) as { next: number };
  db.prepare(
    `INSERT INTO commercial_request_variant_events
      (event_id, variant_id, request_id, sequence, event_kind, actor_user_id, actor_label, occurred_at,
       variant_version, net_price, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `vev:${randomUUID()}`,
    variant.variantId,
    variant.requestId,
    next.next,
    kind,
    actor.userId,
    actor.label,
    at,
    variant.version,
    extra.netPrice ?? null,
    extra.detail ?? null,
  );
}

export function listRequestVariantEvents(db: SqliteDatabase, requestId: string): VariantEvent[] {
  if (!variantsAvailable(db)) return [];
  const rows = db
    .prepare(
      "SELECT * FROM commercial_request_variant_events WHERE request_id = ? ORDER BY occurred_at ASC, rowid ASC",
    )
    .all(requestId) as {
    event_id: string;
    variant_id: string;
    request_id: string;
    sequence: number;
    event_kind: string;
    actor_label: string;
    occurred_at: string;
    variant_version: number;
    net_price: number | null;
    detail: string | null;
  }[];
  return rows.map((row) => ({
    eventId: row.event_id,
    variantId: row.variant_id,
    requestId: row.request_id,
    sequence: row.sequence,
    kind: row.event_kind as VariantEventKind,
    actorLabel: row.actor_label,
    occurredAt: row.occurred_at,
    variantVersion: row.variant_version,
    netPrice: row.net_price,
    detail: row.detail,
  }));
}

export type VariantWriteFailure =
  | { ok: false; error: "not_found" }
  | { ok: false; error: "version_conflict"; current: VariantRecord }
  | { ok: false; error: "variant_issued"; current: VariantRecord }
  | { ok: false; error: "variant_withdrawn"; current: VariantRecord }
  | { ok: false; error: "not_confirmed"; current: VariantRecord };

export type VariantWriteResult = { ok: true; variant: VariantRecord; changed: boolean } | VariantWriteFailure;

/** Reads the row a write is about and refuses a stale or closed target. */
function openForWrite(
  db: SqliteDatabase,
  variantId: string,
  expectedVersion: number,
  options: { allowWithdrawn?: boolean } = {},
): { ok: true; variant: VariantRecord } | VariantWriteFailure {
  const current = readVariant(db, variantId);
  if (!current) return { ok: false, error: "not_found" };
  if (current.quoteSnapshotId) return { ok: false, error: "variant_issued", current };
  if (current.version !== expectedVersion) return { ok: false, error: "version_conflict", current };
  if (current.lifecycle === "WITHDRAWN" && !options.allowWithdrawn) {
    return { ok: false, error: "variant_withdrawn", current };
  }
  return { ok: true, variant: current };
}

export function createVariant(
  db: SqliteDatabase,
  input: {
    requestId: string;
    productCode: string;
    alternativeOfVariantId: string | null;
    values: VariantValues;
  },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantRecord {
  return db.transaction((): VariantRecord => {
    const next = db
      .prepare(
        "SELECT COALESCE(MAX(registration_index), 0) + 1 AS next FROM commercial_request_variants WHERE request_id = ?",
      )
      .get(input.requestId) as { next: number };
    const variantId = `var:${randomUUID()}`;
    db.prepare(
      `INSERT INTO commercial_request_variants (
        variant_id, request_id, registration_index, product_code, alternative_of_variant_id, lifecycle,
        version, draft_values, created_at, created_by_user_id, created_by_label,
        updated_at, updated_by_user_id, updated_by_label
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      variantId,
      input.requestId,
      next.next,
      input.productCode,
      input.alternativeOfVariantId,
      canonicalValues(input.values),
      now,
      actor.userId,
      actor.label,
      now,
      actor.userId,
      actor.label,
    );
    const created = readVariant(db, variantId) as VariantRecord;
    appendVariantEvent(db, created, "CREATED", actor, now);
    return created;
  })();
}

/**
 * Autosave of technical values and of the note. Changing a technical value after confirmation
 * clears the confirmation; the saved price stays on the row, bound to the earlier configuration.
 */
export function saveVariantDraft(
  db: SqliteDatabase,
  input: { variantId: string; expectedVersion: number; values?: VariantValues; notes?: string | null },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantWriteResult {
  return db.transaction((): VariantWriteResult => {
    const opened = openForWrite(db, input.variantId, input.expectedVersion);
    if (!opened.ok) return opened;
    const current = opened.variant;
    const nextValues = input.values === undefined ? canonicalValues(current.values) : canonicalValues(input.values);
    const valuesChanged = nextValues !== canonicalValues(current.values);
    const nextNotes = input.notes === undefined ? current.notes : input.notes;
    const notesChanged = nextNotes !== current.notes;
    if (!valuesChanged && !notesChanged) return { ok: true, variant: current, changed: false };
    const clearsConfirmation = valuesChanged && current.confirmedReviewId !== null;
    db.prepare(
      `UPDATE commercial_request_variants
       SET draft_values = ?, notes = ?, version = version + 1,
           confirmed_review_id = CASE WHEN ? = 1 THEN NULL ELSE confirmed_review_id END,
           confirmed_at = CASE WHEN ? = 1 THEN NULL ELSE confirmed_at END,
           confirmed_by_user_id = CASE WHEN ? = 1 THEN NULL ELSE confirmed_by_user_id END,
           confirmed_by_label = CASE WHEN ? = 1 THEN NULL ELSE confirmed_by_label END,
           updated_at = ?, updated_by_user_id = ?, updated_by_label = ?
       WHERE variant_id = ? AND version = ?`,
    ).run(
      nextValues,
      nextNotes,
      clearsConfirmation ? 1 : 0,
      clearsConfirmation ? 1 : 0,
      clearsConfirmation ? 1 : 0,
      clearsConfirmation ? 1 : 0,
      now,
      actor.userId,
      actor.label,
      current.variantId,
      current.version,
    );
    const saved = readVariant(db, current.variantId) as VariantRecord;
    if (valuesChanged) appendVariantEvent(db, saved, "VALUES_SAVED", actor, now);
    if (clearsConfirmation) {
      appendVariantEvent(db, saved, "CONFIRMATION_CLEARED", actor, now, {
        detail: "Configurația a fost modificată după confirmare.",
      });
    }
    return { ok: true, variant: saved, changed: true };
  })();
}

export function confirmVariant(
  db: SqliteDatabase,
  input: { variantId: string; expectedVersion: number; reviewId: string },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantWriteResult {
  return db.transaction((): VariantWriteResult => {
    const opened = openForWrite(db, input.variantId, input.expectedVersion);
    if (!opened.ok) return opened;
    const current = opened.variant;
    if (current.confirmedReviewId === input.reviewId) return { ok: true, variant: current, changed: false };
    db.prepare(
      `UPDATE commercial_request_variants
       SET confirmed_review_id = ?, confirmed_at = ?, confirmed_by_user_id = ?, confirmed_by_label = ?,
           version = version + 1, updated_at = ?, updated_by_user_id = ?, updated_by_label = ?
       WHERE variant_id = ? AND version = ?`,
    ).run(input.reviewId, now, actor.userId, actor.label, now, actor.userId, actor.label, current.variantId, current.version);
    const saved = readVariant(db, current.variantId) as VariantRecord;
    appendVariantEvent(db, saved, "CONFIRMED", actor, now);
    return { ok: true, variant: saved, changed: true };
  })();
}

/** The official product price. Kept only for the configuration that is confirmed now. */
export function setVariantPrice(
  db: SqliteDatabase,
  input: {
    variantId: string;
    expectedVersion: number;
    netPrice: number | null;
    role: "owner" | "member";
    /**
     * The caller records the price event itself, once it knows whether the saved price may be
     * issued directly ("SET") or needs the Owner's approval first ("PROPOSED").
     */
    deferPriceEvent?: boolean;
  },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantWriteResult {
  return db.transaction((): VariantWriteResult => {
    const opened = openForWrite(db, input.variantId, input.expectedVersion);
    if (!opened.ok) return opened;
    const current = opened.variant;
    if (!current.confirmedReviewId) return { ok: false, error: "not_confirmed", current };
    if (
      current.productNetPrice === input.netPrice &&
      (input.netPrice === null || current.priceReviewId === current.confirmedReviewId)
    ) {
      return { ok: true, variant: current, changed: false };
    }
    db.prepare(
      `UPDATE commercial_request_variants
       SET product_net_price = ?, price_review_id = ?, price_set_at = ?, price_set_by_user_id = ?,
           price_set_by_label = ?, price_set_by_role = ?,
           version = version + 1, updated_at = ?, updated_by_user_id = ?, updated_by_label = ?
       WHERE variant_id = ? AND version = ?`,
    ).run(
      input.netPrice,
      input.netPrice === null ? null : current.confirmedReviewId,
      input.netPrice === null ? null : now,
      input.netPrice === null ? null : actor.userId,
      input.netPrice === null ? null : actor.label,
      input.netPrice === null ? null : input.role,
      now,
      actor.userId,
      actor.label,
      current.variantId,
      current.version,
    );
    const saved = readVariant(db, current.variantId) as VariantRecord;
    if (input.netPrice === null) {
      appendVariantEvent(db, saved, "PRICE_CLEARED", actor, now, { netPrice: null });
    } else if (!input.deferPriceEvent) {
      // Without a policy evaluation, the Owner's price is set and a Comercial price is proposed.
      appendVariantEvent(db, saved, "PRICE_SET", actor, now, {
        netPrice: input.netPrice,
        detail: input.role === "owner" ? "SET" : "PROPOSED",
      });
    }
    return { ok: true, variant: saved, changed: true };
  })();
}

/** Ties the variant to the frozen quote. Runs inside the caller's freeze transaction. */
export function markVariantIssued(
  db: SqliteDatabase,
  input: { variantId: string; expectedVersion: number; quoteSnapshotId: string },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantWriteResult {
  const opened = openForWrite(db, input.variantId, input.expectedVersion);
  if (!opened.ok) return opened;
  const current = opened.variant;
  db.prepare(
    `UPDATE commercial_request_variants
     SET quote_snapshot_id = ?, issued_at = ?, issued_by_user_id = ?, issued_by_label = ?,
         version = version + 1, updated_at = ?, updated_by_user_id = ?, updated_by_label = ?
     WHERE variant_id = ? AND version = ?`,
  ).run(input.quoteSnapshotId, now, actor.userId, actor.label, now, actor.userId, actor.label, current.variantId, current.version);
  const saved = readVariant(db, current.variantId) as VariantRecord;
  appendVariantEvent(db, saved, "ISSUED", actor, now, { netPrice: saved.productNetPrice, detail: input.quoteSnapshotId });
  return { ok: true, variant: saved, changed: true };
}

export function setVariantLifecycle(
  db: SqliteDatabase,
  input: { variantId: string; expectedVersion: number; lifecycle: "ACTIVE" | "WITHDRAWN" },
  actor: VariantActor,
  now = new Date().toISOString(),
): VariantWriteResult {
  return db.transaction((): VariantWriteResult => {
    const opened = openForWrite(db, input.variantId, input.expectedVersion, { allowWithdrawn: true });
    if (!opened.ok) return opened;
    const current = opened.variant;
    if (current.lifecycle === input.lifecycle) return { ok: true, variant: current, changed: false };
    db.prepare(
      `UPDATE commercial_request_variants
       SET lifecycle = ?, version = version + 1, updated_at = ?, updated_by_user_id = ?, updated_by_label = ?
       WHERE variant_id = ? AND version = ?`,
    ).run(input.lifecycle, now, actor.userId, actor.label, current.variantId, current.version);
    const saved = readVariant(db, current.variantId) as VariantRecord;
    appendVariantEvent(db, saved, input.lifecycle === "WITHDRAWN" ? "WITHDRAWN" : "RESUMED", actor, now);
    return { ok: true, variant: saved, changed: true };
  })();
}

// ---------------------------------------------------------------------------------------------
// Commercial journal
// ---------------------------------------------------------------------------------------------

export type JournalEntryRecord = JournalEntryInput & {
  entryId: string;
  requestId: string;
  rectifiesEntryId: string | null;
  rectificationReason: string | null;
  authorUserId: string;
  authorLabel: string;
  recordedAt: string;
};

type JournalRow = {
  entry_id: string;
  request_id: string;
  variant_id: string | null;
  entry_kind: string;
  discussed_at: string;
  channel: string;
  interlocutor: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string | null;
  vat_basis: string | null;
  notes: string | null;
  rectifies_entry_id: string | null;
  rectification_reason: string | null;
  author_user_id: string;
  author_label: string;
  recorded_at: string;
};

function journalFromRow(row: JournalRow): JournalEntryRecord {
  return {
    entryId: row.entry_id,
    requestId: row.request_id,
    variantId: row.variant_id,
    kind: row.entry_kind as JournalEntryRecord["kind"],
    discussedAt: row.discussed_at,
    channel: row.channel as JournalEntryRecord["channel"],
    interlocutor: row.interlocutor,
    amountMin: row.amount_min,
    amountMax: row.amount_max,
    currency: row.currency as JournalEntryRecord["currency"],
    vatBasis: row.vat_basis as JournalEntryRecord["vatBasis"],
    notes: row.notes,
    rectifiesEntryId: row.rectifies_entry_id,
    rectificationReason: row.rectification_reason,
    authorUserId: row.author_user_id,
    authorLabel: row.author_label,
    recordedAt: row.recorded_at,
  };
}

export function listJournalEntries(db: SqliteDatabase, requestId: string): JournalEntryRecord[] {
  if (!variantsAvailable(db)) return [];
  const rows = db
    .prepare(
      "SELECT * FROM commercial_request_journal_entries WHERE request_id = ? ORDER BY discussed_at ASC, rowid ASC",
    )
    .all(requestId) as JournalRow[];
  return rows.map(journalFromRow);
}

export function readJournalEntry(db: SqliteDatabase, entryId: string): JournalEntryRecord | null {
  if (!variantsAvailable(db)) return null;
  const row = db.prepare("SELECT * FROM commercial_request_journal_entries WHERE entry_id = ?").get(entryId) as
    | JournalRow
    | undefined;
  return row ? journalFromRow(row) : null;
}

/** Appends an entry. A correction names the entry it corrects; nothing is ever rewritten. */
export function appendJournalEntry(
  db: SqliteDatabase,
  requestId: string,
  entry: JournalEntryInput,
  rectification: { entryId: string; reason: string } | null,
  actor: VariantActor,
  now = new Date().toISOString(),
): JournalEntryRecord {
  const entryId = `jrn:${randomUUID()}`;
  db.prepare(
    `INSERT INTO commercial_request_journal_entries (
      entry_id, request_id, variant_id, entry_kind, discussed_at, channel, interlocutor,
      amount_min, amount_max, currency, vat_basis, notes, rectifies_entry_id, rectification_reason,
      author_user_id, author_label, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entryId,
    requestId,
    entry.variantId,
    entry.kind,
    entry.discussedAt,
    entry.channel,
    entry.interlocutor,
    entry.amountMin,
    entry.amountMax,
    entry.currency,
    entry.vatBasis,
    entry.notes,
    rectification?.entryId ?? null,
    rectification?.reason ?? null,
    actor.userId,
    actor.label,
    now,
  );
  return readJournalEntry(db, entryId) as JournalEntryRecord;
}
