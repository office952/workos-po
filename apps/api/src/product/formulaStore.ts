import { randomUUID } from "node:crypto";
import {
  createPlatformStarterFormulaVersions,
  formulaVersionRecordFromPersisted,
  planFormulaSave,
  resolveOrganizationFormulas,
  type FormulaActor,
  type FormulaDraftExpression,
  type FormulaIssue,
  type FormulaResolution,
  type PersistedFormulaVersion,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import type { BootstrapPolicy } from "../cloud/controlPlane.js";

export const FORMULA_STARTERS_MARKER = "FORMULA_STARTERS_V1_APPLIED";

type FormulaRow = {
  formula_version_row_id: string;
  formula_id: string;
  component_type_id: string;
  result_id: string;
  version: number;
  status: string;
  expression_json: string;
  source: string;
  effective_from: string;
  created_at: string;
  actor_kind: string;
  actor_user_id: string | null;
  actor_system_id: string | null;
  supersedes_version: number | null;
};

export type FormulaSaveResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      resolution: Extract<FormulaResolution, { ok: true }>;
      history: PersistedFormulaVersion[];
    }
  | {
      ok: false;
      error: "invalid_formulas" | "inactive_formulas";
      issues?: FormulaIssue[];
      reason?: string;
      history: PersistedFormulaVersion[];
    };

export function isFormulaStartersApplied(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
    .get(FORMULA_STARTERS_MARKER) as { marker_id: string } | undefined;
  return Boolean(row);
}

export function listFormulaVersions(db: SqliteDatabase): PersistedFormulaVersion[] {
  const rows = db
    .prepare(
      `
      SELECT
        formula_version_row_id,
        formula_id,
        component_type_id,
        result_id,
        version,
        status,
        expression_json,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      FROM formula_versions
      ORDER BY formula_id ASC, version ASC
    `,
    )
    .all() as FormulaRow[];
  return rows.map(recordFromRow);
}

export function resolveStoredFormulas(db: SqliteDatabase): FormulaResolution {
  return resolveOrganizationFormulas(listFormulaVersions(db));
}

export function ensureFormulaStarters(
  db: SqliteDatabase,
  policy: BootstrapPolicy | "SINGLE_PLANE" = "SINGLE_PLANE",
): void {
  if (policy === "ADOPT_EXISTING") {
    return;
  }
  if (isFormulaStartersApplied(db)) {
    return;
  }
  const apply = db.transaction(() => {
    if (isFormulaStartersApplied(db)) {
      return;
    }
    const now = new Date().toISOString();
    const starters = createPlatformStarterFormulaVersions({
      now,
      rowIdFor: (formulaId) => `fv:${formulaId}:${randomUUID()}`,
    });
    const insert = db.prepare(
      `
      INSERT INTO formula_versions (
        formula_version_row_id,
        formula_id,
        component_type_id,
        result_id,
        version,
        status,
        expression_json,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const row of starters) {
      insert.run(
        row.formulaVersionRowId,
        row.formulaId,
        row.componentTypeId,
        row.resultId,
        row.version,
        row.status,
        row.expressionJson,
        row.source,
        row.effectiveFrom,
        row.createdAt,
        row.actorKind,
        row.actorUserId,
        row.actorSystemId,
        row.supersedesVersion,
      );
    }
    const stored = listFormulaVersions(db);
    const resolution = resolveOrganizationFormulas(stored);
    if (!resolution.ok || resolution.formulas.length !== 3) {
      throw new Error("formula_starters_incomplete");
    }
    db.prepare(
      `
      INSERT INTO runtime_bootstrap_markers (marker_id, applied_at)
      VALUES (?, ?)
    `,
    ).run(FORMULA_STARTERS_MARKER, now);
  });
  apply();
}

export function persistFormulaSave(
  db: SqliteDatabase,
  drafts: readonly FormulaDraftExpression[],
  actor: FormulaActor,
  now = new Date().toISOString(),
): FormulaSaveResult {
  const existing = listFormulaVersions(db);
  const current = resolveOrganizationFormulas(existing);
  if (!current.ok) {
    return {
      ok: false,
      error: "inactive_formulas",
      reason: current.reason,
      history: existing,
    };
  }
  const validExisting = existing.flatMap((row) => {
    const record = formulaVersionRecordFromPersisted(row);
    return record ? [record] : [];
  });
  if (validExisting.length !== existing.length) {
    return {
      ok: false,
      error: "inactive_formulas",
      reason: "Istoricul persistat al formulelor conține rânduri care nu pot fi citite.",
      history: existing,
    };
  }
  const planned = planFormulaSave(validExisting, drafts, actor, {
    now,
    rowIdFor: (formulaId) => `fv:${formulaId}:${randomUUID()}`,
  });
  if (!planned.ok) {
    return {
      ok: false,
      error: "invalid_formulas",
      issues: [...planned.issues],
      history: existing,
    };
  }
  if (planned.alreadyApplied) {
    const resolution = resolveOrganizationFormulas(existing);
    if (!resolution.ok) {
      return {
        ok: false,
        error: "inactive_formulas",
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
        UPDATE formula_versions
        SET status = 'RETIRED'
        WHERE formula_id = ? AND version = ? AND status = 'ACTIVE'
      `,
      ).run(item.formulaId, item.version);
    }
    const insert = db.prepare(
      `
      INSERT INTO formula_versions (
        formula_version_row_id,
        formula_id,
        component_type_id,
        result_id,
        version,
        status,
        expression_json,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const next of planned.next) {
      insert.run(
        next.formulaVersionRowId,
        next.formulaId,
        next.componentTypeId,
        next.resultId,
        next.version,
        next.status,
        next.expressionJson,
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
      error: "invalid_formulas",
      issues: [
        {
          field: "version",
          reason: "Versiunea formulei nu a putut fi salvată.",
        },
      ],
      history: listFormulaVersions(db),
    };
  }

  const history = listFormulaVersions(db);
  const resolution = resolveOrganizationFormulas(history);
  if (!resolution.ok) {
    return {
      ok: false,
      error: "inactive_formulas",
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

function recordFromRow(row: FormulaRow): PersistedFormulaVersion {
  return {
    formulaVersionRowId: row.formula_version_row_id,
    formulaId: row.formula_id,
    componentTypeId: row.component_type_id,
    resultId: row.result_id,
    version: row.version,
    status: row.status,
    expressionJson: row.expression_json,
    source: row.source,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    actorSystemId: row.actor_system_id,
    supersedesVersion: row.supersedes_version,
  };
}
