import { useRef, useState } from 'react';
import type { JobRecord, WorkHoursTask } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { invalidateResources } from '../../data/resourceCache';
import { resourceKeys } from '../../data/resourceKeys';
import { moment } from './format';
import { Heading } from './presentation';
import { activeSessionsLabel, jobEvidence, operationCount, peopleRecords, sessionCount, taskEvidence } from './peopleModel';
import { JobRecordPerson } from './JobRecordPerson';
import '../../styles/surfaces/job-people.css';

type Filter = 'all' | 'active';

function EvidenceBadges({ task }: { task: WorkHoursTask }) {
  const evidence = taskEvidence(task);
  if (task.complete) return <StatusBadge label="Completă" tone="ready"/>;
  return <>
    {evidence.provisional ? <StatusBadge label={`Provizorie · ${activeSessionsLabel(evidence.activeSessions)}`} tone="pending"/> : null}
    {evidence.undocumented ? <StatusBadge label="Parțială · nedocumentată" tone="incomplete"/> : null}
    {evidence.idle ? <StatusBadge label="În lucru · fără activi" tone="neutral"/> : null}
    {!evidence.provisional && !evidence.undocumented && !evidence.idle ? <StatusBadge label={task.coverageLabel} tone="neutral"/> : null}
  </>;
}

export function JobRecordPeople({ record, productionFinished, operationHref }: {
  record: JobRecord;
  productionFinished: boolean;
  operationHref: (id: string) => string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [taskId, setTaskId] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);
  const hours = record.hours;
  const people = hours ? peopleRecords(hours) : [];
  const evidence = hours ? jobEvidence(hours) : null;
  const live = people.flatMap(row => row.active.map(item => ({ ...item, person: row.person })));
  const liveTasks = (hours?.tasks ?? []).map(task => ({ task, rows: live.filter(item => item.task.taskId === task.taskId)
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt)) }))
    .filter(group => group.rows.length > 0);
  const activeCount = people.filter(row => row.active.length > 0).length;
  const selectedTask = hours?.tasks.find(task => task.taskId === taskId);
  const visible = people.filter(row => (filter === 'all' || row.active.length > 0)
    && (!selectedTask || row.operations.some(({ task }) => task.taskId === selectedTask.taskId)));
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Toți', count: people.length },
    { key: 'active', label: 'Lucrează acum', count: activeCount },
  ];
  const clearTask = () => { setTaskId(''); selectRef.current?.focus(); };
  const gaps = evidence?.undocumented ?? [];
  const idle = evidence?.idle ?? [];
  return <section className="job-people" aria-label="Oameni și timp">
    <div className="job-record__section job-people__overview">
      <header className="job-people__head">
        <Heading icon="people">Oameni și timp</Heading>
        <div className="job-people__read">{hours ? <span>Citire <time dateTime={hours.asOf}>{moment(hours.asOf)}</time></span> : null}
          <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}>Actualizează</Button>
        </div>
      </header>
      <dl className="job-people__totals" aria-label="Total lucrare · toate operațiile">
        <div className="job-people__total-main"><dt>Ore de muncă · total lucrare</dt><dd>{hours?.totalLabel ?? 'Neînregistrat'}</dd>
          <small>{evidence?.activeSessions ? 'Provizoriu · crește până la ieșirea celor activi' : 'Suma contribuțiilor persoanelor'}</small></div>
        <div><dt>Timp cu activitate</dt><dd>{hours?.activeTimeLabel ?? 'Neînregistrat'}</dd><small data-aside="true">Suprapunerile se numără o dată</small></div>
        <div><dt>Participanți</dt><dd>{hours ? people.length : 'Neînregistrat'}</dd>
          {hours ? <small>{activeCount} activi acum · {sessionCount(people.reduce((count, row) => count + row.sessions.length, 0))}</small> : null}</div>
        <div className="job-people__evidence"><dt>Evidența orelor</dt><dd>{!hours || !evidence ? 'Indisponibilă' : <span className="job-people__badges">
          {evidence.complete ? <StatusBadge label="Completă" tone="ready"/> : null}
          {evidence.activeSessions ? <StatusBadge label={`Provizorie · ${activeSessionsLabel(evidence.activeSessions)}`} tone="pending"/> : null}
          {gaps.length ? <StatusBadge label={`Parțială · ${operationCount(gaps.length)}`} tone="incomplete"/> : null}
          {idle.length ? <StatusBadge label={`În lucru · ${operationCount(idle.length)} fără activi`} tone="neutral"/> : null}
          {!evidence.complete && !evidence.activeSessions && !gaps.length && !idle.length ? <StatusBadge label={hours.coverageLabel} tone="neutral"/> : null}
        </span>}</dd>
          {hours && hours.applicableTasks > 0 ? <small>{hours.completeTasks} / {hours.applicableTasks} operații documentate complet</small> : null}</div>
      </dl>
      <p className="job-people__other"><span>Durată calendaristică <b>{hours?.elapsedLabel ?? 'Neînregistrat'}</b></span>
        <span>Timp utilaj <b>{hours?.machineTimeLabel ?? 'Neînregistrat'}</b>{hours?.machineActive ? ' · rulări active neincluse' : ''}</span>
        <span className="job-people__other-note">Orele lipsă rămân neînregistrate.</span>
      </p>
      {gaps.length ? <details className="job-people__gaps">
        <summary>De ce este parțială · {operationCount(gaps.length)}</summary>
        <ul>{gaps.map(task => <li key={task.taskId}><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a>
          <span>{task.evidenceGapLabel ?? task.coverageLabel}</span></li>)}</ul>
      </details> : null}
    </div>
    {live.length ? <section className="job-record__section job-people__now" aria-label="Lucrează acum">
      <h3><span className="job-people__pulse" aria-hidden="true"/>Lucrează acum · {activeCount}</h3>
      <div className="job-people__now-grid">{liveTasks.map(({ task, rows }) => <article key={task.taskId} aria-label={`${task.seqLabel} · ${task.processLabel}`}>
        <a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><span>{task.scopeLabel}</span>
        {taskEvidence(task).undocumented ? <span className="job-people__now-gap"><StatusBadge label="Parțială · pornire nedocumentată" tone="incomplete"/></span> : null}
        <ul>{rows.map(({ person, session }) => <li key={session.sessionId}><strong>{person.label}</strong>
          <small>Intrat <time dateTime={session.startedAt}>{moment(session.startedAt)}</time> · {session.timeLabel} până la citire</small></li>)}</ul>
      </article>)}</div>
    </section> : hours ? <section className="job-record__section job-people__now job-people__now--quiet" aria-label="Activitate curentă">
      <p><strong>{productionFinished ? 'Producție finalizată.' : 'Nimeni nu lucrează acum. Lucrarea rămâne în curs.'}</strong>
        <span>{productionFinished ? 'Toate sesiunile sunt închise; contribuțiile rămân pentru consultare.'
          : idle.length ? <>În lucru, fără persoane active: {idle.map((task, i) => <span key={task.taskId}>{i ? ', ' : ''}<a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a></span>)}.</> : 'Nicio operație începută nu are persoane active.'}</span></p>
    </section> : null}
    <section className="job-record__section job-people__register" aria-label="Participanții lucrării">
      <header className="job-people__register-head"><h3>Participanți</h3>
        {!hours ? <p>Evidența participării nu este disponibilă.</p> : null}
      </header>
      <div className="job-people__toolbar">
        <div className="job-people__filters" role="group" aria-label="Filtrează persoanele">{filters.map(item => <button type="button" key={item.key}
          aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} <span className="job-people__count">{item.count}</span></button>)}</div>
        <label className="job-people__operation"><span>Operație</span><select ref={selectRef} value={selectedTask?.taskId ?? ''} onChange={event => setTaskId(event.target.value)}>
          <option value="">Toate operațiile</option>{hours?.tasks.map(task => <option key={task.taskId} value={task.taskId}>{task.seqLabel} · {task.processLabel} · {task.scopeLabel}</option>)}
        </select></label>
      </div>
      {selectedTask ? <div className="job-people__selected">
        <div className="job-people__selected-name"><span>Operația selectată</span><strong>{selectedTask.seqLabel} · {selectedTask.processLabel}</strong><small>{selectedTask.scopeLabel}</small></div>
        <dl><div><dt>Total operație · toate persoanele</dt><dd>{selectedTask.timeLabel}</dd></div>
          <div><dt>Evidență</dt><dd className="job-people__badges"><EvidenceBadges task={selectedTask}/></dd></div></dl>
        <button type="button" className="job-people__clear" onClick={clearTask}>Toate operațiile</button>
        {selectedTask.evidenceGapLabel ? <p className="job-people__selected-gap">{selectedTask.evidenceGapLabel}</p> : null}
      </div> : null}
      <p role="status" className="job-people__result-count">Afișate {visible.length} din {people.length} persoane{selectedTask ? ` · operația ${selectedTask.seqLabel}` : ''}</p>
      {hours && visible.length ? <div className="job-people__list">{visible.map(row => <JobRecordPerson key={row.person.personId} row={row} selectedTask={selectedTask} asOf={hours.asOf}
        onSelectTask={id => setTaskId(current => current === id ? '' : id)} operationHref={operationHref}/>)}</div> : null}
      {!visible.length ? <p className="job-record__empty">{people.length ? 'Nicio persoană nu corespunde filtrelor.' : 'Participanții nu au fost documentați prin sesiuni.'}</p> : null}
    </section>
  </section>;
}
