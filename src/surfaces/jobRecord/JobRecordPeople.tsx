import { useState } from 'react';
import type { JobRecord } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { invalidateResources } from '../../data/resourceCache';
import { resourceKeys } from '../../data/resourceKeys';
import { moment } from './format';
import { Heading, RecordIcon } from './presentation';
import { peopleRecords } from './peopleModel';
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
  return <section className="job-people" aria-label="Oameni și timp">
    <div className="job-record__section job-people__overview">
      <header><div><Heading icon="people">Oameni și timp</Heading><p>Cine a lucrat, la ce operații și în ce intervale.</p></div>
        <div className="job-people__read">{hours ? <span>Citire: <time dateTime={hours.asOf}>{moment(hours.asOf)}</time></span> : null}
          <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}>Actualizează evidența</Button>
        </div>
      </header>
      <p className="job-people__kicker">Total lucrare · toate operațiile</p>
      <dl className="job-people__totals">
        <div><dt><RecordIcon kind="hours"/>Ore de muncă înregistrate</dt><dd>{hours?.totalLabel ?? 'Neînregistrat'}</dd><small>Suma contribuțiilor persoanelor</small></div>
        <div><dt><RecordIcon kind="history"/>Timp cu activitate</dt><dd>{hours?.activeTimeLabel ?? 'Neînregistrat'}</dd><small>Suprapunerile se numără o dată</small></div>
        <div><dt><RecordIcon kind="people"/>Participanți înregistrați</dt><dd>{hours ? people.length : 'Neînregistrat'}</dd>{hours ? <small>{activeCount} activi · {people.reduce((count, row) => count + row.sessions.length, 0)} sesiuni</small> : null}</div>
        <div><dt>Evidența orelor</dt><dd className="job-people__coverage" data-complete={hours?.complete}>{hours?.coverageLabel ?? 'Indisponibilă'}</dd>
          {hours && hours.applicableTasks > 0 ? <small>{hours.completeTasks} / {hours.applicableTasks} operații documentate complet</small> : null}
          {live.length ? <small>Include sesiuni active · total provizoriu</small> : null}
        </div>
      </dl>
      <div className="job-people__other"><span>Durată calendaristică: <b>{hours?.elapsedLabel ?? 'Neînregistrat'}</b></span>
        <span>Timp utilaj: <b>{hours?.machineTimeLabel ?? 'Neînregistrat'}</b>{hours?.machineActive ? ' · rulări active neincluse' : ''}</span>
      </div>
      <p className="job-record__note">Orele lipsă rămân neînregistrate. Durata calendaristică include întreruperile și așteptarea.</p>
    </div>
    {live.length ? <section className="job-record__section job-people__now" aria-label="Lucrează acum">
      <h3>Lucrează acum · {activeCount}</h3>
      <div className="job-people__now-grid">{live.map(({ person, task, session }) => <article key={session.sessionId}>
        <strong>{person.label}</strong><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a>
        <span>{task.scopeLabel}</span><small>Intrat: <time dateTime={session.startedAt}>{moment(session.startedAt)}</time> · {session.timeLabel} până la citire</small>
        {live.some(other => other.task.taskId === task.taskId && other.person.personId !== person.personId)
          ? <small>Împreună cu {live.filter(other => other.task.taskId === task.taskId && other.person.personId !== person.personId).map(other => other.person.label).join(', ')}</small> : null}
      </article>)}</div>
    </section> : null}
    <section className="job-record__section job-people__register" aria-label="Participanții lucrării">
      <header><div><h3>Participanți</h3>
        {!live.length ? <p>{!hours ? 'Evidența participării nu este disponibilă.' : productionFinished ? 'Nu există sesiuni active în evidența lucrării finalizate.' : 'Nimeni nu lucrează acum.'}</p> : null}
      </div></header>
      <div className="job-people__toolbar">
        <div className="job-plan__filters" role="group" aria-label="Filtrează persoanele">{filters.map(item => <button type="button" key={item.key}
          aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} · {item.count}</button>)}</div>
        <label className="job-people__operation">Operație<select value={selectedTask?.taskId ?? ''} onChange={event => setTaskId(event.target.value)}>
          <option value="">Toate operațiile</option>{hours?.tasks.map(task => <option key={task.taskId} value={task.taskId}>{task.seqLabel} · {task.processLabel} · {task.scopeLabel}</option>)}
        </select></label>
      </div>
      {selectedTask ? <div className="job-people__selected"><strong>{selectedTask.seqLabel} · {selectedTask.processLabel} · {selectedTask.scopeLabel}</strong>
        <span>Total operație · toate persoanele: <b>{selectedTask.timeLabel}</b></span><span>{selectedTask.coverageLabel}</span>
      </div> : null}
      <p className="job-record__note job-people__axis-note">Axa arată intervalele pe zile, între 00 și 24. Orele exacte sunt în tabel.</p>
      <p role="status" className="job-people__result-count">Afișate {visible.length} din {people.length} persoane{selectedTask ? ` · operația ${selectedTask.seqLabel}` : ''}</p>
      {hours ? visible.map(row => <JobRecordPerson key={row.person.personId} row={row} selectedTask={selectedTask} asOf={hours.asOf}
        onSelectTask={id => setTaskId(current => current === id ? '' : id)} operationHref={operationHref}/>) : null}
      {!visible.length ? <p className="job-record__empty">{people.length ? 'Nicio persoană nu corespunde filtrelor.' : 'Participanții nu au fost documentați prin sesiuni.'}</p> : null}
    </section>
  </section>;
}
