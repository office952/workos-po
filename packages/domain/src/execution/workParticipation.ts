import { claimAndStartExecutionTask, type TaskMutationResult } from './lifecycle.js';
import { type ExecutionPlanRecord } from './plan.js';
import type { Person } from '../people/identity.js';
import type { PeopleEligibilityContext } from '../people/eligibility.js';
import type { WorkcenterRegistry } from '../workcenters/catalog.js';
import type { MaterialReadinessContext } from './materialReadiness.js';
import type { ProviderBindingStamp } from './providerBinding.js';
import { activeWorkSessions, type WorkSession } from './workSessions.js';

/** Reuse the canonical start gates; joining never resets an operation's start or first executor. */
export function joinExecutionWork(record: ExecutionPlanRecord, taskId: string, personId: string, at: string,
  people: readonly Person[], eligibility: PeopleEligibilityContext | null, registry: WorkcenterRegistry,
  material: MaterialReadinessContext, sessionId: string, stamp: ProviderBindingStamp | null = null): TaskMutationResult {
  const task = record.tasks.find(t => t.taskId === taskId);
  if (!task) return { ok: false, error: 'not_found' };
  if (task.status !== 'PLANNED' && task.status !== 'IN_PROGRESS') return { ok: false, error: 'invalid_transition' };
  if (activeWorkSessions(task).some(s => s.personId === personId)) return { ok: true, alreadyApplied: true, record };
  const validation = claimAndStartExecutionTask({ ...record, tasks: record.tasks.map(t => t.taskId === taskId
    ? { ...t, status: 'PLANNED' as const, assignedExecutor: null } : t) }, taskId, personId, at, people, eligibility, registry, material, stamp);
  if (!validation.ok) return validation;
  const ready = validation.record.tasks.find(t => t.taskId === taskId)!;
  const session: WorkSession = { sessionId, taskId, personId, personLabel: ready.assignedExecutor!.label,
    startedAt: at, endedAt: null, endKind: null };
  const next = { ...(task.status === 'PLANNED' ? ready : task), workSessions: [...(task.workSessions ?? []), session] };
  return { ok: true, alreadyApplied: false, record: { ...record, tasks: record.tasks.map(t => t.taskId === taskId ? next : t) } };
}

export function leaveExecutionWork(record: ExecutionPlanRecord, taskId: string, personId: string, at: string): TaskMutationResult {
  const task = record.tasks.find(t => t.taskId === taskId);
  if (!task) return { ok: false, error: 'not_found' };
  const own = activeWorkSessions(task).find(s => s.personId === personId);
  if (!own) return { ok: true, alreadyApplied: true, record };
  if (at < own.startedAt) return { ok: false, error: 'invalid_transition' };
  return { ok: true, alreadyApplied: false, record: { ...record, tasks: record.tasks.map(t => t.taskId === taskId
    ? { ...t, workSessions: (t.workSessions ?? []).map(s => s.sessionId === own.sessionId ? { ...s, endedAt: at, endKind: 'LEFT' as const } : s) } : t) } };
}
