import { useId, useState } from 'react';
import type { WorkHoursTask } from '../../api/jobRecord';
import { moment } from './format';
import { visibleSessions, type PersonRecord } from './peopleModel';
import { WorkSessionTimeline } from './WorkSessionTimeline';

function sessionEnd(kind: string | null, endedAt: string | null) {
  if (!endedAt) return 'Activă acum';
  if (kind === 'COMPLETED') return 'La finalizarea operației';
  if (kind === 'LEFT') return 'A ieșit';
  return 'Închidere neprecizată';
}

export function JobRecordPerson({ row, selectedTask, asOf, onSelectTask, operationHref }: {
  row: PersonRecord;
  selectedTask: WorkHoursTask | undefined;
  asOf: string;
  onSelectTask: (taskId: string) => void;
  operationHref: (taskId: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const selected = row.operations.find(({ task }) => task.taskId === selectedTask?.taskId);
  const sessions = selectedTask ? row.sessions.filter(({ task }) => task.taskId === selectedTask.taskId) : row.sessions;
  const shown = visibleSessions(sessions, expanded);
  const active = row.active.length > 0;
  const last = row.lastExit?.session.endedAt;
  return <article className="job-people__person" aria-labelledby={`${id}-name`}>
    <div className="job-people__person-row">
      <div className="job-people__identity">
        <span className="job-people__avatar" data-active={active} aria-hidden="true">{row.person.label.split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</span>
        <div><h4 id={`${id}-name`}>{row.person.label}</h4>
          {active ? <p className="job-people__person-state" data-active="true">Acum la {row.active.map(({ task }) => task.seqLabel).join(', ')}</p>
            : last ? <p className="job-people__person-state">Ieșit: <time dateTime={last}>{moment(last)}</time></p> : null}
          {row.incomplete ? <p className="job-people__person-coverage">Evidență incompletă la unele operații</p> : null}
        </div>
      </div>
      <WorkSessionTimeline sessions={row.sessions} asOf={asOf} selectedTask={selectedTask?.taskId ?? ''}/>
      <div className="job-people__person-total">
        <span>{selectedTask ? `La operația ${selectedTask.seqLabel}` : 'Total lucrare persoană'}</span>
        <strong>{selectedTask ? selected?.contribution?.timeLabel ?? 'Neînregistrat' : row.person.timeLabel}</strong>
        <small>{sessions.length} sesiuni{sessions.some(({ session }) => !session.endedAt) ? ' · provizoriu' : ''}</small>
        {selectedTask ? <small className="job-people__person-secondary">Total lucrare persoană: <b>{row.person.timeLabel}</b></small> : null}
      </div>
    </div>
    <div className="job-people__contributions" role="group" aria-label={`Operațiile persoanei ${row.person.label}`}>
      {row.operations.map(({ task, contribution }) => <button key={task.taskId} type="button" aria-pressed={selectedTask?.taskId === task.taskId}
        onClick={() => onSelectTask(task.taskId)} title={`${task.scopeLabel} · ${task.coverageLabel}`}>
        <span>{task.seqLabel}</span> {task.processLabel} <strong>{contribution?.timeLabel ?? 'Neînregistrat'}</strong>
      </button>)}
    </div>
    {sessions.length ? <>
      <table className="job-people__sessions" id={`${id}-sessions`}>
        <caption>Sesiunile persoanei {row.person.label}{selectedTask ? ` la operația ${selectedTask.seqLabel}` : ''} · afișate {shown.length} din {sessions.length}</caption>
        <thead><tr><th scope="col">Operație</th><th scope="col">Intrare</th><th scope="col">Ieșire</th><th scope="col">Durată</th><th scope="col">Închidere</th></tr></thead>
        <tbody>{shown.map(({ session, task }) => <tr key={session.sessionId}>
          <td data-label="Operație"><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><small>{task.scopeLabel}</small></td>
          <td data-label="Intrare"><time dateTime={session.startedAt}>{moment(session.startedAt)}</time></td>
          <td data-label="Ieșire">{session.endedAt ? <time dateTime={session.endedAt}>{moment(session.endedAt)}</time> : 'Încă activă'}</td>
          <td data-label="Durată"><strong>{session.timeLabel}</strong>{!session.endedAt ? <small>până la citire</small> : null}</td>
          <td data-label="Închidere"><span data-active={!session.endedAt}>{sessionEnd(session.endKind, session.endedAt)}</span></td>
        </tr>)}</tbody>
      </table>
      {sessions.length > 3 ? <button className="job-people__expand" type="button" aria-expanded={expanded} aria-controls={`${id}-sessions`} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Restrânge sesiunile' : `Vezi toate cele ${sessions.length} sesiuni`}
      </button> : null}
    </> : <p className="job-record__note">Fără sesiuni înregistrate.</p>}
  </article>;
}
