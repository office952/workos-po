import { randomUUID } from "node:crypto";
import {
  INACTIVE_PRODUCT_ENABLEMENT,
  planProductEnablementSave,
  productEnablementVersionRecordFromPersisted,
  resolveProductEnablement,
  type PersistedProductEnablementVersion,
  type ProductEnablementDraft,
  type ProductEnablementIssue,
  type ProductEnablementResolution,
  type ProductEnablementVersionRecord,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type EnablementRow = {
  enablement_version_row_id: string;
  version: number;
  status: string;
  enabled_template_codes_json: string;
  source: string;
  effective_from: string;
  created_at: string;
  actor_user_id: string | null;
  supersedes_version: number | null;
};

export type ProductEnablementSaveResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      resolution: ProductEnablementResolution;
      history: PersistedProductEnablementVersion[];
    }
  | {
      ok: false;
      error: "invalid_enablement" | typeof INACTIVE_PRODUCT_ENABLEMENT;
      issues?: ProductEnablementIssue[];
      reason?: string;
      history: PersistedProductEnablementVersion[];
    };

export function listProductEnablementVersions(
  db: SqliteDatabase,
): PersistedProductEnablementVersion[] {
  const rows = db
    .prepare(
      `
      SELECT
        enablement_version_row_id,
        version,
        status,
        enabled_template_codes_json,
        source,
        effective_from,
        created_at,
        actor_user_id,
        supersedes_version
      FROM organization_product_enablement_versions
      ORDER BY version ASC
    `,
    )
    .all() as EnablementRow[];
  return rows.map(recordFromRow);
}

export function resolveStoredProductEnablement(
  db: SqliteDatabase,
): ProductEnablementResolution {
  return resolveProductEnablement(listProductEnablementVersions(db));
}

export function persistProductEnablementSave(
  db: SqliteDatabase,
  drafts: readonly ProductEnablementDraft[],
  actorUserId: string | null,
  now = new Date().toISOString(),
): ProductEnablementSaveResult {
  const existing = listProductEnablementVersions(db);
  const validExisting = existing.flatMap((row) => {
    const record = productEnablementVersionRecordFromPersisted(row);
    return record ? [record] : [];
  });
  if (validExisting.length !== existing.length) {
    return {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason:
        "Istoricul persistat al produselor oferite conține rânduri care nu pot fi citite.",
      history: existing,
    };
  }
  const planned = planProductEnablementSave(validExisting, drafts, {
    now,
    actorUserId,
    rowId: `pev:${randomUUID()}`,
  });
  if (!planned.ok) {
    return {
      ok: false,
      error: "invalid_enablement",
      issues: [...planned.issues],
      history: existing,
    };
  }
  if (planned.alreadyApplied) {
    return {
      ok: true,
      alreadyApplied: true,
      resolution: resolveProductEnablement(existing),
      history: existing,
    };
  }
  if (!planned.next) {
    return {
      ok: false,
      error: "invalid_enablement",
      issues: [
        {
          field: "version",
          reason: "Selecția de produse nu a putut fi salvată.",
        },
      ],
      history: existing,
    };
  }

  const write = db.transaction((next: ProductEnablementVersionRecord) => {
    if (planned.retire) {
      db.prepare(
        `
        UPDATE organization_product_enablement_versions
        SET status = 'RETIRED'
        WHERE version = ? AND status = 'ACTIVE'
      `,
      ).run(planned.retire.version);
    }
    db.prepare(
      `
      INSERT INTO organization_product_enablement_versions (
        enablement_version_row_id,
        version,
        status,
        enabled_template_codes_json,
        source,
        effective_from,
        created_at,
        actor_user_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      next.enablementVersionRowId,
      next.version,
      next.status,
      JSON.stringify(next.enabledTemplateCodes),
      next.source,
      next.effectiveFrom,
      next.createdAt,
      next.actorUserId,
      next.supersedesVersion,
    );
  });

  try {
    write(planned.next);
  } catch {
    return {
      ok: false,
      error: "invalid_enablement",
      issues: [
        {
          field: "version",
          reason: "Selecția de produse nu a putut fi salvată.",
        },
      ],
      history: listProductEnablementVersions(db),
    };
  }

  const history = listProductEnablementVersions(db);
  const resolution = resolveProductEnablement(history);
  if (!resolution.ok) {
    return {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason: resolution.reason,
      history,
    };
  }
  return {
    ok: true,
    alreadyApplied: false,
    resolution,
    history,
  };
}

function recordFromRow(row: EnablementRow): PersistedProductEnablementVersion {
  let enabledTemplateCodes: string[] = [];
  try {
    const parsed = JSON.parse(row.enabled_template_codes_json) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      enabledTemplateCodes = parsed;
    }
  } catch {
    enabledTemplateCodes = [];
  }
  return {
    enablementVersionRowId: row.enablement_version_row_id,
    version: row.version,
    status: row.status,
    source: row.source,
    enabledTemplateCodes,
    createdAt: row.created_at,
    effectiveFrom: row.effective_from,
    actorUserId: row.actor_user_id,
    supersedesVersion: row.supersedes_version,
  };
}
