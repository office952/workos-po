import { moment } from './format';
import type { JobRecord } from '../../api/jobRecord';
import { Heading, RecordIcon } from './presentation';

export function JobRecordPeople({ hours, operationHref }: { hours: JobRecord['hours']; operationHref: (id: string) => string }) {
  return <section className="job-record__section" aria-label="Oameni și timp">
    <header><div><Heading icon="people">Oameni și timp</Heading><p>Contribuția fiecărei persoane și sesiunile ei. Operațiile se deschid din registru, fără repetarea planului.</p></div></header>
    <div className="job-record__people-layout">
      {hours?.people.length ? <ul className="job-record__people">{hours.people.map(person => {
        const sessions = hours.tasks.flatMap(task => task.sessions.filter(session => session.personId === person.personId).map(session => ({ session, task })));
        return <li key={person.personId}>
          <div className="job-record__person"><span><strong>{person.label}</strong>{person.active ? <small>Lucrează acum</small> : null}</span><strong>{person.timeLabel}</strong></div>
          {sessions.length ? <ul className="job-record__sessions">{sessions.map(({ session, task }) => <li key={session.sessionId}><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><span>{moment(session.startedAt)} → {session.endedAt ? moment(session.endedAt) : 'Sesiune activă'} · {session.timeLabel}</span></li>)}</ul> : <p>Fără sesiuni înregistrate.</p>}
        </li>;
      })}</ul> : <p>Participanții nu au fost documentați prin sesiuni.</p>}
      <div className="job-record__activity"><span>Timp cu activitate înregistrată</span><strong>{hours?.activeTimeLabel ?? 'Neînregistrat'}</strong><p className="job-record__note">Intervalele simultane se numără o singură dată aici. În orele de muncă, contribuția fiecărei persoane se adună. Orele lipsă rămân neînregistrate.</p></div>
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
  return <section className="job-record__section" aria-label="Istoricul lucrării">
    <header><div><Heading icon="history">Istoricul lucrării</Heading><p>Cine · ce a înregistrat · când</p></div><span className="job-record__count">{events.length} înregistrări</span></header>
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
