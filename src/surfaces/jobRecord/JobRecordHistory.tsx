import { moment } from './format';
import type { JobRecord } from '../../api/jobRecord';
import { Heading, RecordIcon } from './presentation';

function eventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

function dateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function JobRecordHistory({ events, operationHref }: { events: JobRecord['timeline']; operationHref: (id: string) => string }) {
  const groups: { key: string; label: string; events: JobRecord['timeline'] }[] = [];
  for (const event of events) {
    const key = dateKey(event.occurredAt);
    const last = groups.at(-1);
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, label: dateLabel(event.occurredAt), events: [event] });
  }
  return <section className="job-record__section" aria-label="Istoricul lucrării">
    <header><div><Heading icon="history">Istoricul lucrării</Heading><p>Cine · ce a înregistrat · când</p></div><span className="job-record__count">{events.length} înregistrări</span></header>
    {groups.length ? groups.map((group, i) => <div className="job-record__day" key={`${group.key}-${i}`}>
      <h3>{group.label}</h3>
      <ol className="job-record__timeline">{group.events.map(e => <li key={e.eventId}>
        <RecordIcon kind={e.kind === 'TASK_COMPLETED' || e.kind === 'QUALITY_PASS' ? 'check' : e.kind.includes('MACHINE') ? 'machine' : e.kind.includes('ARTIFACT') ? 'file' : 'history'}/>
        <time dateTime={e.occurredAt} title={moment(e.occurredAt) ?? undefined}>{eventTime(e.occurredAt)}</time>
        <div><div className="job-record__event-line"><strong>{e.label}</strong><span>{e.actorLabel ?? 'Autor neînregistrat'}</span>{e.taskId ? <a href={operationHref(e.taskId)}>{e.taskLabel}</a> : null}</div>{e.detail ? <p>{e.detail}</p> : null}</div>
      </li>)}</ol>
    </div>) : <p className="job-record__empty">Nu există încă evenimente înregistrate.</p>}
  </section>;
}
