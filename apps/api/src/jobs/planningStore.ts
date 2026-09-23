import {
  parseOperationalPriority,
  parseTargetDate,
  type JobKind,
  type JobPlanningMetadata,
  type OperationalPriority,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PlanningRow = {
  organization_id: string;
  job_id: string;
  job_kind: string;
  priority: string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

export function readJobPlanningMetadata(
  db: SqliteDatabase,
  organizationId: string,
  jobId: string,
  jobKind: JobKind,
): JobPlanningMetadata | null {
  const row = db
    .prepare(
      `
      SELECT organization_id, job_id, job_kind, priority, target_date, created_at, updated_at
      FROM job_planning_metadata
      WHERE organization_id = ? AND job_id = ? AND job_kind = ?
    `,
    )
    .get(organizationId, jobId, jobKind) as PlanningRow | undefined;
  return row ? rowToMetadata(row) : null;
}

export function writeJobPlanningMetadata(
  db: SqliteDatabase,
  metadata: JobPlanningMetadata,
): JobPlanningMetadata {
  const priority = parseOperationalPriority(metadata.priority);
  const targetDate = parseTargetDate(metadata.targetDate);
  if (!priority.ok || !targetDate.ok) {
    throw new Error("invalid_job_planning_metadata");
  }
  if (metadata.jobKind !== "PRODUCT" && metadata.jobKind !== "ASSEMBLY") {
    throw new Error("invalid_job_planning_metadata");
  }
  db.prepare(
    `
    INSERT INTO job_planning_metadata (
      organization_id, job_id, job_kind, priority, target_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, job_id, job_kind) DO UPDATE SET
      priority = excluded.priority,
      target_date = excluded.target_date,
      updated_at = excluded.updated_at
  `,
  ).run(
    metadata.organizationId,
    metadata.jobId,
    metadata.jobKind,
    priority.priority,
    targetDate.targetDate,
    metadata.createdAt,
    metadata.updatedAt,
  );
  return {
    ...metadata,
    priority: priority.priority,
    targetDate: targetDate.targetDate,
  };
}

function rowToMetadata(row: PlanningRow): JobPlanningMetadata | null {
  const priority = parseOperationalPriority(row.priority);
  const targetDate = parseTargetDate(row.target_date);
  if (!priority.ok || !targetDate.ok) {
    return null;
  }
  if (row.job_kind !== "PRODUCT" && row.job_kind !== "ASSEMBLY") {
    return null;
  }
  return {
    organizationId: row.organization_id,
    jobId: row.job_id,
    jobKind: row.job_kind,
    priority: priority.priority satisfies OperationalPriority,
    targetDate: targetDate.targetDate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
