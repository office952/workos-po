import { moment } from './format';
import type { JobRecord } from '../../api/jobRecord';
import { Heading, RecordIcon } from './presentation';

export function JobRecordPeople({ hours, operationHref }: { hours: JobRecord['hours']; operationHref: (id: string) => string }) {
  return <section className="job-record__section" aria-label="Oameni și timp">
    <header><div><Heading icon="people">Oameni și timp</Heading><p>Intrările, ieșirile și timpul înregistrat de fiecare persoană.</p></div></header>
    <dl className="job-record__people-totals">
      <div><dt>Ore de muncă înregistrate</dt><dd>{hours?.totalLabel ?? 'Neînregistrat'}</dd></div>
      <div><dt>Timp cu activitate înregistrată</dt><dd>{hours?.activeTimeLabel ?? 'Neînregistrat'}</dd></div>
    </dl>
    <p className="job-record__note">Orele de muncă adună contribuțiile persoanelor. Timpul cu activitate numără o singură dată intervalele simultane. Orele lipsă rămân neînregistrate.</p>
    {hours ? <p className="job-record__note" data-complete={hours.complete}>{hours.coverageLabel}</p> : null}
    <div>
      {hours?.people.length ? <ul className="job-record__people">{hours.people.map(person => {
        const sessions = hours.tasks.flatMap(task => task.sessions.filter(session => session.personId === person.personId).map(session => ({ session, task })));
        return <li key={person.personId}>
          <div className="job-record__person"><span><strong>{person.label}</strong>{person.active ? <small>Lucrează acum</small> : null}</span><strong>{person.timeLabel}</strong></div>
          {sessions.length ? <table className="job-record__table job-record__sessions-table">
            <caption className="u-visually-hidden">Sesiunile persoanei {person.label}</caption>
            <thead><tr><th scope="col">Operație</th><th scope="col">Intrare</th><th scope="col">Ieșire</th><th scope="col">Durată</th></tr></thead>
            <tbody>{sessions.map(({ session, task }) => <tr key={session.sessionId}>
              <td data-label="Operație"><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><p>{task.scopeLabel}</p></td>
              <td data-label="Intrare"><time dateTime={session.startedAt}>{moment(session.startedAt)}</time></td>
              <td data-label="Ieșire">{session.endedAt ? <time dateTime={session.endedAt}>{moment(session.endedAt)}</time> : <strong className="job-record__live">Sesiune activă</strong>}</td>
              <td data-label="Durată"><strong>{session.timeLabel}</strong></td>
            </tr>)}</tbody>
          </table> : <p>Fără sesiuni înregistrate.</p>}
        </li>;
      })}</ul> : <p>Participanții nu au fost documentați prin sesiuni.</p>}
    </div>
  </section>;
}

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
