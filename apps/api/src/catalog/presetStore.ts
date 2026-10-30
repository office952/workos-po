import { randomUUID } from "node:crypto";
import {
  planOrganizationPresetRevision,
  type OrganizationPresetLifecycle,
  type OrganizationPresetRevision,
  type OrganizationPresetSelection,
  type PresetIssue,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PresetRow = {
  preset_revision_row_id: string;
  organization_id: string;
  preset_id: string;
  template_code: string;
  template_version: string;
  revision: number;
  lifecycle: string;
  name: string;
  description: string;
  selections_json: string;
  supersedes_revision: number | null;
  created_at: string;
  actor_user_id: string | null;
};

export type StoredOrganizationPreset = OrganizationPresetRevision & {
  readonly presetRevisionRowId: string;
  readonly createdAt: string;
  readonly actorUserId: string | null;
};

export type OrganizationPresetSaveInput = {
  readonly actorRole: "owner" | "member";
  readonly actorUserId: string | null;
  readonly presetId: string | null;
  readonly expectedRevision: number | null;
  readonly name: string;
  readonly description: string;
  readonly templateCode: string;
  readonly selections: readonly OrganizationPresetSelection[];
  readonly lifecycle: OrganizationPresetLifecycle;
};

export type OrganizationPresetSaveResult =
  | { readonly ok: true; readonly preset: StoredOrganizationPreset; readonly history: readonly StoredOrganizationPreset[] }
  | { readonly ok: false; readonly status: 400 | 403 | 409; readonly error: string; readonly issues: readonly PresetIssue[] };

const SELECT_COLUMNS = `
  preset_revision_row_id,
  organization_id,
  preset_id,
  template_code,
  template_version,
  revision,
  lifecycle,
  name,
  description,
  selections_json,
  supersedes_revision,
  created_at,
  actor_user_id
`;

function isLifecycle(value: string): value is OrganizationPresetLifecycle {
  return value === "DRAFT" || value === "PUBLISHED" || value === "RETIRED";
}

function fromRow(row: PresetRow): StoredOrganizationPreset | null {
  if (!isLifecycle(row.lifecycle)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.selections_json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const selections: OrganizationPresetSelection[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const fieldId = (item as { fieldId?: unknown }).fieldId;
    const value = (item as { value?: unknown }).value;
    if (typeof fieldId !== "string" || typeof value !== "string") return null;
    selections.push({ fieldId, value });
  }
  return {
    schemaVersion: "organization-preset.v1",
    presetRevisionRowId: row.preset_revision_row_id,
    presetId: row.preset_id,
    organizationId: row.organization_id,
    templateCode: row.template_code,
    templateVersion: row.template_version,
    revision: row.revision,
    name: row.name,
    description: row.description,
    lifecycle: row.lifecycle,
    selections,
    supersedesRevision: row.supersedes_revision,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
  };
}

export function listOrganizationPresetRevisions(
  db: SqliteDatabase,
  organizationId: string,
  templateCode: string | null,
): StoredOrganizationPreset[] {
  const rows = (templateCode
    ? db.prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM organization_product_preset_revisions
       WHERE organization_id = ? AND template_code = ?
       ORDER BY preset_id ASC, revision ASC`,
    ).all(organizationId, templateCode)
    : db.prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM organization_product_preset_revisions
       WHERE organization_id = ?
       ORDER BY preset_id ASC, revision ASC`,
    ).all(organizationId)) as PresetRow[];
  return rows.flatMap((row) => {
    const parsed = fromRow(row);
    return parsed ? [parsed] : [];
  });
}

export function currentOrganizationPresets(
  revisions: readonly StoredOrganizationPreset[],
  actorRole: "owner" | "member",
): StoredOrganizationPreset[] {
  const latest = new Map<string, StoredOrganizationPreset>();
  for (const revision of revisions) {
    const current = latest.get(revision.presetId);
    if (!current || revision.revision > current.revision) latest.set(revision.presetId, revision);
  }
  return [...latest.values()].filter((preset) => actorRole === "owner" || preset.lifecycle !== "DRAFT");
}

export function visiblePresetHistory(
  revisions: readonly StoredOrganizationPreset[],
  presetId: string,
  actorRole: "owner" | "member",
): StoredOrganizationPreset[] {
  return revisions.filter((revision) => revision.presetId === presetId && (actorRole === "owner" || revision.lifecycle !== "DRAFT"));
}

function conflictStatus(issues: readonly PresetIssue[]): 400 | 403 | 409 {
  if (issues.some((issue) => issue.code === "member_cannot_change")) return 403;
  if (issues.some((issue) => (
    issue.code === "revision_conflict" ||
    issue.code === "organization_mismatch" ||
    issue.code === "template_version_mismatch" ||
    issue.code === "retired_is_closed" ||
    issue.code === "retired_selections_frozen"
  ))) {
    return 409;
  }
  return 400;
}

export function persistOrganizationPreset(
  db: SqliteDatabase,
  organizationId: string,
  input: OrganizationPresetSaveInput,
  now = new Date().toISOString(),
): OrganizationPresetSaveResult {
  const presetId = input.presetId ?? `pst.${randomUUID()}`;
  const history = listOrganizationPresetRevisions(db, organizationId, null)
    .filter((revision) => revision.presetId === presetId);
  const existing = history.length > 0 ? history[history.length - 1] ?? null : null;
  const planned = planOrganizationPresetRevision({
    actorRole: input.actorRole,
    organizationId,
    presetId,
    expectedRevision: input.expectedRevision,
    existing,
    name: input.name,
    description: input.description,
    templateCode: input.templateCode,
    selections: input.selections,
    lifecycle: input.lifecycle,
  });
  if (!planned.ok) {
    return { ok: false, status: conflictStatus(planned.issues), error: planned.issues[0]?.code ?? "invalid_preset", issues: planned.issues };
  }
  const rowId = `prv.${randomUUID()}`;
  try {
    db.prepare(
      `INSERT INTO organization_product_preset_revisions (
        preset_revision_row_id, organization_id, preset_id, template_code, template_version,
        revision, lifecycle, name, description, selections_json, supersedes_revision, created_at, actor_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      rowId,
      planned.revision.organizationId,
      planned.revision.presetId,
      planned.revision.templateCode,
      planned.revision.templateVersion,
      planned.revision.revision,
      planned.revision.lifecycle,
      planned.revision.name,
      planned.revision.description,
      JSON.stringify(planned.revision.selections),
      planned.revision.supersedesRevision,
      now,
      input.actorUserId,
    );
  } catch {
    return {
      ok: false,
      status: 409,
      error: "revision_conflict",
      issues: [{ code: "revision_conflict", fieldId: null, message: "Revizia variantei s-a schimbat între timp." }],
    };
  }
  const stored = listOrganizationPresetRevisions(db, organizationId, null).filter((revision) => revision.presetId === presetId);
  const preset = stored[stored.length - 1];
  if (!preset) {
    return {
      ok: false,
      status: 400,
      error: "invalid_preset",
      issues: [{ code: "invalid_preset_id", fieldId: null, message: "Varianta nu a putut fi citită după salvare." }],
    };
  }
  return { ok: true, preset, history: stored };
}
