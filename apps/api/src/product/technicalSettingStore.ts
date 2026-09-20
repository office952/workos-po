import { randomUUID } from "node:crypto";
import {
  createPlatformStarterTechnicalSettingVersions,
  isTechnicalSettingVersionRecord,
  planTechnicalSettingsSave,
  resolveOrganizationTechnicalSettings,
  type TechnicalSettingActor,
  type TechnicalSettingDraftValue,
  type TechnicalSettingIssue,
  type TechnicalSettingResolution,
  type TechnicalSettingVersionRecord,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import type { BootstrapPolicy } from "../cloud/controlPlane.js";

export const TECHNICAL_SETTING_STARTERS_MARKER = "TECHNICAL_SETTING_STARTERS_V1_APPLIED";

type TechnicalSettingRow = {
  technical_setting_version_row_id: string;
  definition_id: string;
  type_id: string;
  setting_id: string;
  version: number;
  status: string;
  value: number;
  value_type: string;
  unit: string;
  scope: string;
  source: string;
  effective_from: string;
  created_at: string;
  actor_kind: string;
  actor_user_id: string | null;
  actor_system_id: string | null;
  supersedes_version: number | null;
};

export type TechnicalSettingSaveResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      resolution: Extract<TechnicalSettingResolution, { ok: true }>;
      history: TechnicalSettingVersionRecord[];
    }
  | {
      ok: false;
      error: "invalid_settings" | "inactive_technical_settings";
      issues?: TechnicalSettingIssue[];
      reason?: string;
      history: TechnicalSettingVersionRecord[];
    };

export function isTechnicalSettingStartersApplied(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
    .get(TECHNICAL_SETTING_STARTERS_MARKER) as { marker_id: string } | undefined;
  return Boolean(row);
}

export function listTechnicalSettingVersions(
  db: SqliteDatabase,
): TechnicalSettingVersionRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        technical_setting_version_row_id,
        definition_id,
        type_id,
        setting_id,
        version,
        status,
        value,
        value_type,
        unit,
        scope,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      FROM technical_setting_versions
      ORDER BY definition_id ASC, version ASC
    `,
    )
    .all() as TechnicalSettingRow[];
  return rows.map(recordFromRow).filter(isTechnicalSettingVersionRecord);
}

export function resolveStoredTechnicalSettings(
  db: SqliteDatabase,
): TechnicalSettingResolution {
  return resolveOrganizationTechnicalSettings(listTechnicalSettingVersions(db));
}

export function ensureTechnicalSettingStarters(
  db: SqliteDatabase,
  policy: BootstrapPolicy | "SINGLE_PLANE" = "SINGLE_PLANE",
): void {
  if (policy === "ADOPT_EXISTING") {
    return;
  }
  if (isTechnicalSettingStartersApplied(db)) {
    return;
  }
  const apply = db.transaction(() => {
    if (isTechnicalSettingStartersApplied(db)) {
      return;
    }
    const now = new Date().toISOString();
    const starters = createPlatformStarterTechnicalSettingVersions({
      now,
      rowIdFor: (definitionId) => `tsv:${definitionId}:${randomUUID()}`,
    });
    const insert = db.prepare(
      `
      INSERT INTO technical_setting_versions (
        technical_setting_version_row_id,
        definition_id,
        type_id,
        setting_id,
        version,
        status,
        value,
        value_type,
        unit,
        scope,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const row of starters) {
      insert.run(
        row.technicalSettingVersionRowId,
        row.definitionId,
        row.typeId,
        row.settingId,
        row.version,
        row.status,
        row.value,
        row.valueType,
        row.unit,
        row.scope,
        row.source,
        row.effectiveFrom,
        row.createdAt,
        row.actorKind,
        row.actorUserId,
        row.actorSystemId,
        row.supersedesVersion,
      );
    }
    const stored = listTechnicalSettingVersions(db);
    const resolution = resolveOrganizationTechnicalSettings(stored);
    if (!resolution.ok || resolution.settings.length !== 3) {
      throw new Error("technical_setting_starters_incomplete");
    }
    db.prepare(
      `
      INSERT INTO runtime_bootstrap_markers (marker_id, applied_at)
      VALUES (?, ?)
    `,
    ).run(TECHNICAL_SETTING_STARTERS_MARKER, now);
  });
  apply();
}

export function persistTechnicalSettingSave(
  db: SqliteDatabase,
  drafts: readonly TechnicalSettingDraftValue[],
  actor: TechnicalSettingActor,
  now = new Date().toISOString(),
): TechnicalSettingSaveResult {
  const existing = listTechnicalSettingVersions(db);
  const planned = planTechnicalSettingsSave(existing, drafts, actor, {
    now,
    rowIdFor: (definitionId) => `tsv:${definitionId}:${randomUUID()}`,
  });
  if (!planned.ok) {
    return {
      ok: false,
      error: "invalid_settings",
      issues: [...planned.issues],
      history: existing,
    };
  }
  if (planned.alreadyApplied) {
    const resolution = resolveOrganizationTechnicalSettings(existing);
    if (!resolution.ok) {
      return {
        ok: false,
        error: "inactive_technical_settings",
        reason: resolution.reason,
        history: existing,
      };
    }
    return {
      ok: true,
      alreadyApplied: true,
      resolution,
      history: existing,
    };
  }

  const write = db.transaction(() => {
    for (const item of planned.retire) {
      db.prepare(
        `
        UPDATE technical_setting_versions
        SET status = 'RETIRED'
        WHERE definition_id = ? AND version = ? AND status = 'ACTIVE'
      `,
      ).run(item.definitionId, item.version);
    }
    const insert = db.prepare(
      `
      INSERT INTO technical_setting_versions (
        technical_setting_version_row_id,
        definition_id,
        type_id,
        setting_id,
        version,
        status,
        value,
        value_type,
        unit,
        scope,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const next of planned.next) {
      insert.run(
        next.technicalSettingVersionRowId,
        next.definitionId,
        next.typeId,
        next.settingId,
        next.version,
        next.status,
        next.value,
        next.valueType,
        next.unit,
        next.scope,
        next.source,
        next.effectiveFrom,
        next.createdAt,
        next.actorKind,
        next.actorUserId,
        next.actorSystemId,
        next.supersedesVersion,
      );
    }
  });

  try {
    write();
  } catch {
    return {
      ok: false,
      error: "invalid_settings",
      issues: [
        {
          field: "version",
          reason: "Versiunea setării tehnice nu a putut fi salvată.",
        },
      ],
      history: listTechnicalSettingVersions(db),
    };
  }

  const history = listTechnicalSettingVersions(db);
  const resolution = resolveOrganizationTechnicalSettings(history);
  if (!resolution.ok) {
    return {
      ok: false,
      error: "inactive_technical_settings",
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

function recordFromRow(row: TechnicalSettingRow): TechnicalSettingVersionRecord {
  return {
    technicalSettingVersionRowId: row.technical_setting_version_row_id,
    definitionId: row.definition_id,
    typeId: row.type_id as TechnicalSettingVersionRecord["typeId"],
    settingId: row.setting_id,
    version: row.version,
    status: row.status as TechnicalSettingVersionRecord["status"],
    value: row.value,
    valueType: "number",
    unit: row.unit as TechnicalSettingVersionRecord["unit"],
    scope: "ORGANIZATION",
    source: row.source as TechnicalSettingVersionRecord["source"],
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    actorKind: row.actor_kind as TechnicalSettingVersionRecord["actorKind"],
    actorUserId: row.actor_user_id,
    actorSystemId: row.actor_system_id,
    supersedesVersion: row.supersedes_version,
  };
}
