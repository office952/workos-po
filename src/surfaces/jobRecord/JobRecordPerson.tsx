import { useId, useState } from 'react';
import type { WorkHoursTask } from '../../api/jobRecord';
import { moment } from './format';
import { sessionCount, taskEvidence, visibleSessions, type PersonRecord } from './peopleModel';
import { RecordIcon } from './presentation';
import { WorkSessionTimeline } from './WorkSessionTimeline';

function sessionEnd(kind: string | null, endedAt: string | null) {
  if (!endedAt) return 'Activă acum';
  if (kind === 'COMPLETED') return 'La finalizarea operației';
  if (kind === 'LEFT') return 'A ieșit';
  return 'Închidere neprecizată';
}

function crossesMidnight(start: string, end: string) {
  const a = new Date(start), b = new Date(end);
  return Number.isFinite(+a) && Number.isFinite(+b) && a.toDateString() !== b.toDateString();
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
  return <article className="job-people__person" data-active={active} aria-labelledby={`${id}-name`}>
    <header className="job-people__person-head">
      <span className="job-people__avatar" data-active={active} aria-hidden="true">{row.person.label.split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</span>
      <div className="job-people__identity"><h4 id={`${id}-name`}>{row.person.label}</h4>
        {active ? <p className="job-people__person-state" data-active="true">Acum la {row.active.map(({ task }) => `${task.seqLabel} · ${task.processLabel}`).join(', ')}</p>
          : last ? <p className="job-people__person-state">Ultima ieșire <time dateTime={last}>{moment(last)}</time></p> : null}
      </div>
      <div className="job-people__person-total" data-scope={selectedTask ? 'operation' : 'job'}>
        <span>{selectedTask ? `La operația ${selectedTask.seqLabel}` : 'Total persoană · lucrare'}</span>
        <strong>{selectedTask ? selected?.contribution?.timeLabel ?? 'Neînregistrat' : row.person.timeLabel}</strong>
        {selectedTask ? <small className="job-people__person-job">Total persoană · lucrare <b>{row.person.timeLabel}</b></small> : null}
        <small>{sessionCount(sessions.length)}{sessions.some(({ session }) => !session.endedAt) ? ' · provizoriu' : ''}</small>
      </div>
    </header>
    <div className="job-people__contributions" role="group" aria-label={`Operațiile persoanei ${row.person.label}`}>
      {row.operations.map(({ task, contribution }) => {
        const gap = taskEvidence(task).undocumented;
        return <button key={task.taskId} type="button" aria-pressed={selectedTask?.taskId === task.taskId}
          onClick={() => onSelectTask(task.taskId)} title={task.scopeLabel} data-gap={gap}>
          <span>{task.seqLabel}</span> {task.processLabel} <strong>{contribution?.timeLabel ?? 'Neînregistrat'}</strong>
          {gap ? <><RecordIcon kind="warning"/><span className="u-visually-hidden">operație cu evidență parțială</span></> : null}
        </button>;
      })}
    </div>
    {sessions.length ? <>
      <table className="job-people__sessions" id={`${id}-sessions`}>
        <caption>Sesiunile persoanei {row.person.label}{selectedTask ? ` la operația ${selectedTask.seqLabel}` : ''} · afișate {shown.length} din {sessions.length}</caption>
        <thead><tr><th scope="col">Operație</th><th scope="col">Intrare</th><th scope="col">Ieșire</th><th scope="col">Durată</th><th scope="col">Închidere</th></tr></thead>
        <tbody>{shown.map(({ session, task }) => <tr key={session.sessionId} data-active={!session.endedAt}>
          <td data-label="Operație"><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><small>{task.scopeLabel}</small></td>
          <td data-label="Intrare"><time dateTime={session.startedAt}>{moment(session.startedAt)}</time></td>
          <td data-label="Ieșire">{session.endedAt ? <><time dateTime={session.endedAt}>{moment(session.endedAt)}</time>
            {crossesMidnight(session.startedAt, session.endedAt) ? <small className="job-people__next-day">după miezul nopții</small> : null}</> : 'Încă activă'}</td>
          <td data-label="Durată"><strong>{session.timeLabel}</strong>{!session.endedAt ? <small>până la citire</small> : null}</td>
          <td data-label="Închidere"><span className="job-people__end" data-active={!session.endedAt}>{sessionEnd(session.endKind, session.endedAt)}</span></td>
        </tr>)}</tbody>
      </table>
      <div className="job-people__person-foot">
        {sessions.length > 3 ? <p className="job-people__shown">{shown.length < sessions.length
          ? `Afișate ${shown.length} din ${sessions.length}: cele mai recente${shown.some(({ session }) => !session.endedAt) ? '; sesiunea activă rămâne afișată' : ''}.`
          : `Toate cele ${sessions.length} sesiuni sunt afișate.`}</p> : null}
        {sessions.length > 3 ? <button className="job-people__expand" type="button" aria-expanded={expanded} aria-controls={`${id}-sessions`} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Restrânge sesiunile' : `Vezi toate cele ${sessions.length} sesiuni`}
        </button> : null}
        <WorkSessionTimeline sessions={row.sessions} asOf={asOf} selectedTask={selectedTask?.taskId ?? ''}/>
      </div>
    </> : <p className="job-record__note">Fără sesiuni înregistrate{selectedTask ? ` la operația ${selectedTask.seqLabel}` : ''}.</p>}
  </article>;
}
