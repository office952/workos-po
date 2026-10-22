import { moment } from './format';
import type { JobRecord } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { invalidateResources } from '../../data/resourceCache';
import { resourceKeys } from '../../data/resourceKeys';
import { RecordIcon } from './presentation';

export function JobRecordSummary({ record }: { record: JobRecord }) {
  const hours = record.hours;
  return <>    {hours ? <section className="job-record__summary" aria-label="Totalurile lucrării">
      <header className="job-record__summary-header"><h2>Situația lucrării</h2><div><span>Citire: {moment(hours.asOf)}</span><Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}>Actualizează evidența</Button></div></header>
      <div className="job-record__metrics">
        <div><span><RecordIcon kind="hours"/>Ore de muncă înregistrate</span><strong>{hours.totalLabel}</strong><p>Suma contribuțiilor persoanelor{hours.applicableTasks === 0 ? ' · producție externă' : hours.complete ? '' : ' · total parțial sau provizoriu'}</p></div>
        <div><span><RecordIcon kind="history"/>De la început la final</span><strong>{hours.elapsedLabel}</strong><p>Include întreruperile și așteptarea</p></div>
        <div><span><RecordIcon kind="machine"/>Timp utilaj înregistrat</span><strong>{hours.machineTimeLabel}</strong><p>{hours.machineActive ? 'Există rulări active · totalul include numai rulările închise' : 'Rulări închise · separat de orele oamenilor'}</p></div>
      </div>

      <div className="job-record__facts"><p>Început: {moment(hours.startedAt)} → Final: {moment(hours.completedAt)}</p><p data-complete={hours.complete}>{hours.coverageLabel}{hours.applicableTasks ? ` · ${hours.completeTasks} / ${hours.applicableTasks} operații documentate complet` : ''}</p></div><p className="job-record__note">Durata calendaristică pornește de la prima operație începută și se oprește la ultima finalizată sau la această citire.</p>
    </section> : null}
</>;
}
