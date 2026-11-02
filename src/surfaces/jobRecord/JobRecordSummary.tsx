import { moment } from './format';
import type { JobRecord, WorkHoursTask } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { invalidateResources } from '../../data/resourceCache';
import { resourceKeys } from '../../data/resourceKeys';
import { sessionPresenceLabel, taskEvidence } from './peopleModel';
import { RecordIcon } from './presentation';

export type JobSummaryContext = { statusLabel: string; progressLabel: string | null; attentionLabel: string | null };

function CurrentActivity({ tasks, operationHref }: { tasks: readonly WorkHoursTask[]; operationHref?: (id: string) => string }) {
  if (!tasks.length) return null;
  return (
    <section className="job-record__activity" aria-label="Activitate în curs">
      <h3>Activitate în curs</h3>
      <div className="job-record__activity-cards">
        {tasks.map((task) => {
          const live = taskEvidence(task).activeSessions > 0;
          const names = task.people.filter((person) => person.active).map((person) => person.label);
          return (
            <article key={task.taskId}>
              <header>
                <RecordIcon kind="hours" />
                <div>
                  <h3>{task.seqLabel} · {task.processLabel}</h3>
                  <p>{task.scopeLabel}{task.providerLabel ? ` · ${task.providerLabel}` : ''}</p>
                </div>
              </header>
              <p className="job-record__status" data-status={task.status}>{task.statusLabel}</p>
              <p className="job-record__session" data-live={live ? 'true' : 'false'}>{sessionPresenceLabel(task)}</p>
              {live && names.length ? <p>{names.join(', ')}</p> : null}
              <p className="job-record__note">Ore de muncă: {task.timeLabel}</p>
              {operationHref ? <a className="job-sheet__link-button" href={operationHref(task.taskId)} aria-label={`Deschide operația ${task.seqLabel} · ${task.processLabel}`}>Deschide operația</a> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function JobRecordSummary({ record, context, operationHref }: { record: JobRecord; context?: JobSummaryContext; operationHref?: (id: string) => string }) {
  const hours = record.hours;
  const activeTasks = hours?.tasks.filter((task) => task.status === 'IN_PROGRESS') ?? [];
  if (!hours) return null;
  return (
    <section className="job-record__summary" aria-label="Totalurile lucrării">
      <header className="job-record__summary-header">
        <h2>Situația lucrării</h2>
        <div>
          <span>Citire: {moment(hours.asOf)}</span>
          <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}>Actualizează evidența</Button>
        </div>
      </header>
      {context?.progressLabel ? <div className="job-record__progress"><strong>Progresul producției</strong><span>{context.progressLabel}</span></div> : null}
      {context?.attentionLabel ? <div className="job-record__attention"><span>{context.attentionLabel}</span>{operationHref ? <a href={operationHref('')}>Vezi operațiile</a> : null}</div> : null}
      <CurrentActivity tasks={activeTasks} operationHref={operationHref} />
      <div className="job-record__metrics">
        <div><span><RecordIcon kind="hours" />Ore de muncă înregistrate</span><strong>{hours.totalLabel}</strong><p>Suma contribuțiilor persoanelor{hours.applicableTasks === 0 ? ' · producție externă' : hours.complete ? '' : ' · total parțial sau provizoriu'}</p></div>
        <div><span><RecordIcon kind="history" />De la început la final</span><strong>{hours.elapsedLabel}</strong><p>Include întreruperile și așteptarea</p></div>
        <div><span><RecordIcon kind="machine" />Timp utilaj înregistrat</span><strong>{hours.machineTimeLabel}</strong><p>{hours.machineActive ? 'Există rulări active · totalul include numai rulările închise' : 'Rulări închise · separat de orele oamenilor'}</p></div>
      </div>
      <div className="job-record__facts">
        <p>Început: {moment(hours.startedAt)} → Final: {moment(hours.completedAt)}</p>
        <p data-complete={hours.complete}>{hours.coverageLabel}{hours.applicableTasks ? ` · ${hours.completeTasks} / ${hours.applicableTasks} operații documentate complet` : ''}</p>
      </div>
      <p className="job-record__note">Durata calendaristică pornește de la prima operație începută și se oprește la ultima finalizată sau la această citire.</p>
    </section>
  );
}
