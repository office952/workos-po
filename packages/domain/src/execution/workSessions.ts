import type { ExecutionPlanRecord, ExecutionTask } from './plan.js';

export type WorkSession = {
  sessionId: string;
  taskId: string;
  personId: string;
  personLabel: string;
  startedAt: string;
  endedAt: string | null;
  endKind: 'LEFT' | 'COMPLETED' | null;
};

export function activeWorkSessions(task: Pick<ExecutionTask, 'workSessions'>): readonly WorkSession[] {
  return (task.workSessions ?? []).filter(s => s.endedAt === null);
}

/** Historical first executor remains a legacy fallback only on an untracked task. */
export function isWorkingOnTask(task: ExecutionTask, personId: string | null): boolean {
  if (!personId || task.status !== 'IN_PROGRESS') return false;
  if ((task.workSessions ?? []).length) return activeWorkSessions(task).some(s => s.personId === personId);
  return task.assignedExecutor?.id === personId;
}

export function otherActiveWorkers(task: ExecutionTask, personId: string | null): readonly WorkSession[] {
  return activeWorkSessions(task).filter(s => s.personId !== personId);
}

export function endWorkSessions(task: ExecutionTask, at: string): readonly WorkSession[] {
  return (task.workSessions ?? []).map(s => s.endedAt === null
    ? { ...s, endedAt: at, endKind: 'COMPLETED' as const } : s);
}

export function sessionMilliseconds(s: WorkSession, asOf: string): number {
  return Math.max(0, Date.parse(s.endedAt ?? asOf) - Date.parse(s.startedAt));
}

export function workTimeLabel(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return 'Neînregistrat';
  if (milliseconds > 0 && milliseconds < 60000) return 'Sub 1 min';
  const minutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? hours + ' h' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '') : minutes + ' min';
}

export function intervalUnionMilliseconds(intervals: readonly { startedAt: string; endedAt: string | null }[], asOf: string): number {
  let end = -Infinity;
  let total = 0;
  for (const s of [...intervals].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const start = Date.parse(s.startedAt);
    const stop = Math.max(start, Date.parse(s.endedAt ?? asOf));
    total += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return total;
}

/**
 * Why part of an operation's labor has no individual sessions. Only canonical facts qualify:
 * a recorded start (or completion) with no personal session at that start. Pauses, an unfinished
 * operation, or gaps between two moments are never treated as missing work, and the gap is not
 * attributed to any person.
 */
export type WorkEvidenceGap = 'UNTRACKED_START' | 'NO_INDIVIDUAL_SESSIONS';

export const WORK_EVIDENCE_GAP_LABELS: Record<WorkEvidenceGap, string> = {
  UNTRACKED_START: 'Operația a fost pornită fără sesiune individuală; evidența pe persoane începe după pornire.',
  NO_INDIVIDUAL_SESSIONS: 'Operația are pornire sau finalizare înregistrată, dar nicio sesiune individuală.',
};

export function workEvidenceGap(task: Pick<ExecutionTask, 'executionMode' | 'startedAt' | 'completedAt' | 'workSessions'>): WorkEvidenceGap | null {
  if (task.executionMode === 'EXTERNAL') return null;
  const sessions = task.workSessions ?? [];
  if (!task.startedAt) return !sessions.length && task.completedAt ? 'NO_INDIVIDUAL_SESSIONS' : null;
  if (!sessions.length) return 'NO_INDIVIDUAL_SESSIONS';
  return sessions.some(s => s.startedAt === task.startedAt) ? null : 'UNTRACKED_START';
}

function taskCoverageLabel(task: ExecutionTask, complete: boolean, activeSessions: number, gap: WorkEvidenceGap | null): string {
  if (task.executionMode === 'EXTERNAL') return 'Producție externă';
  if (complete) return 'Complet';
  if (activeSessions && gap) return 'Provizoriu · sesiune activă · parțial nedocumentat';
  if (gap) return 'Parțial · timp nedocumentat';
  if (activeSessions) return 'Provizoriu · sesiune activă';
  if (!task.startedAt) return 'Neîncepută';
  return 'În lucru · fără sesiuni active';
}

export function projectWorkHours(record: ExecutionPlanRecord, asOf: string) {
  const applicable = record.tasks.filter(t => t.executionMode !== 'EXTERNAL');
  const tasks = record.tasks.map(task => {
    const sessions = task.workSessions ?? [];
    const milliseconds = sessions.length ? sessions.reduce((n, s) => n + sessionMilliseconds(s, asOf), 0) : null;
    const trackedFromStart = sessions.some(s => s.startedAt === task.startedAt);
    const complete = task.status === 'COMPLETED' && trackedFromStart && sessions.every(s => s.endedAt !== null);
    const activeSessionCount = sessions.filter(s => s.endedAt === null).length;
    const evidenceGap = workEvidenceGap(task);
    const people = [...new Set(sessions.map(s => s.personId))].map(id => {
      const own = sessions.filter(s => s.personId === id);
      const ms = own.reduce((n, s) => n + sessionMilliseconds(s, asOf), 0);
      return { personId: id, label: own[0]!.personLabel, milliseconds: ms, timeLabel: workTimeLabel(ms), active: own.some(s => !s.endedAt) };
    });
    return { taskId: task.taskId, processLabel: task.processLabel, scopeLabel: task.scopeLabel, seqLabel: task.seqLabel,
      status: task.status, startedAt: task.startedAt ?? task.handedOffAt ?? null, completedAt: task.completedAt,
      milliseconds, timeLabel: task.executionMode === 'EXTERNAL' ? 'Nu se aplică' : workTimeLabel(milliseconds), complete,
      coverageLabel: taskCoverageLabel(task, complete, activeSessionCount, evidenceGap),
      activeSessionCount, provisional: activeSessionCount > 0,
      undocumented: evidenceGap !== null, evidenceGap, evidenceGapLabel: evidenceGap ? WORK_EVIDENCE_GAP_LABELS[evidenceGap] : null,
      declaredDurationLabel: task.actualDurationMinutes === null ? null : workTimeLabel(task.actualDurationMinutes * 60000),
      machineTimeLabel: task.machineRuns.length ? workTimeLabel(task.machineRuns.filter(r => r.completedAt !== null).reduce((n, r) => n + Math.max(0, Date.parse(r.completedAt!) - Date.parse(r.startedAt)), 0)) : null,
      people, sessions: sessions.map(s => ({ ...s, milliseconds: sessionMilliseconds(s, asOf), timeLabel: workTimeLabel(sessionMilliseconds(s, asOf)) })) };
  });
  const sessions = applicable.flatMap(t => t.workSessions ?? []);
  const total = sessions.length ? sessions.reduce((n, s) => n + sessionMilliseconds(s, asOf), 0) : null;
  const completeTasks = tasks.filter(t => t.complete).length;
  const complete = applicable.length > 0 && applicable.every(t => tasks.find(r => r.taskId === t.taskId)?.complete);
  const people = [...new Set(sessions.map(s => s.personId))].map(id => {
    const own = sessions.filter(s => s.personId === id);
    const ms = own.reduce((n, s) => n + sessionMilliseconds(s, asOf), 0);
    return { personId: id, label: own[0]!.personLabel, milliseconds: ms, timeLabel: workTimeLabel(ms), active: own.some(s => !s.endedAt) };
  });
  const starts = record.tasks.flatMap(t => t.startedAt || t.handedOffAt ? [t.startedAt ?? t.handedOffAt!] : []).sort();
  const ends = record.tasks.flatMap(t => t.completedAt ? [t.completedAt] : []).sort();
  const finished = record.tasks.length > 0 && record.tasks.every(t => t.status === 'COMPLETED');
  const runs = record.tasks.flatMap(t => t.machineRuns);
  const machineMs = runs.length ? runs.filter(r => r.completedAt !== null).reduce((n, r) => n + Math.max(0, Date.parse(r.completedAt!) - Date.parse(r.startedAt)), 0) : null;
  const activeSessionCount = sessions.filter(s => s.endedAt === null).length;
  const provisionalTaskCount = tasks.filter(t => t.provisional).length;
  const undocumentedTaskCount = tasks.filter(t => t.undocumented).length;
  const idleTaskCount = tasks.filter(t => t.status === 'IN_PROGRESS' && !t.provisional).length;
  return { asOf, milliseconds: total, activeSessionCount, provisionalTaskCount, undocumentedTaskCount, idleTaskCount, totalLabel: !applicable.length && record.tasks.length ? 'Nu se aplică' : workTimeLabel(total), complete, completeTasks, applicableTasks: applicable.length,
    coverageLabel: !applicable.length && record.tasks.length ? 'Nu se aplică · producție externă' : complete ? 'Evidența orelor: completă'
      : activeSessionCount && undocumentedTaskCount ? 'Ore provizorii · sesiuni active · evidență parțială'
      : activeSessionCount ? 'Ore provizorii · sesiuni active'
      : undocumentedTaskCount ? 'Evidența orelor: parțială'
      : starts.length ? 'Evidența orelor: fără lipsuri · lucrare în curs' : 'Evidența orelor: lucrare neîncepută',
    startedAt: starts[0] ?? null, completedAt: finished ? ends.at(-1) ?? null : null,
    elapsedLabel: starts[0] ? workTimeLabel(Date.parse(finished ? ends.at(-1)! : asOf) - Date.parse(starts[0])) : 'Neînceput',
    activeTimeLabel: sessions.length ? workTimeLabel(intervalUnionMilliseconds(sessions, asOf)) : 'Neînregistrat',
    machineTimeLabel: workTimeLabel(machineMs), machineActive: runs.some(r => r.completedAt === null), people, tasks };
}
