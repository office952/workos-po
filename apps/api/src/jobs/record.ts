import { readQualityControlForPlan } from '../execution/qualityControlStore.js';
import { projectExecutionPlanView, projectWorkHours, type ExecutionPlanRecord } from '@workos-final/domain';
import type { SqliteDatabase } from '../persistence/sqlite.js';
import { readJobFileArchive } from '../execution/taskDossierStore.js';

const EVENT_LABELS: Record<string, string> = {
  INSTRUCTION_ADDED: 'Instrucțiune adăugată', OBSERVATION_ADDED: 'Observație adăugată',
  ISSUE_REPORTED: 'Problemă semnalată', ARTIFACT_UPLOADED: 'Fișier încărcat',
  ARTIFACT_LINKED: 'Fișier asociat', ARTIFACT_MARKED_USED: 'Fișier declarat folosit',
  PROVIDER_AUTO_BOUND: 'Utilaj asociat automat',
};
type TimelineItem = { eventId: string; kind: string; label: string; actorLabel: string | null;
  occurredAt: string; taskId: string | null; taskLabel: string | null; detail: string | null };

/** Only reads the already located job's organization DB and canonical plan. No N-per-task HTTP fan-out. */
export function readJobRecord(db: SqliteDatabase, jobId: string, plan: ExecutionPlanRecord | null, asOf: string) {
  const archive = readJobFileArchive(db, jobId, plan?.plan.planId ?? null);
  const taskLabel = (id: string | null) => {
    const t = plan?.tasks.find(t => t.taskId === id);
    return t ? t.seqLabel + ' · ' + t.processLabel + ' · ' + t.scopeLabel : null;
  };
  const personLabel = (id: string | null) => id
    ? (db.prepare('SELECT display_name FROM people WHERE person_id = ?').get(id) as { display_name: string } | undefined)?.display_name ?? null : null;
  const links = plan ? db.prepare(`SELECT l.artifact_id, l.task_id, l.used_at, l.used_by_operator_id, l.linked_at
    FROM execution_artifact_task_links l JOIN execution_tasks t ON t.task_id = l.task_id
    WHERE t.plan_id = ? ORDER BY t.seq, l.linked_at`).all(plan.plan.planId) as Array<{
      artifact_id: string; task_id: string; used_at: string | null; used_by_operator_id: string | null; linked_at: string }> : [];
  const files = (archive?.files ?? []).map(f => ({
    artifactId: f.artifactId, originalFileName: f.originalFileName, mimeType: f.mimeType,
    sizeLabel: f.sizeLabel, purpose: f.purpose, purposeLabel: f.purposeLabel, note: f.note,
    preview: f.preview, supersedesArtifactId: f.supersedesArtifactId, authorLabel: f.authorLabel,
    uploadedAt: f.uploadedAt, downloadHref: f.downloadHref,
    usages: links.filter(l => l.artifact_id === f.artifactId).map(l => ({
      taskId: l.task_id, taskLabel: taskLabel(l.task_id)!, linkedAt: l.linked_at,
      usedAt: l.used_at, usedByLabel: personLabel(l.used_by_operator_id),
    })),
  }));
  const timeline: TimelineItem[] = [];
  if (plan) {
    timeline.push({ eventId: 'plan:' + plan.plan.planId, kind: 'PLAN_CREATED', label: 'Plan de execuție pregătit',
      actorLabel: null, occurredAt: plan.plan.createdAt, taskId: null, taskLabel: null, detail: null });
    for (const t of plan.tasks) {
      const sessions = t.workSessions ?? [];
      if (t.startedAt && !sessions.some(s => s.startedAt === t.startedAt)) timeline.push({
        eventId: 'start:' + t.taskId, kind: 'TASK_STARTED', label: 'Operație începută', actorLabel: t.assignedExecutor?.label ?? null,
        occurredAt: t.startedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: 'Început fără sesiune individuală înregistrată' });
      for (const s of sessions) {
        timeline.push({ eventId: s.sessionId + ':in', kind: 'WORK_ENTERED', label: s.startedAt === t.startedAt ? 'Operație începută' : 'A intrat în operație',
          actorLabel: s.personLabel, occurredAt: s.startedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: null });
        if (s.endedAt && s.endKind === 'LEFT') timeline.push({ eventId: s.sessionId + ':out', kind: 'WORK_LEFT', label: 'A ieșit din operație',
          actorLabel: s.personLabel, occurredAt: s.endedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: null });
      }
      if (t.handedOffAt) timeline.push({ eventId: 'handoff:' + t.taskId, kind: 'EXTERNAL_HANDOFF', label: 'Trimis la furnizor extern', actorLabel: personLabel(t.handedOffBy ?? null),
        occurredAt: t.handedOffAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: t.externalProviderLabel ?? null });
      if (t.returnedAt) timeline.push({ eventId: 'return:' + t.taskId, kind: 'EXTERNAL_RETURN', label: 'Revenire de la furnizor înregistrată', actorLabel: personLabel(t.returnedBy ?? null),
        occurredAt: t.returnedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: t.externalProviderLabel ?? null });
      for (const run of t.machineRuns) {
        timeline.push({ eventId: run.machineRunId + ':start', kind: 'MACHINE_STARTED', label: 'Rulare utilaj pornită', actorLabel: run.startedByOperatorLabel,
          occurredAt: run.startedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: run.machineProviderLabel });
        if (run.completedAt) timeline.push({ eventId: run.machineRunId + ':stop', kind: 'MACHINE_STOPPED', label: 'Rulare utilaj oprită', actorLabel: run.completedByOperatorLabel,
          occurredAt: run.completedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: run.machineProviderLabel });
      }
      if (t.completedAt) timeline.push({ eventId: 'complete:' + t.taskId, kind: 'TASK_COMPLETED', label: 'Operație finalizată',
        actorLabel: sessions.find(s => s.endKind === 'COMPLETED' && s.endedAt === t.completedAt)?.personLabel ?? null,
        occurredAt: t.completedAt, taskId: t.taskId, taskLabel: taskLabel(t.taskId), detail: t.completion?.note ?? null });
    }
    const events = db.prepare(`SELECT e.event_id, e.event_kind, e.actor_operator_id, e.occurred_at, e.task_id,
      e.detail_json, entry.body FROM execution_task_dossier_events e
      LEFT JOIN execution_task_dossier_entries entry ON entry.entry_id = e.entry_id WHERE e.plan_id = ?`).all(plan.plan.planId) as Array<{
      event_id: string; event_kind: string; actor_operator_id: string | null; occurred_at: string; task_id: string;
      detail_json: string; body: string | null }>;
    for (const e of events) {
      const detail = JSON.parse(e.detail_json) as Record<string, string | null>;
      timeline.push({ eventId: e.event_id, kind: e.event_kind, label: EVENT_LABELS[e.event_kind] ?? 'Înregistrare în dosar',
        actorLabel: personLabel(e.actor_operator_id), occurredAt: e.occurred_at, taskId: e.task_id,
        taskLabel: taskLabel(e.task_id), detail: e.body ?? detail.fileName ?? detail.providerLabel ?? null });
    }
    const quality = db.prepare(`SELECT q.* FROM execution_quality_attempts q JOIN execution_tasks t ON t.task_id = q.task_id
      WHERE t.plan_id = ?`).all(plan.plan.planId) as Array<{ task_id: string; attempt_seq: number; result: string; actor_id: string; recorded_at: string; note: string | null }>;
    for (const q of quality) timeline.push({ eventId: 'quality:' + q.task_id + ':' + q.attempt_seq, kind: 'QUALITY_' + q.result,
      label: q.result === 'PASS' ? 'Control acceptat' : 'Control respins · corecție deschisă', actorLabel: personLabel(q.actor_id),
      occurredAt: q.recorded_at, taskId: q.task_id, taskLabel: taskLabel(q.task_id), detail: q.note });
    const corrections = db.prepare(`SELECT e.* FROM execution_rework_episodes e JOIN execution_tasks t ON t.task_id = e.task_id
      WHERE t.plan_id = ? AND e.status = 'CLOSED'`).all(plan.plan.planId) as Array<{ task_id: string; episode_seq: number; closed_by: string; closed_at: string; correction_note: string }>;
    for (const e of corrections) timeline.push({ eventId: 'correction:' + e.task_id + ':' + e.episode_seq, kind: 'CORRECTION_CLOSED', label: 'Corecție închisă',
      actorLabel: personLabel(e.closed_by), occurredAt: e.closed_at, taskId: e.task_id, taskLabel: taskLabel(e.task_id), detail: e.correction_note });
  }
  for (const e of archive?.history ?? []) if (!e.taskId) timeline.push({ eventId: e.eventId, kind: e.kind,
    label: EVENT_LABELS[e.kind] ?? 'Fișier înregistrat', actorLabel: e.actorLabel, occurredAt: e.occurredAt,
    taskId: null, taskLabel: null, detail: e.detail.fileName ?? null });
  timeline.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const hours = plan ? projectWorkHours(plan, asOf) : null;
  const facts = plan ? projectExecutionPlanView(plan, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { ...readQualityControlForPlan(db, plan.plan.planId), viewerIsOwner: false }).tasks : [];
  const withResults = hours ? { ...hours, tasks: hours.tasks.map(t => {
    const fact = facts.find(f => f.taskId === t.taskId)!;
    return { ...t, statusLabel: fact.statusLabel, qualityLabel: fact.qualityControl ? fact.openReworkEpisode ? 'Corecție deschisă' : fact.latestQualityResult === 'PASS' ? 'Control acceptat' : fact.latestQualityResult === 'FAIL' ? 'Corecție închisă · reverificare necesară' : 'Control neînregistrat' : null, completedQuantityLabel: fact.completedQuantityLabel,
      varianceLabel: fact.varianceLabel,
      plannedQuantity: fact.measurableQuantity ?? null, plannedConsumption: plan!.tasks.find(p => p.taskId === t.taskId)!.resourceDemands.map(r => ({ resourceLabel: r.label, quantity: r.quantity, unit: r.unit })), providerLabel: fact.assignedProvider?.label ?? null,
      externalProviderLabel: fact.externalProviderLabel ?? null,
      actualConsumption: fact.actualConsumption.map(a => ({ resourceLabel: a.resourceLabel, actualQuantity: a.actualQuantity, unit: a.unit })) };
  }) } : null;
  return { jobId, hours: withResults, files, timeline };
}
