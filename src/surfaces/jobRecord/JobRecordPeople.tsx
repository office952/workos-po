import { useRef, useState } from 'react';
import type { JobRecord } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { invalidateResources } from '../../data/resourceCache';
import { resourceKeys } from '../../data/resourceKeys';
import { moment } from './format';
import { Heading } from './presentation';
import { peopleRecords, sessionCount } from './peopleModel';
import { JobRecordPerson } from './JobRecordPerson';
import '../../styles/surfaces/job-people.css';

type Filter = 'all' | 'active' | 'incomplete';

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
  const live = people.flatMap(row => row.active.map(item => ({ ...item, person: row.person })));
  const activeCount = people.filter(row => row.active.length > 0).length;
  const selectedTask = hours?.tasks.find(task => task.taskId === taskId);
  const visible = people.filter(row => (filter === 'all' || (filter === 'active' ? row.active.length > 0 : row.incomplete))
    && (!selectedTask || row.operations.some(({ task }) => task.taskId === selectedTask.taskId)));
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Toți', count: people.length },
    { key: 'active', label: 'Lucrează acum', count: activeCount },
    { key: 'incomplete', label: 'Evidență incompletă', count: people.filter(row => row.incomplete).length },
  ];
  const clearTask = () => { setTaskId(''); selectRef.current?.focus(); };
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
          {live.length ? <small>Include sesiuni active · total provizoriu</small> : <small data-aside="true">Suma contribuțiilor persoanelor</small>}</div>
        <div><dt>Timp cu activitate</dt><dd>{hours?.activeTimeLabel ?? 'Neînregistrat'}</dd><small data-aside="true">Suprapunerile se numără o dată</small></div>
        <div><dt>Participanți</dt><dd>{hours ? people.length : 'Neînregistrat'}</dd>
          {hours ? <small>{activeCount} activi acum · {sessionCount(people.reduce((count, row) => count + row.sessions.length, 0))}</small> : null}</div>
        <div><dt>Calitatea evidenței</dt><dd className="job-people__coverage" data-complete={hours?.complete}>{hours?.coverageLabel ?? 'Indisponibilă'}</dd>
          {hours && hours.applicableTasks > 0 ? <small>{hours.completeTasks} / {hours.applicableTasks} operații documentate complet</small> : null}</div>
      </dl>
      <p className="job-people__other"><span>Durată calendaristică <b>{hours?.elapsedLabel ?? 'Neînregistrat'}</b></span>
        <span>Timp utilaj <b>{hours?.machineTimeLabel ?? 'Neînregistrat'}</b>{hours?.machineActive ? ' · rulări active neincluse' : ''}</span>
        <span className="job-people__other-note">Orele lipsă rămân neînregistrate; durata calendaristică include pauzele.</span>
      </p>
    </div>
    {live.length ? <section className="job-record__section job-people__now" aria-label="Lucrează acum">
      <h3><span className="job-people__pulse" aria-hidden="true"/>Lucrează acum · {activeCount}</h3>
      <div className="job-people__now-grid">{live.map(({ person, task, session }) => <article key={session.sessionId}>
        <strong>{person.label}</strong><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a>
        <span>{task.scopeLabel}</span><small>Intrat <time dateTime={session.startedAt}>{moment(session.startedAt)}</time> · {session.timeLabel} până la citire</small>
        {live.some(other => other.task.taskId === task.taskId && other.person.personId !== person.personId)
          ? <small>Împreună cu {live.filter(other => other.task.taskId === task.taskId && other.person.personId !== person.personId).map(other => other.person.label).join(', ')}</small> : null}
      </article>)}</div>
    </section> : null}
    <section className="job-record__section job-people__register" aria-label="Participanții lucrării">
      <header className="job-people__register-head"><h3>Participanți</h3>
        {!live.length ? <p>{!hours ? 'Evidența participării nu este disponibilă.' : productionFinished ? 'Nu există sesiuni active în evidența lucrării finalizate.' : 'Nimeni nu lucrează acum.'}</p> : null}
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
          <div><dt>Evidență</dt><dd>{selectedTask.coverageLabel}</dd></div></dl>
        <button type="button" className="job-people__clear" onClick={clearTask}>Toate operațiile</button>
      </div> : null}
      <p role="status" className="job-people__result-count">Afișate {visible.length} din {people.length} persoane{selectedTask ? ` · operația ${selectedTask.seqLabel}` : ''}</p>
      {hours && visible.length ? <div className="job-people__list">{visible.map(row => <JobRecordPerson key={row.person.personId} row={row} selectedTask={selectedTask} asOf={hours.asOf}
        onSelectTask={id => setTaskId(current => current === id ? '' : id)} operationHref={operationHref}/>)}</div> : null}
      {!visible.length ? <p className="job-record__empty">{people.length ? 'Nicio persoană nu corespunde filtrelor.' : 'Participanții nu au fost documentați prin sesiuni.'}</p> : null}
    </section>
  </section>;
}
