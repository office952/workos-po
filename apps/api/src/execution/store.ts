import {
  assignExecutorToTask,
  assignProviderToTask,
  assignedExecutorFromRow,
  assignedProviderFromRow,
  claimAndStartExecutionTask,
  completeExecutionTask,
  completionFromRow,
  startExecutionTask,
  type ActualConsumptionEntry,
  type ExecutionPlan,
  type ExecutionPlanRecord,
  type ExecutionTask,
  type PeopleEligibilityContext,
  type Person,
  type TaskCompletionInput,
  type TaskMutationResult,
  workcenterRegistry,
  type WorkcenterRegistry,
} from "@workos-final/domain";
import { writeInventoryOutFromTask } from "../inventory/store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PlanRow = {
  plan_id: string;
  source_snapshot_id: string;
  source_snapshot_hash: string;
  product_code: string;
  product_label: string;
  inscription: string;
  created_at: string;
  status: ExecutionPlan["status"];
  schema_version: number;
  task_count: number;
  eic_total: number;
  eic_currency: "EUR";
  eic_completeness: ExecutionPlan["eicCompleteness"];
};

type TaskRow = {
  task_id: string;
  plan_id: string;
  source_operation_id: string;
  process_id: string;
  process_label: string;
  scope: string;
  scope_label: string;
  seq: number;
  seq_label: string;
  required_capability_id: string;
  required_capability_label: string;
  provider_requirement: string | null;
  status: ExecutionTask["status"];
  created_at: string;
  quantities_json: string;
  resources_json: string;
  assigned_provider_id: string | null;
  assigned_provider_kind: string | null;
  assigned_provider_label: string | null;
  assigned_executor_id: string | null;
  assigned_executor_label: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_outcome: string | null;
  completed_quantity: number | null;
  completed_quantity_unit: string | null;
  completion_note: string | null;
};

type DependencyRow = {
  task_id: string;
  depends_on_task_id: string;
};

type ActualConsumptionRow = {
  entry_id: string;
  task_id: string;
  plan_id: string;
  resource_id: string;
  resource_label: string;
  actual_quantity: number;
  unit: string;
  recorded_at: string;
  note: string | null;
};

export function insertExecutionPlanRecord(
  db: SqliteDatabase,
  record: ExecutionPlanRecord,
): { created: boolean; record: ExecutionPlanRecord } {
  const existing = getExecutionPlanBySnapshotId(db, record.plan.sourceSnapshotId);
  if (existing) {
    return { created: false, record: existing };
  }

  const persist = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO execution_plans (
        plan_id,
        source_snapshot_id,
        source_snapshot_hash,
        product_code,
        product_label,
        inscription,
        created_at,
        status,
        schema_version,
        task_count,
        eic_total,
        eic_currency,
        eic_completeness
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      record.plan.planId,
      record.plan.sourceSnapshotId,
      record.plan.sourceSnapshotHash,
      record.plan.productCode,
      record.plan.productLabel,
      record.plan.inscription,
      record.plan.createdAt,
      record.plan.status,
      record.plan.schemaVersion,
      record.plan.taskCount,
      record.plan.eicTotal,
      record.plan.eicCurrency,
      record.plan.eicCompleteness,
    );

    const insertTask = db.prepare(
      `
      INSERT INTO execution_tasks (
        task_id,
        plan_id,
        source_operation_id,
        process_id,
        process_label,
        scope,
        scope_label,
        seq,
        seq_label,
        required_capability_id,
        required_capability_label,
        provider_requirement,
        status,
        created_at,
        quantities_json,
        resources_json,
        assigned_provider_id,
        assigned_provider_kind,
        assigned_provider_label,
        assigned_executor_id,
        assigned_executor_label,
        started_at,
        completed_at,
        completion_outcome,
        completed_quantity,
        completed_quantity_unit,
        completion_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    const insertDependency = db.prepare(
      `
      INSERT INTO execution_task_dependencies (
        plan_id,
        task_id,
        depends_on_task_id
      ) VALUES (?, ?, ?)
    `,
    );

    for (const task of record.tasks) {
      insertTask.run(
        task.taskId,
        task.executionPlanId,
        task.sourceOperationId,
        task.processId,
        task.processLabel,
        task.scope,
        task.scopeLabel,
        task.seq,
        task.seqLabel,
        task.requiredCapabilityId,
        task.requiredCapabilityLabel,
        task.providerRequirement,
        task.status,
        task.createdAt,
        JSON.stringify(task.quantities),
        JSON.stringify(task.resourceDemands),
        task.assignedProvider?.id ?? null,
        task.assignedProvider?.kind ?? null,
        task.assignedProvider?.label ?? null,
        task.assignedExecutor?.id ?? null,
        task.assignedExecutor?.label ?? null,
        task.startedAt,
        task.completedAt,
        task.completion?.outcome ?? null,
        task.completion?.completedQuantity ?? null,
        task.completion?.completedQuantityUnit ?? null,
        task.completion?.note ?? null,
      );
      for (const dependencyId of task.dependsOnTaskIds) {
        insertDependency.run(record.plan.planId, task.taskId, dependencyId);
      }
    }
  });
  persist();

  return { created: true, record };
}

export function listOpenExecutionPlanRecords(
  db: SqliteDatabase,
): ExecutionPlanRecord[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT p.*
      FROM execution_plans p
      INNER JOIN execution_tasks t ON t.plan_id = p.plan_id
      WHERE t.status IN ('PLANNED', 'IN_PROGRESS')
      ORDER BY p.created_at ASC, p.plan_id ASC
    `,
    )
    .all() as PlanRow[];
  return rows.map((row) => hydrateRecord(db, row));
}

export function getExecutionPlanRecord(
  db: SqliteDatabase,
  planId: string,
): ExecutionPlanRecord | null {
  const planRow = db
    .prepare(
      `
      SELECT *
      FROM execution_plans
      WHERE plan_id = ?
    `,
    )
    .get(planId) as PlanRow | undefined;
  if (!planRow) {
    return null;
  }
  return hydrateRecord(db, planRow);
}

export function getExecutionPlanBySnapshotId(
  db: SqliteDatabase,
  snapshotId: string,
): ExecutionPlanRecord | null {
  const planRow = db
    .prepare(
      `
      SELECT *
      FROM execution_plans
      WHERE source_snapshot_id = ?
    `,
    )
    .get(snapshotId) as PlanRow | undefined;
  if (!planRow) {
    return null;
  }
  return hydrateRecord(db, planRow);
}

export function getExecutionPlanByTaskId(
  db: SqliteDatabase,
  taskId: string,
): ExecutionPlanRecord | null {
  const row = db
    .prepare(
      `
      SELECT plan_id
      FROM execution_tasks
      WHERE task_id = ?
    `,
    )
    .get(taskId) as { plan_id: string } | undefined;
  if (!row) {
    return null;
  }
  return getExecutionPlanRecord(db, row.plan_id);
}

export function persistAssignedProvider(
  db: SqliteDatabase,
  taskId: string,
  providerId: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): TaskMutationResult {
  return applyMutation(db, taskId, (record) =>
    assignProviderToTask(record, taskId, providerId, registry),
  );
}

export function persistAssignedExecutor(
  db: SqliteDatabase,
  taskId: string,
  personId: string,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null = null,
): TaskMutationResult {
  return applyMutation(db, taskId, (record) =>
    assignExecutorToTask(record, taskId, personId, people, eligibility),
  );
}

export function persistTaskStart(
  db: SqliteDatabase,
  taskId: string,
  startedAt: string,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null = null,
  registry: WorkcenterRegistry = workcenterRegistry,
): TaskMutationResult {
  return applyMutation(db, taskId, (record) =>
    startExecutionTask(record, taskId, startedAt, people, eligibility, registry),
  );
}

export function persistClaimAndStart(
  db: SqliteDatabase,
  taskId: string,
  personId: string,
  startedAt: string,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null = null,
  registry: WorkcenterRegistry = workcenterRegistry,
): TaskMutationResult {
  return applyMutation(db, taskId, (record) =>
    claimAndStartExecutionTask(
      record,
      taskId,
      personId,
      startedAt,
      people,
      eligibility,
      registry,
    ),
  );
}

export function persistTaskComplete(
  db: SqliteDatabase,
  taskId: string,
  completedAt: string,
  input: TaskCompletionInput = {},
  actorPersonId: string | null = null,
): TaskMutationResult {
  return applyMutation(db, taskId, (record) =>
    completeExecutionTask(record, taskId, completedAt, input, actorPersonId),
  );
}

function applyMutation(
  db: SqliteDatabase,
  taskId: string,
  mutate: (record: ExecutionPlanRecord) => TaskMutationResult,
): TaskMutationResult {
  const run = db.transaction((): TaskMutationResult => {
    const record = getExecutionPlanByTaskId(db, taskId);
    if (!record) {
      return { ok: false, error: "not_found" };
    }
    const result = mutate(record);
    if (!result.ok || result.alreadyApplied) {
      return result;
    }
    const next = result.record.tasks.find((task) => task.taskId === taskId);
    if (!next) {
      return { ok: false, error: "not_found" };
    }
    const written = writeTaskOperationalState(
      db,
      next,
      record.tasks.find((task) => task.taskId === taskId),
    );
    if (!written) {
      const current = getExecutionPlanByTaskId(db, taskId);
      if (!current) {
        return { ok: false, error: "not_found" };
      }
      return mutate(current);
    }
    const stored = getExecutionPlanByTaskId(db, taskId);
    if (!stored) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, alreadyApplied: false, record: stored };
  });
  return run();
}

function writeTaskOperationalState(
  db: SqliteDatabase,
  next: ExecutionTask,
  previous: ExecutionTask | undefined,
): boolean {
  const result = db
    .prepare(
      `
      UPDATE execution_tasks
      SET
        assigned_provider_id = ?,
        assigned_provider_kind = ?,
        assigned_provider_label = ?,
        assigned_executor_id = ?,
        assigned_executor_label = ?,
        status = ?,
        started_at = ?,
        completed_at = ?,
        completion_outcome = ?,
        completed_quantity = ?,
        completed_quantity_unit = ?,
        completion_note = ?
      WHERE task_id = ?
        AND status = ?
        AND IFNULL(assigned_provider_id, '') = ?
        AND IFNULL(assigned_executor_id, '') = ?
        AND IFNULL(started_at, '') = ?
        AND IFNULL(completed_at, '') = ?
    `,
    )
    .run(
      next.assignedProvider?.id ?? null,
      next.assignedProvider?.kind ?? null,
      next.assignedProvider?.label ?? null,
      next.assignedExecutor?.id ?? null,
      next.assignedExecutor?.label ?? null,
      next.status,
      next.startedAt,
      next.completedAt,
      next.completion?.outcome ?? null,
      next.completion?.completedQuantity ?? null,
      next.completion?.completedQuantityUnit ?? null,
      next.completion?.note ?? null,
      next.taskId,
      previous?.status ?? next.status,
      previous?.assignedProvider?.id ?? "",
      previous?.assignedExecutor?.id ?? "",
      previous?.startedAt ?? "",
      previous?.completedAt ?? "",
    );
  if (result.changes !== 1) {
    return false;
  }
  writeActualConsumption(db, next);
  writeInventoryOutFromTask(db, next);
  return true;
}

function writeActualConsumption(db: SqliteDatabase, task: ExecutionTask): void {
  const insert = db.prepare(
    `
      INSERT INTO execution_task_actual_consumption (
        entry_id,
        task_id,
        plan_id,
        resource_id,
        resource_label,
        actual_quantity,
        unit,
        recorded_at,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  for (const entry of task.actualConsumption) {
    insert.run(
      entry.entryId,
      entry.taskId,
      task.executionPlanId,
      entry.resourceId,
      entry.resourceLabel,
      entry.actualQuantity,
      entry.unit,
      entry.recordedAt,
      entry.note,
    );
  }
}

function hydrateRecord(db: SqliteDatabase, planRow: PlanRow): ExecutionPlanRecord {
  const taskRows = db
    .prepare(
      `
      SELECT *
      FROM execution_tasks
      WHERE plan_id = ?
      ORDER BY seq
    `,
    )
    .all(planRow.plan_id) as TaskRow[];
  const dependencyRows = db
    .prepare(
      `
      SELECT task_id, depends_on_task_id
      FROM execution_task_dependencies
      WHERE plan_id = ?
    `,
    )
    .all(planRow.plan_id) as DependencyRow[];
  const actualRows = db
    .prepare(
      `
      SELECT *
      FROM execution_task_actual_consumption
      WHERE plan_id = ?
      ORDER BY resource_id
    `,
    )
    .all(planRow.plan_id) as ActualConsumptionRow[];
  const actuals = new Map<string, ActualConsumptionEntry[]>();
  for (const row of actualRows) {
    const current = actuals.get(row.task_id) ?? [];
    current.push({
      entryId: row.entry_id,
      taskId: row.task_id,
      resourceId: row.resource_id,
      resourceLabel: row.resource_label,
      actualQuantity: row.actual_quantity,
      unit: row.unit,
      recordedAt: row.recorded_at,
      note: row.note,
    });
    actuals.set(row.task_id, current);
  }
  const dependencies = new Map<string, string[]>();
  for (const row of dependencyRows) {
    const current = dependencies.get(row.task_id) ?? [];
    current.push(row.depends_on_task_id);
    dependencies.set(row.task_id, current);
  }

  return {
    plan: {
      planId: planRow.plan_id,
      sourceSnapshotId: planRow.source_snapshot_id,
      sourceSnapshotHash: planRow.source_snapshot_hash,
      productCode: planRow.product_code,
      productLabel: planRow.product_label,
      inscription: planRow.inscription,
      createdAt: planRow.created_at,
      status: planRow.status,
      taskCount: planRow.task_count,
      schemaVersion: 1 as const,
      eicTotal: planRow.eic_total,
      eicCurrency: planRow.eic_currency,
      eicCompleteness: planRow.eic_completeness,
    },
    tasks: taskRows.map((row) => ({
      taskId: row.task_id,
      executionPlanId: row.plan_id,
      sourceOperationId: row.source_operation_id,
      processId: row.process_id,
      processLabel: row.process_label,
      scope: row.scope,
      scopeLabel: row.scope_label,
      seq: row.seq,
      seqLabel: row.seq_label,
      dependsOnTaskIds: dependencies.get(row.task_id) ?? [],
      requiredCapabilityId: row.required_capability_id,
      requiredCapabilityLabel: row.required_capability_label,
      providerRequirement:
        row.provider_requirement === "NOT_REQUIRED" ? "NOT_REQUIRED" : "REQUIRED",
      status: row.status,
      quantities: JSON.parse(row.quantities_json) as ExecutionTask["quantities"],
      resourceDemands: JSON.parse(row.resources_json) as ExecutionTask["resourceDemands"],
      assignedProvider: assignedProviderFromRow(
        row.assigned_provider_id,
        row.assigned_provider_kind,
        row.assigned_provider_label,
      ),
      assignedExecutor: assignedExecutorFromRow(
        row.assigned_executor_id,
        row.assigned_executor_label,
      ),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      completion: completionFromRow(
        row.completion_outcome,
        row.completed_quantity,
        row.completed_quantity_unit,
        row.completion_note,
      ),
      actualConsumption: actuals.get(row.task_id) ?? [],
      createdAt: row.created_at,
    })),
  };
}
