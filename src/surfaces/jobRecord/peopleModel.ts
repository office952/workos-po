import type { JobRecord, WorkHoursTask, WorkPerson, WorkSession } from '../../api/jobRecord';

export type PersonSession = { task: WorkHoursTask; session: WorkSession };
export type PersonRecord = {
  person: WorkPerson;
  sessions: PersonSession[];
  operations: { task: WorkHoursTask; contribution: WorkPerson | undefined }[];
  active: PersonSession[];
  lastExit: PersonSession | undefined;
};

/** Evidence signals of one operation, read from the server projection; nothing is inferred from gaps between moments. */
export type TaskEvidence = { provisional: boolean; activeSessions: number; undocumented: boolean; gapLabel: string | null; idle: boolean };

export function taskEvidence(task: WorkHoursTask): TaskEvidence {
  const activeSessions = task.activeSessionCount ?? task.sessions.filter(s => !s.endedAt).length;
  const provisional = task.provisional ?? activeSessions > 0;
  return {
    provisional, activeSessions,
    // Older servers do not project gaps: treat them as unknown, never as missing work.
    undocumented: task.undocumented ?? false,
    gapLabel: task.evidenceGapLabel ?? null,
    idle: task.status === 'IN_PROGRESS' && !provisional,
  };
}

export type JobEvidence = { activeSessions: number; provisional: WorkHoursTask[]; undocumented: WorkHoursTask[]; idle: WorkHoursTask[]; complete: boolean };

export function jobEvidence(hours: NonNullable<JobRecord['hours']>): JobEvidence {
  const withEvidence = hours.tasks.map(task => ({ task, evidence: taskEvidence(task) }));
  return {
    // Same source as the live panel: each operation's open sessions, so the summary can never contradict who is working.
    activeSessions: withEvidence.reduce((n, { evidence }) => n + evidence.activeSessions, 0),
    provisional: withEvidence.filter(({ evidence }) => evidence.provisional).map(({ task }) => task),
    undocumented: withEvidence.filter(({ evidence }) => evidence.undocumented).map(({ task }) => task),
    idle: withEvidence.filter(({ evidence }) => evidence.idle).map(({ task }) => task),
    complete: hours.complete,
  };
}

/** Group already projected evidence; never sum formatted durations or infer coverage. */
export function peopleRecords(hours: NonNullable<JobRecord['hours']>): PersonRecord[] {
  return hours.people.map(person => {
    const sessions = hours.tasks.flatMap(task => task.sessions
      .filter(session => session.personId === person.personId)
      .map(session => ({ task, session })))
      .sort((a, b) => Date.parse(a.session.startedAt) - Date.parse(b.session.startedAt));
    const operations = hours.tasks
      .filter(task => task.people.some(p => p.personId === person.personId) || sessions.some(s => s.task.taskId === task.taskId))
      .map(task => ({ task, contribution: task.people.find(p => p.personId === person.personId) }));
    return {
      person, sessions, operations,
      active: sessions.filter(({ session }) => !session.endedAt),
      lastExit: sessions.filter(({ session }) => session.endedAt)
        .sort((a, b) => Date.parse(b.session.endedAt!) - Date.parse(a.session.endedAt!))[0],
    };
  }).sort((a, b) => Number(b.active.length > 0) - Number(a.active.length > 0));
}

export function sessionCount(count: number) { return count === 1 ? '1 sesiune' : `${count} sesiuni`; }
export function activeSessionsLabel(count: number) { return count === 1 ? '1 sesiune activă' : `${count} sesiuni active`; }
export function operationCount(count: number) { return count === 1 ? '1 operație' : `${count} operații`; }

export function visibleSessions(sessions: PersonSession[], expanded: boolean, limit = 3) {
  if (expanded || sessions.length <= limit) return sessions;
  const active = sessions.filter(({ session }) => !session.endedAt);
  const latest = sessions.filter(({ session }) => session.endedAt)
    .sort((a, b) => Date.parse(b.session.endedAt!) - Date.parse(a.session.endedAt!))
    .slice(0, Math.max(0, limit - active.length));
  return [...active, ...latest].sort((a, b) => Date.parse(a.session.startedAt) - Date.parse(b.session.startedAt));
}
