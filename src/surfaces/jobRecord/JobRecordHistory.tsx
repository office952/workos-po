import { moment } from './format';
import type { JobRecord } from '../../api/jobRecord';
import { Heading, RecordIcon } from './presentation';

export function JobRecordPeople({ hours }: { hours: JobRecord['hours'] }) {
  return <section id="oameni" className="job-record__section" aria-label="Oameni și timp">
    <header><div><Heading icon="people">Oameni și timp</Heading><p>Contribuția fiecărei persoane la această lucrare.</p></div></header>
    <div className="job-record__people-layout">
      {hours?.people.length ? <ul className="job-record__people">{hours.people.map(p => <li key={p.personId}><span><strong>{p.label}</strong>{p.active ? <small>Lucrează acum</small> : null}</span><strong>{p.timeLabel}</strong></li>)}</ul> : <p>Participanții nu au fost documentați prin sesiuni.</p>}
      <div className="job-record__activity"><span>Timp cu activitate înregistrată</span><strong>{hours?.activeTimeLabel ?? 'Neînregistrat'}</strong><p className="job-record__note">Intervalele simultane se numără o singură dată aici. În orele de muncă, contribuția fiecărei persoane se adună.</p></div>
    </div>
  </section>;
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
  return <section id="cronologie" className="job-record__section" aria-label="Cronologia lucrării">
    <header><div><Heading icon="history">Cronologia lucrării</Heading><p>Cine · ce a înregistrat · când</p></div><span className="job-record__count">{events.length} înregistrări</span></header>
    {groups.length ? groups.map((group, i) => <div className="job-record__day" key={`${group.key}-${i}`}>
      <h3>{group.label}</h3>
      <ol className="job-record__timeline">{group.events.map(e => <li key={e.eventId}>
        <RecordIcon kind={e.kind === 'TASK_COMPLETED' || e.kind === 'QUALITY_PASS' ? 'check' : e.kind.includes('MACHINE') ? 'machine' : e.kind.includes('ARTIFACT') ? 'file' : 'history'}/>
        <time dateTime={e.occurredAt}>{moment(e.occurredAt)}</time>
        <div><strong>{e.label}</strong><p>{e.actorLabel ?? 'Autor neînregistrat'}</p>{e.taskId ? <a href={operationHref(e.taskId)}>{e.taskLabel}</a> : null}{e.detail ? <p>{e.detail}</p> : null}</div>
      </li>)}</ol>
    </div>) : <p className="job-record__empty">Nu există încă evenimente înregistrate.</p>}
  </section>;
}
