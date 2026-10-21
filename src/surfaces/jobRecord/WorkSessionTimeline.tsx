import type { PersonSession } from './peopleModel';

const dayLabel = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });
const clock = (date: Date) => (date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60) / 1440 * 100;

/** Calendar geometry only. Authoritative durations remain in the session table. */
export function WorkSessionTimeline({ sessions, asOf, selectedTask }: { sessions: PersonSession[]; asOf: string; selectedTask: string }) {
  const days = new Map<number, { key: string; taskId: string; from: number; to: number; active: boolean }[]>();
  for (const { session, task } of sessions) {
    const start = new Date(session.startedAt);
    const end = new Date(session.endedAt ?? asOf);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) continue;
    let cursor = new Date(start);
    do {
      const day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const until = end < next ? end : next;
      const segments = days.get(+day) ?? [];
      segments.push({ key: session.sessionId, taskId: task.taskId, from: clock(cursor), to: +until === +next ? 100 : clock(until), active: !session.endedAt });
      days.set(+day, segments);
      cursor = until;
    } while (cursor < end);
  }
  const ordered = [...days.entries()].sort(([a], [b]) => a - b);
  if (!ordered.length) return null;
  return <div className="job-people__axis" aria-hidden="true">
    <div className="job-people__axis-row"><span/><div className="job-people__axis-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>
    {ordered.slice(-6).map(([day, segments]) => <div className="job-people__axis-row" key={day}>
      <span>{dayLabel.format(day)}</span>
      <div className="job-people__axis-lane">{segments.map(segment => {
        const left = Math.min(99.5, segment.from);
        return <span key={`${segment.key}-${day}`} className="job-people__axis-segment" data-active={segment.active}
          data-selected={selectedTask === segment.taskId} data-dimmed={Boolean(selectedTask && selectedTask !== segment.taskId)}
          style={{ left: `${left}%`, width: `${Math.min(100 - left, Math.max(.5, segment.to - segment.from))}%` }} />;
      })}</div>
    </div>)}
    {ordered.length > 6 ? <small>Ultimele 6 zile înregistrate · toate sesiunile sunt în tabel</small> : null}
  </div>;
}
