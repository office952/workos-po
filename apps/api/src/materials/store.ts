import { randomUUID } from "node:crypto";
import {
  confirmMaterialReadiness,
  projectJobMaterialRequirements,
  resolveRequestedMaterialQuantity,
  type ExecutionPlanRecord,
  type JobMaterialRequirement,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  readMaterialReadinessContext,
  upsertMaterialConfirmation,
} from "../execution/materialReadinessStore.js";

export type JobMaterialCheck = {
  checkId: string;
  resourceId: string;
  status: "AVAILABLE" | "MISSING";
  checkedByPersonId: string;
  checkedByLabel: string;
  checkedAt: string;
};

export type JobMaterialRequest = {
  requestId: string;
  jobId: string;
  planId: string;
  resourceId: string;
  estimatedQuantity: number;
  requestedQuantity: number;
  unit: string;
  status: "REQUESTED" | "CANCELLED" | "FULFILLED";
  requestedByPersonId: string;
  requestedByLabel: string;
  requestedAt: string;
  /** True when a later availability check leaves this open request needing review. */
  requiresReview: boolean;
};

export type JobMaterialPreparation = {
  jobId: string;
  planId: string | null;
  lines: Array<JobMaterialRequirement & {
    latestCheck: JobMaterialCheck | null;
    openRequest: JobMaterialRequest | null;
    canCheck: boolean;
  }>;
};

export type JobMaterialDecisionInput = {
  organizationId: string;
  jobId: string;
  record: ExecutionPlanRecord;
  resourceId: string;
  status: "AVAILABLE" | "MISSING";
  requestedQuantity?: unknown;
  actionKey: string;
  personId: string;
  personLabel: string;
  now: string;
};

type CheckRow = {
  check_id: string;
  resource_id: string;
  status: "AVAILABLE" | "MISSING";
  checked_by_person_id: string;
  checked_by_label: string;
  checked_at: string;
};
type RequestRow = {
  request_id: string;
  job_id: string;
  plan_id: string;
  resource_id: string;
  estimated_quantity: number;
  requested_quantity: number;
  unit: string;
  status: "REQUESTED" | "CANCELLED" | "FULFILLED";
  requested_by_person_id: string;
  requested_by_label: string;
  requested_at: string;
};

function mappedCheck(row: CheckRow): JobMaterialCheck {
  return {
    checkId: row.check_id, resourceId: row.resource_id, status: row.status,
    checkedByPersonId: row.checked_by_person_id, checkedByLabel: row.checked_by_label,
    checkedAt: row.checked_at,
  };
}

function materialRequestRequiresReview(
  status: JobMaterialRequest["status"],
  latestCheckStatus: JobMaterialCheck["status"] | null,
): boolean {
  switch (status) {
    case "REQUESTED":
      return latestCheckStatus === "AVAILABLE";
    case "CANCELLED":
    case "FULFILLED":
      return false;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function asCheckStatus(value: unknown): JobMaterialCheck["status"] | null {
  if (value === "AVAILABLE" || value === "MISSING") {
    return value;
  }
  return null;
}

function mappedRequest(
  row: RequestRow,
  latestCheckStatus: JobMaterialCheck["status"] | null,
): JobMaterialRequest {
  return {
    requestId: row.request_id, jobId: row.job_id, planId: row.plan_id,
    resourceId: row.resource_id, estimatedQuantity: row.estimated_quantity,
    requestedQuantity: row.requested_quantity, unit: row.unit, status: row.status,
    requestedByPersonId: row.requested_by_person_id,
    requestedByLabel: row.requested_by_label, requestedAt: row.requested_at,
    requiresReview: materialRequestRequiresReview(row.status, latestCheckStatus),
  };
}

export function readJobMaterialPreparation(
  db: SqliteDatabase,
  organizationId: string,
  jobId: string,
  record: ExecutionPlanRecord | null,
): JobMaterialPreparation {
  if (!record) {
    return { jobId, planId: null, lines: [] };
  }
  const checks = db.prepare(
    "SELECT check_id, resource_id, status, checked_by_person_id, checked_by_label, checked_at " +
    "FROM job_material_checks WHERE organization_id = ? AND job_id = ? AND plan_id = ? " +
    "ORDER BY checked_at DESC, rowid DESC",
  ).all(organizationId, jobId, record.plan.planId) as CheckRow[];
  const requests = db.prepare(
    "SELECT request_id, job_id, plan_id, resource_id, estimated_quantity, requested_quantity, " +
    "unit, status, requested_by_person_id, requested_by_label, requested_at " +
    "FROM job_material_requests WHERE organization_id = ? AND job_id = ? AND plan_id = ? AND status = 'REQUESTED'",
  ).all(organizationId, jobId, record.plan.planId) as RequestRow[];
  return {
    jobId,
    planId: record.plan.planId,
    lines: projectJobMaterialRequirements(record).map((line) => {
      const latest = checks.find((item) => item.resource_id === line.resourceId);
      const request = requests.find((item) => item.resource_id === line.resourceId);
      return {
        ...line,
        canCheck: record.tasks.some((task) => task.status === "PLANNED" && line.taskIds.includes(task.taskId)),
        latestCheck: latest ? mappedCheck(latest) : null,
        openRequest: request ? mappedRequest(request, latest ? latest.status : null) : null,
      };
    }),
  };
}

export function listJobMaterialRequests(
  db: SqliteDatabase,
  organizationId: string,
): JobMaterialRequest[] {
  const rows = db.prepare(
    "SELECT request_id, job_id, plan_id, resource_id, estimated_quantity, requested_quantity, " +
    "unit, status, requested_by_person_id, requested_by_label, requested_at, " +
    "(SELECT status FROM job_material_checks AS latest " +
    "WHERE latest.organization_id = job_material_requests.organization_id " +
    "AND latest.job_id = job_material_requests.job_id " +
    "AND latest.plan_id = job_material_requests.plan_id " +
    "AND latest.resource_id = job_material_requests.resource_id " +
    "ORDER BY latest.checked_at DESC, latest.rowid DESC LIMIT 1) AS latest_check_status " +
    "FROM job_material_requests WHERE organization_id = ? ORDER BY requested_at DESC",
  ).all(organizationId) as Array<RequestRow & { latest_check_status: unknown }>;
  return rows.map((row) => mappedRequest(row, asCheckStatus(row.latest_check_status)));
}

export function recordJobMaterialDecision(
  db: SqliteDatabase,
  input: JobMaterialDecisionInput,
):
  | { ok: true; alreadyApplied: boolean; preparation: JobMaterialPreparation }
  | { ok: false; error:
      "unknown_material" | "invalid_quantity" | "below_estimated_requirement" |
      "already_requested" | "material_no_longer_planned" | "idempotency_conflict" } {
  const required = projectJobMaterialRequirements(input.record)
    .find((line) => line.resourceId === input.resourceId);
  if (!required) {
    return { ok: false, error: "unknown_material" };
  }
  if (!input.record.tasks.some(
    (task) => task.status === "PLANNED" && required.taskIds.includes(task.taskId),
  )) {
    return { ok: false, error: "material_no_longer_planned" };
  }
  const quantity = input.status === "MISSING"
    ? resolveRequestedMaterialQuantity(
        required.estimatedQuantity, required.unit, input.requestedQuantity,
      )
    : null;
  if (quantity && !quantity.ok) {
    return { ok: false, error: quantity.error };
  }

  const transaction = db.transaction(() => {
    const existingAction = db.prepare(
      "SELECT check_id, job_id, plan_id, resource_id, status, checked_by_person_id " +
      "FROM job_material_checks WHERE action_key = ? AND organization_id = ?",
    ).get(input.actionKey, input.organizationId) as {
      check_id: string; job_id: string; plan_id: string;
      resource_id: string; status: string; checked_by_person_id: string;
    } | undefined;
    if (existingAction) {
      const consistent = existingAction.job_id === input.jobId &&
        existingAction.plan_id === input.record.plan.planId &&
        existingAction.resource_id === required.resourceId &&
        existingAction.status === input.status &&
        existingAction.checked_by_person_id === input.personId;
      const savedRequest = input.status === "MISSING" ? db.prepare(
        "SELECT requested_quantity FROM job_material_requests WHERE source_check_id = ?",
      ).get(existingAction.check_id) as { requested_quantity: number } | undefined : null;
      if (!consistent || (
        input.status === "MISSING" &&
        (!quantity?.ok || savedRequest?.requested_quantity !== quantity.quantity)
      )) {
        return { ok: false as const, error: "idempotency_conflict" as const };
      }
      return { ok: true as const, alreadyApplied: true };
    }
    const existingRequest = db.prepare(
      "SELECT request_id FROM job_material_requests WHERE organization_id = ? AND job_id = ? " +
      "AND plan_id = ? AND resource_id = ? AND status = 'REQUESTED'",
    ).get(input.organizationId, input.jobId, input.record.plan.planId, required.resourceId) as
      { request_id: string } | undefined;
    if (input.status === "MISSING" && existingRequest) {
      return { ok: false as const, error: "already_requested" as const };
    }
    const checkId = "mcheck:" + randomUUID();
    db.prepare(
      "INSERT INTO job_material_checks " +
      "(check_id, action_key, organization_id, job_id, plan_id, resource_id, status, " +
      "checked_by_person_id, checked_by_label, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(checkId, input.actionKey, input.organizationId, input.jobId,
      input.record.plan.planId, required.resourceId, input.status,
      input.personId, input.personLabel, input.now);

    if (input.status === "MISSING" && quantity?.ok) {
      db.prepare(
        "INSERT INTO job_material_requests " +
        "(request_id, organization_id, job_id, plan_id, resource_id, estimated_quantity, " +
        "requested_quantity, unit, status, source_check_id, requested_by_person_id, requested_by_label, requested_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?)",
      ).run("mreq:" + randomUUID(), input.organizationId, input.jobId, input.record.plan.planId,
        required.resourceId, required.estimatedQuantity, quantity.quantity, required.unit,
        checkId, input.personId, input.personLabel, input.now);
    }

    // Material readiness continues to be owned by the execution engine. Do not
    // alter frozen operations, completed tasks, inventory balances or provider assignment.
    const confirmations = readMaterialReadinessContext(db).confirmations;
    for (const task of input.record.tasks) {
      if (task.status !== "PLANNED" || !required.taskIds.includes(task.taskId)) {
        continue;
      }
      const confirmed = confirmMaterialReadiness({
        task, resourceId: required.resourceId,
        status: input.status === "AVAILABLE" ? "AVAILABLE" : "NOT_AVAILABLE",
        confirmedBy: input.personId, confirmedAt: input.now, existing: confirmations,
      });
      if (!confirmed.ok) {
        throw new Error("job_material_confirmation_invariant");
      }
      if (!confirmed.unchanged) {
        upsertMaterialConfirmation(db, confirmed.confirmation);
      }
    }
    return { ok: true as const, alreadyApplied: false };
  });

  const result = transaction();
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    preparation: readJobMaterialPreparation(
      db, input.organizationId, input.jobId, input.record,
    ),
  };
}
