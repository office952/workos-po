import {
  createDisplayLabelCatalog,
  isKnownProductSystemEntity,
  isProductSystemEntityKind,
  seedDisplayLabelRecords,
  validateDisplayLabel,
  type DisplayLabelCatalog,
  type DisplayLabelRecord,
  type ProductSystemEntityKind,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

export type DisplayLabelWriteError =
  | "invalid_kind"
  | "unknown_entity"
  | "invalid_label"
  | "revision_conflict";

export type DisplayLabelWriteResult =
  | { ok: true; record: DisplayLabelRecord }
  | { ok: false; error: DisplayLabelWriteError; revision?: number };

type StoredRow = {
  entity_kind: string;
  entity_id: string;
  display_label: string;
  revision: number;
};

export function bootstrapProductSystemDisplayStore(db: SqliteDatabase): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO product_system_display_metadata
      (entity_kind, entity_id, display_label, revision, updated_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    for (const record of seedDisplayLabelRecords()) {
      insert.run(record.entityKind, record.entityId, record.displayLabel, now);
    }
  });
  seed();
}

export function loadDisplayLabelCatalog(db: SqliteDatabase): DisplayLabelCatalog {
  return createDisplayLabelCatalog(listDisplayLabelRecords(db));
}

export function listDisplayLabelRecords(
  db: SqliteDatabase,
): DisplayLabelRecord[] {
  const rows = db
    .prepare(
      `
      SELECT entity_kind, entity_id, display_label, revision
      FROM product_system_display_metadata
    `,
    )
    .all() as StoredRow[];
  return rows.flatMap((row) =>
    isProductSystemEntityKind(row.entity_kind)
      ? [
          {
            entityKind: row.entity_kind,
            entityId: row.entity_id,
            displayLabel: row.display_label,
            revision: row.revision,
          },
        ]
      : [],
  );
}

export function updateDisplayLabel(
  db: SqliteDatabase,
  entityKind: string,
  entityId: string,
  displayLabel: unknown,
  expectedRevision?: number,
): DisplayLabelWriteResult {
  if (!isProductSystemEntityKind(entityKind)) {
    return { ok: false, error: "invalid_kind" };
  }
  if (!isKnownProductSystemEntity(entityKind, entityId)) {
    return { ok: false, error: "unknown_entity" };
  }
  const validated = validateDisplayLabel(displayLabel);
  if (!validated.ok) {
    return { ok: false, error: "invalid_label" };
  }

  const current = db
    .prepare(
      `
      SELECT entity_kind, entity_id, display_label, revision
      FROM product_system_display_metadata
      WHERE entity_kind = ? AND entity_id = ?
    `,
    )
    .get(entityKind, entityId) as StoredRow | undefined;
  if (!current) {
    return { ok: false, error: "unknown_entity" };
  }
  if (
    expectedRevision !== undefined &&
    current.revision !== expectedRevision
  ) {
    return {
      ok: false,
      error: "revision_conflict",
      revision: current.revision,
    };
  }

  const nextRevision = current.revision + 1;
  db.prepare(
    `
    UPDATE product_system_display_metadata
    SET display_label = ?, revision = ?, updated_at = ?
    WHERE entity_kind = ? AND entity_id = ?
  `,
  ).run(
    validated.displayLabel,
    nextRevision,
    new Date().toISOString(),
    entityKind,
    entityId,
  );

  return {
    ok: true,
    record: {
      entityKind,
      entityId,
      displayLabel: validated.displayLabel,
      revision: nextRevision,
    },
  };
}

export function entityKindFromParam(
  value: string,
): ProductSystemEntityKind | null {
  return isProductSystemEntityKind(value) ? value : null;
}
