import {
  isFinalInspectionMode,
  isFinalPackagingMode,
  type AssemblyOperationCostPolicyVersion,
  type FinalInspectionMode,
  type FinalPackagingMode,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PolicyRow = {
  version: number;
  final_inspection_mode: string;
  final_packaging_mode: string;
  updated_at: string;
  updated_by: string;
};

export type AssemblyOperationCostPolicySaveResult =
  | { ok: true; alreadyApplied: boolean; policy: AssemblyOperationCostPolicyVersion }
  | { ok: false; error: "stale_policy_version"; current: AssemblyOperationCostPolicyVersion | null };

/** Append-only history of the organization plane, oldest first. */
export function listAssemblyOperationCostPolicyVersions(
  db: SqliteDatabase,
): AssemblyOperationCostPolicyVersion[] {
  const rows = db
    .prepare(
      `
      SELECT version, final_inspection_mode, final_packaging_mode, updated_at, updated_by
      FROM assembly_operation_cost_policy_versions
      ORDER BY version ASC
    `,
    )
    .all() as PolicyRow[];
  return rows.flatMap((row) => {
    const policy = policyFromRow(row);
    return policy ? [policy] : [];
  });
}

/** The latest version is the current policy; `null` means the organization never configured one. */
export function readCurrentAssemblyOperationCostPolicy(
  db: SqliteDatabase,
): AssemblyOperationCostPolicyVersion | null {
  const row = db
    .prepare(
      `
      SELECT version, final_inspection_mode, final_packaging_mode, updated_at, updated_by
      FROM assembly_operation_cost_policy_versions
      ORDER BY version DESC
      LIMIT 1
    `,
    )
    .get() as PolicyRow | undefined;
  return row ? policyFromRow(row) : null;
}

/**
 * Appends version `expectedVersion + 1`. A writer that read an older version is refused, so two
 * administrators cannot silently overwrite each other. Saving the current modes again is a no-op.
 */
export function saveAssemblyOperationCostPolicy(
  db: SqliteDatabase,
  input: {
    expectedVersion: number | null;
    finalInspectionMode: FinalInspectionMode;
    finalPackagingMode: FinalPackagingMode;
    updatedBy: string;
    now?: string;
  },
): AssemblyOperationCostPolicySaveResult {
  const write = db.transaction((): AssemblyOperationCostPolicySaveResult => {
    const current = readCurrentAssemblyOperationCostPolicy(db);
    if ((current?.version ?? null) !== input.expectedVersion) {
      return { ok: false, error: "stale_policy_version", current };
    }
    if (
      current &&
      current.finalInspectionMode === input.finalInspectionMode &&
      current.finalPackagingMode === input.finalPackagingMode
    ) {
      return { ok: true, alreadyApplied: true, policy: current };
    }
    const policy: AssemblyOperationCostPolicyVersion = {
      version: (current?.version ?? 0) + 1,
      finalInspectionMode: input.finalInspectionMode,
      finalPackagingMode: input.finalPackagingMode,
      updatedAt: input.now ?? new Date().toISOString(),
      updatedBy: input.updatedBy,
    };
    db.prepare(
      `
      INSERT INTO assembly_operation_cost_policy_versions (
        version, final_inspection_mode, final_packaging_mode, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      policy.version,
      policy.finalInspectionMode,
      policy.finalPackagingMode,
      policy.updatedAt,
      policy.updatedBy,
    );
    return { ok: true, alreadyApplied: false, policy };
  });
  return write.immediate();
}

function policyFromRow(row: PolicyRow): AssemblyOperationCostPolicyVersion | null {
  if (!isFinalInspectionMode(row.final_inspection_mode) || !isFinalPackagingMode(row.final_packaging_mode)) {
    return null;
  }
  return {
    version: row.version,
    finalInspectionMode: row.final_inspection_mode,
    finalPackagingMode: row.final_packaging_mode,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
