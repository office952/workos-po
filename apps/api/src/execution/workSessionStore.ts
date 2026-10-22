import { type WorkSession, type ExecutionTask } from '@workos-final/domain';
import type { SqliteDatabase } from '../persistence/sqlite.js';

type Row = { session_id: string; task_id: string; person_id: string; person_label: string;
  started_at: string; ended_at: string | null; end_kind: 'LEFT' | 'COMPLETED' | null };

export function readWorkSessions(db: SqliteDatabase, planId: string): WorkSession[] {
  return (db.prepare('SELECT * FROM execution_work_sessions WHERE plan_id = ? ORDER BY started_at, session_id').all(planId) as Row[])
    .map(r => ({ sessionId: r.session_id, taskId: r.task_id, personId: r.person_id, personLabel: r.person_label,
      startedAt: r.started_at, endedAt: r.ended_at, endKind: r.end_kind }));
}

/** Called inside the same operational/quality transaction as the task state. Never deletes history. */
export function writeWorkSessions(db: SqliteDatabase, next: ExecutionTask, previous: ExecutionTask | undefined): void {
  for (const s of next.workSessions ?? []) {
    const old = previous?.workSessions?.find(p => p.sessionId === s.sessionId);
    if (!old) {
      db.prepare('INSERT INTO execution_work_sessions (session_id, plan_id, task_id, person_id, person_label, started_at, ended_at, end_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(s.sessionId, next.executionPlanId, s.taskId, s.personId, s.personLabel, s.startedAt, s.endedAt, s.endKind);
    } else if (!old.endedAt && s.endedAt) {
      const result = db.prepare('UPDATE execution_work_sessions SET ended_at = ?, end_kind = ? WHERE session_id = ? AND ended_at IS NULL')
        .run(s.endedAt, s.endKind, s.sessionId);
      if (result.changes !== 1) throw new Error('Work session write conflict');
    }
  }
}
