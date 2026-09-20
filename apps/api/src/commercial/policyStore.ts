import { randomUUID } from "node:crypto";
import {
  isCommercialPolicyVersionRecord,
  planCommercialPolicySave,
  resolveCommercialPolicy,
  type CommercialPolicyDraftValues,
  type CommercialPolicyIssue,
  type CommercialPolicyResolution,
  type CommercialPolicyVersionRecord,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PolicyRow = {
  policy_version_row_id: string;
  policy_id: string;
  version: number;
  status: string;
  label: string;
  markup_percent: number;
  vat_percent: number;
  default_discount_percent: number;
  default_adjustment: number;
  currency: string;
  rounding: number;
  source: string;
  effective_from: string;
  created_at: string;
  supersedes_version: number | null;
};

export type CommercialPolicySaveResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      resolution: Extract<CommercialPolicyResolution, { ok: true }>;
      history: CommercialPolicyVersionRecord[];
    }
  | {
      ok: false;
      error: "invalid_policy" | "inactive_organization_policy";
      issues?: CommercialPolicyIssue[];
      reason?: string;
      history: CommercialPolicyVersionRecord[];
    };

export function listCommercialPolicyVersions(
  db: SqliteDatabase,
): CommercialPolicyVersionRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        policy_version_row_id,
        policy_id,
        version,
        status,
        label,
        markup_percent,
        vat_percent,
        default_discount_percent,
        default_adjustment,
        currency,
        rounding,
        source,
        effective_from,
        created_at,
        supersedes_version
      FROM commercial_policy_versions
      ORDER BY version ASC
    `,
    )
    .all() as PolicyRow[];
  return rows.map(recordFromRow).filter(isCommercialPolicyVersionRecord);
}

export function resolveStoredCommercialPolicy(
  db: SqliteDatabase,
): CommercialPolicyResolution {
  return resolveCommercialPolicy(listCommercialPolicyVersions(db));
}

export function persistCommercialPolicySave(
  db: SqliteDatabase,
  values: CommercialPolicyDraftValues,
  now = new Date().toISOString(),
): CommercialPolicySaveResult {
  const existing = listCommercialPolicyVersions(db);
  const planned = planCommercialPolicySave(existing, values, {
    rowId: `cpv:${randomUUID()}`,
    now,
  });
  if (!planned.ok) {
    return {
      ok: false,
      error: "invalid_policy",
      issues: planned.issues,
      history: existing,
    };
  }
  if (planned.alreadyApplied || !planned.next) {
    const resolution = resolveCommercialPolicy(existing);
    if (!resolution.ok) {
      return {
        ok: false,
        error: "inactive_organization_policy",
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

  const next = planned.next;
  const retireVersion = planned.retireVersion;
  const write = db.transaction(() => {
    if (retireVersion !== null) {
      db.prepare(
        `
        UPDATE commercial_policy_versions
        SET status = 'RETIRED'
        WHERE policy_id = ? AND version = ? AND status = 'ACTIVE'
      `,
      ).run(next.policyId, retireVersion);
    }
    db.prepare(
      `
      INSERT INTO commercial_policy_versions (
        policy_version_row_id,
        policy_id,
        version,
        status,
        label,
        markup_percent,
        vat_percent,
        default_discount_percent,
        default_adjustment,
        currency,
        rounding,
        source,
        effective_from,
        created_at,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      next.policyVersionRowId,
      next.policyId,
      next.version,
      next.status,
      next.label,
      next.markupPercent,
      next.vatPercent,
      next.defaultDiscountPercent,
      next.defaultAdjustment,
      next.currency,
      next.rounding,
      next.source,
      next.effectiveFrom,
      next.createdAt,
      next.supersedesVersion,
    );
  });

  try {
    write();
  } catch {
    return {
      ok: false,
      error: "invalid_policy",
      issues: [
        {
          field: "version",
          reason: "Versiunea politicii comerciale nu a putut fi salvată.",
        },
      ],
      history: listCommercialPolicyVersions(db),
    };
  }

  const history = listCommercialPolicyVersions(db);
  const resolution = resolveCommercialPolicy(history);
  if (!resolution.ok) {
    return {
      ok: false,
      error: "inactive_organization_policy",
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

function recordFromRow(row: PolicyRow): CommercialPolicyVersionRecord {
  return {
    policyVersionRowId: row.policy_version_row_id,
    policyId: row.policy_id,
    version: row.version,
    status: row.status as CommercialPolicyVersionRecord["status"],
    label: row.label,
    markupPercent: row.markup_percent,
    vatPercent: row.vat_percent,
    defaultDiscountPercent: row.default_discount_percent,
    defaultAdjustment: row.default_adjustment,
    currency: "EUR",
    rounding: 0.01,
    source: "ORGANIZATION",
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    supersedesVersion: row.supersedes_version,
  };
}
