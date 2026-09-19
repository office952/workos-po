import { randomUUID } from "node:crypto";
import {
  calendarDateOrderIsValid,
  parseCanonicalCalendarDate,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  costEvidence,
  getResource,
  isValidCostAmount,
  ownerConfirmedCostSource,
  parseCostEvidenceWhen,
  resourceAllowsCostEvidenceQualifier,
  sortActiveCostEvidence,
  type CostEvidence,
  type ResourceKind,
  type ResourceUnit,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import type { BootstrapPolicy } from "../cloud/controlPlane.js";

export const PLATFORM_DEFAULT_COST_NOTE =
  "Valoare implicită de platformă. Trebuie confirmată de owner.";

export const RESOURCE_COST_EVIDENCE_MARKER = "RESOURCE_COST_EVIDENCE_V1_APPLIED";

const COST_SOURCES = [
  "PILOT_INTERNAL_EVIDENCE",
  "OWNER_CONFIRMED_PURCHASE",
  "OWNER_CONFIRMED_WORKSHOP",
  "LEGACY_EVIDENCE",
  "AI_DECISION",
  "PLATFORM_DEFAULT",
] as const;

const COST_CLASSIFICATIONS = [
  "AI_DECISION",
  "OWNER_CONFIRMED",
  "DEVELOPMENT_DEFAULT",
] as const;

const RESOURCE_UNITS = ["m", "m2", "buc", "person_hour", "job"] as const;

const NOTE_MAX_LENGTH = 2000;

type CostEvidenceRow = {
  evidence_row_id: string;
  resource_id: string;
  volume_depth_mm: number | null;
  amount: number;
  currency: string;
  per_unit: string;
  source: string;
  classification: string;
  note: string;
  supplier_label: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  superseded_at: string | null;
};

export type CostEvidenceWriteError =
  | "not_found"
  | "stale_cost_evidence"
  | "invalid_amount"
  | "invalid_note"
  | "unknown_resource"
  | "already_exists"
  | "invalid_qualifier"
  | "invalid_supplier"
  | "invalid_validity";

export type CostEvidenceWriteResult =
  | { ok: true; evidence: CostEvidence }
  | { ok: false; error: CostEvidenceWriteError };

export function isCostEvidenceApplied(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
    .get(RESOURCE_COST_EVIDENCE_MARKER) as { marker_id: string } | undefined;
  return Boolean(row);
}

export function ensureCostEvidence(
  db: SqliteDatabase,
  policy: BootstrapPolicy | "SINGLE_PLANE" = "SINGLE_PLANE",
): void {
  if (policy === "ADOPT_EXISTING") {
    return;
  }
  if (isCostEvidenceApplied(db)) {
    return;
  }
  const seeds = costSeedsForPolicy(policy);
  const apply = db.transaction(() => {
    if (isCostEvidenceApplied(db)) {
      return;
    }
    const createdAt = new Date().toISOString();
    const insert = db.prepare(
      `
      INSERT INTO resource_cost_evidence (
        evidence_row_id,
        resource_id,
        volume_depth_mm,
        amount,
        currency,
        per_unit,
        source,
        classification,
        note,
        supplier_label,
        valid_from,
        valid_until,
        created_at,
        superseded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `,
    );
    for (const seed of seeds) {
      insert.run(
        `cev:${randomUUID()}`,
        seed.resourceId,
        seed.when?.volumeDepthMm ?? null,
        seed.amount,
        seed.currency,
        seed.perUnit,
        seed.source,
        seed.classification,
        seed.note,
        seed.supplierLabel ?? null,
        seed.validFrom ?? null,
        seed.validUntil ?? null,
        createdAt,
      );
    }
    db.prepare(
      `
      INSERT INTO runtime_bootstrap_markers (marker_id, applied_at)
      VALUES (?, ?)
    `,
    ).run(RESOURCE_COST_EVIDENCE_MARKER, createdAt);
  });
  apply();
}

function costSeedsForPolicy(
  policy: Exclude<BootstrapPolicy | "SINGLE_PLANE", "ADOPT_EXISTING">,
): readonly CostEvidence[] {
  if (policy === "SINGLE_PLANE") {
    return costEvidence;
  }
  return costEvidence.map((row) => ({
    ...row,
    source: "PLATFORM_DEFAULT",
    classification: "DEVELOPMENT_DEFAULT",
    note: PLATFORM_DEFAULT_COST_NOTE,
  }));
}

export function listActiveCostEvidence(db: SqliteDatabase): CostEvidence[] {
  const rows = db
    .prepare(
      `
      SELECT evidence_row_id, resource_id, volume_depth_mm, amount, currency,
             per_unit, source, classification, note, supplier_label, valid_from,
             valid_until, created_at, superseded_at
      FROM resource_cost_evidence
      WHERE superseded_at IS NULL
    `,
    )
    .all() as CostEvidenceRow[];
  const mapped = rows.flatMap((row) => {
    const evidence = toCostEvidence(row);
    return evidence ? [evidence] : [];
  });
  return sortActiveCostEvidence(mapped);
}

export function supersedeCostEvidence(
  db: SqliteDatabase,
  evidenceRowId: string,
  amount: unknown,
  note: unknown,
  extras?: {
    supplierLabel?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
  },
): CostEvidenceWriteResult {
  if (!isValidCostAmount(typeof amount === "number" ? amount : Number.NaN)) {
    return { ok: false, error: "invalid_amount" };
  }
  const parsedNote = parseNote(note);
  if (!parsedNote.ok) {
    return parsedNote;
  }

  const write = db.transaction((): CostEvidenceWriteResult => {
    const active = db
      .prepare(
        `
        SELECT evidence_row_id, resource_id, volume_depth_mm, amount, currency,
               per_unit, source, classification, note, supplier_label, valid_from,
               valid_until, created_at, superseded_at
        FROM resource_cost_evidence
        WHERE evidence_row_id = ? AND superseded_at IS NULL
      `,
      )
      .get(evidenceRowId) as CostEvidenceRow | undefined;
    if (!active) {
      const existing = db
        .prepare(
          "SELECT evidence_row_id FROM resource_cost_evidence WHERE evidence_row_id = ?",
        )
        .get(evidenceRowId) as { evidence_row_id: string } | undefined;
      return {
        ok: false,
        error: existing ? "stale_cost_evidence" : "not_found",
      };
    }

    const resource = getResource(active.resource_id);
    if (!resource) {
      return { ok: false, error: "unknown_resource" };
    }

    const supplier = parseOptionalText(extras?.supplierLabel, 200);
    if (!supplier.ok) {
      return { ok: false, error: "invalid_supplier" };
    }
    const validFrom = parseOptionalDate(extras?.validFrom);
    if (!validFrom.ok) {
      return { ok: false, error: "invalid_validity" };
    }
    const validUntil = parseOptionalDate(extras?.validUntil);
    if (!validUntil.ok) {
      return { ok: false, error: "invalid_validity" };
    }
    const nextSupplier =
      supplier.value !== undefined ? supplier.value : active.supplier_label;
    const nextValidFrom =
      validFrom.value !== undefined ? validFrom.value : active.valid_from;
    const nextValidUntil =
      validUntil.value !== undefined ? validUntil.value : active.valid_until;
    if (active.resource_id === SVC_SITE_INSTALL_SUBCONTRACT_ID) {
      if (!nextSupplier || !nextValidUntil) {
        return { ok: false, error: "invalid_supplier" };
      }
    }
    if (!calendarDateOrderIsValid(nextValidFrom, nextValidUntil)) {
      return { ok: false, error: "invalid_validity" };
    }

    const createdAt = new Date().toISOString();
    db.prepare(
      `
      UPDATE resource_cost_evidence
      SET superseded_at = ?
      WHERE evidence_row_id = ? AND superseded_at IS NULL
    `,
    ).run(createdAt, evidenceRowId);

    const nextId = `cev:${randomUUID()}`;
    db.prepare(
      `
      INSERT INTO resource_cost_evidence (
        evidence_row_id,
        resource_id,
        volume_depth_mm,
        amount,
        currency,
        per_unit,
        source,
        classification,
        note,
        supplier_label,
        valid_from,
        valid_until,
        created_at,
        superseded_at
      ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, 'OWNER_CONFIRMED', ?, ?, ?, ?, ?, NULL)
    `,
    ).run(
      nextId,
      active.resource_id,
      active.volume_depth_mm,
      amount,
      active.per_unit,
      ownerConfirmedSourceForResource(resource.id, resource.kind),
      parsedNote.note === "" ? active.note : parsedNote.note,
      nextSupplier,
      nextValidFrom,
      nextValidUntil,
      createdAt,
    );

    const inserted = db
      .prepare(
        `
        SELECT evidence_row_id, resource_id, volume_depth_mm, amount, currency,
               per_unit, source, classification, note, supplier_label, valid_from,
               valid_until, created_at, superseded_at
        FROM resource_cost_evidence
        WHERE evidence_row_id = ?
      `,
      )
      .get(nextId) as CostEvidenceRow;
    const evidence = toCostEvidence(inserted);
    if (!evidence) {
      throw new Error("cost_evidence_insert_invariant");
    }
    return { ok: true, evidence };
  });

  return write();
}

function parseNote(note: unknown): { ok: true; note: string } | { ok: false; error: "invalid_note" } {
  if (note === undefined || note === null) {
    return { ok: true, note: "" };
  }
  if (typeof note !== "string") {
    return { ok: false, error: "invalid_note" };
  }
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: "invalid_note" };
  }
  return { ok: true, note: note.trim() };
}

function toCostEvidence(row: CostEvidenceRow): CostEvidence | null {
  if (row.currency !== "EUR") {
    return null;
  }
  if (!isResourceUnit(row.per_unit)) {
    return null;
  }
  if (!isCostSource(row.source) || !isCostClassification(row.classification)) {
    return null;
  }
  if (!isValidCostAmount(row.amount)) {
    return null;
  }
  return {
    resourceId: row.resource_id,
    amount: row.amount,
    currency: "EUR",
    perUnit: row.per_unit,
    source: row.source,
    classification: row.classification,
    note: row.note,
    when:
      row.volume_depth_mm === null
        ? undefined
        : { volumeDepthMm: row.volume_depth_mm },
    evidenceRowId: row.evidence_row_id,
    createdAt: row.created_at,
    ...(row.supplier_label ? { supplierLabel: row.supplier_label } : {}),
    ...(row.valid_from ? { validFrom: row.valid_from } : {}),
    ...(row.valid_until ? { validUntil: row.valid_until } : {}),
  };
}

export function createInitialCostEvidence(
  db: SqliteDatabase,
  input: {
    resourceId: string;
    amount: unknown;
    note?: unknown;
    when?: unknown;
    supplierLabel?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
  },
): CostEvidenceWriteResult {
  if (!isValidCostAmount(typeof input.amount === "number" ? input.amount : Number.NaN)) {
    return { ok: false, error: "invalid_amount" };
  }
  const parsedNote = parseNote(input.note);
  if (!parsedNote.ok) {
    return parsedNote;
  }
  const resource = getResource(input.resourceId);
  if (!resource) {
    return { ok: false, error: "unknown_resource" };
  }
  const parsedWhen = parseCostEvidenceWhen(input.when);
  if (!parsedWhen.ok) {
    return parsedWhen;
  }
  if (
    parsedWhen.when?.volumeDepthMm !== undefined &&
    !resourceAllowsCostEvidenceQualifier(resource, "volumeDepthMm")
  ) {
    return { ok: false, error: "invalid_qualifier" };
  }
  const supplier = parseOptionalText(input.supplierLabel, 200);
  if (!supplier.ok) {
    return { ok: false, error: "invalid_supplier" };
  }
  const validFrom = parseOptionalDate(input.validFrom);
  if (!validFrom.ok) {
    return { ok: false, error: "invalid_validity" };
  }
  const validUntil = parseOptionalDate(input.validUntil);
  if (!validUntil.ok) {
    return { ok: false, error: "invalid_validity" };
  }
  if (resource.id === SVC_SITE_INSTALL_SUBCONTRACT_ID) {
    if (!supplier.value || !validUntil.value) {
      return { ok: false, error: "invalid_supplier" };
    }
  }
  if (!calendarDateOrderIsValid(validFrom.value ?? null, validUntil.value ?? null)) {
    return { ok: false, error: "invalid_validity" };
  }

  const volumeDepthMm = parsedWhen.when?.volumeDepthMm ?? null;
  const write = db.transaction((): CostEvidenceWriteResult => {
    const existing =
      volumeDepthMm === null
        ? (db
            .prepare(
              `
              SELECT evidence_row_id
              FROM resource_cost_evidence
              WHERE resource_id = ? AND superseded_at IS NULL AND volume_depth_mm IS NULL
            `,
            )
            .get(input.resourceId) as { evidence_row_id: string } | undefined)
        : (db
            .prepare(
              `
              SELECT evidence_row_id
              FROM resource_cost_evidence
              WHERE resource_id = ? AND superseded_at IS NULL AND volume_depth_mm = ?
            `,
            )
            .get(input.resourceId, volumeDepthMm) as
            | { evidence_row_id: string }
            | undefined);
    if (existing) {
      return { ok: false, error: "already_exists" };
    }
    const createdAt = new Date().toISOString();
    const nextId = `cev:${randomUUID()}`;
    db.prepare(
      `
      INSERT INTO resource_cost_evidence (
        evidence_row_id,
        resource_id,
        volume_depth_mm,
        amount,
        currency,
        per_unit,
        source,
        classification,
        note,
        supplier_label,
        valid_from,
        valid_until,
        created_at,
        superseded_at
      ) VALUES (?, ?, ?, ?, 'EUR', ?, ?, 'OWNER_CONFIRMED', ?, ?, ?, ?, ?, NULL)
    `,
    ).run(
      nextId,
      resource.id,
      volumeDepthMm,
      input.amount,
      resource.unit,
      ownerConfirmedSourceForResource(resource.id, resource.kind),
      parsedNote.note,
      supplier.value ?? null,
      validFrom.value ?? null,
      validUntil.value ?? null,
      createdAt,
    );
    const inserted = db
      .prepare(
        `
        SELECT evidence_row_id, resource_id, volume_depth_mm, amount, currency,
               per_unit, source, classification, note, supplier_label, valid_from,
               valid_until, created_at, superseded_at
        FROM resource_cost_evidence
        WHERE evidence_row_id = ?
      `,
      )
      .get(nextId) as CostEvidenceRow;
    const evidence = toCostEvidence(inserted);
    if (!evidence) {
      throw new Error("cost_evidence_insert_invariant");
    }
    return { ok: true, evidence };
  });
  return write();
}

function ownerConfirmedSourceForResource(
  resourceId: string,
  kind: ResourceKind,
): CostEvidence["source"] {
  if (resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID) {
    return "OWNER_CONFIRMED_PURCHASE";
  }
  return ownerConfirmedCostSource(kind);
}

function parseOptionalText(
  value: unknown,
  maxLength: number,
): { ok: true; value?: string | null } | { ok: false; error: "invalid_supplier" } {
  if (value === undefined) {
    return { ok: true };
  }
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_supplier" };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { ok: false, error: "invalid_supplier" };
  }
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

function parseOptionalDate(
  value: unknown,
): { ok: true; value?: string | null } | { ok: false; error: "invalid_validity" } {
  if (value === undefined) {
    return { ok: true };
  }
  if (value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_validity" };
  }
  const parsed = parseCanonicalCalendarDate(value.trim());
  if (!parsed.ok) {
    return { ok: false, error: "invalid_validity" };
  }
  return { ok: true, value: parsed.date };
}

function isResourceUnit(value: string): value is ResourceUnit {
  return (RESOURCE_UNITS as readonly string[]).includes(value);
}

function isCostSource(value: string): value is CostEvidence["source"] {
  return (COST_SOURCES as readonly string[]).includes(value);
}

function isCostClassification(
  value: string,
): value is CostEvidence["classification"] {
  return (COST_CLASSIFICATIONS as readonly string[]).includes(value);
}
