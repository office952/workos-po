import type { JobRecord, WorkHoursTask, WorkPerson, WorkSession } from '../../api/jobRecord';

export type PersonSession = { task: WorkHoursTask; session: WorkSession };
export type PersonRecord = {
  person: WorkPerson;
  sessions: PersonSession[];
  operations: { task: WorkHoursTask; contribution: WorkPerson | undefined }[];
  active: PersonSession[];
  lastExit: PersonSession | undefined;
  incomplete: boolean;
};

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
      incomplete: operations.some(({ task }) => !task.complete),
    };
  }).sort((a, b) => Number(b.active.length > 0) - Number(a.active.length > 0));
}

export function sessionCount(count: number) { return count === 1 ? '1 sesiune' : `${count} sesiuni`; }

export function visibleSessions(sessions: PersonSession[], expanded: boolean, limit = 3) {
  if (expanded || sessions.length <= limit) return sessions;
  const active = sessions.filter(({ session }) => !session.endedAt);
  const latest = sessions.filter(({ session }) => session.endedAt)
    .sort((a, b) => Date.parse(b.session.endedAt!) - Date.parse(a.session.endedAt!))
    .slice(0, Math.max(0, limit - active.length));
  return [...active, ...latest].sort((a, b) => Date.parse(a.session.startedAt) - Date.parse(b.session.startedAt));
}
