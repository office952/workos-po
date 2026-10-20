import type { ReactNode } from 'react';
import type { JobRecord } from '../api/jobRecord';
import { RecordIcon } from './jobRecord/presentation';
import { JobRecordSummary } from './jobRecord/JobRecordSummary';
import { JobRecordFiles } from './jobRecord/JobRecordFiles';
import { JobRecordHours } from './jobRecord/JobRecordHours';
import { JobRecordResults } from './jobRecord/JobRecordResults';
import { JobRecordPeople, JobRecordHistory } from './jobRecord/JobRecordHistory';
import '../styles/surfaces/job-record.css';

export function JobRecordView({ record, canWriteFiles, operationHref, operationDetail }: { record: JobRecord | null; canWriteFiles: boolean; operationHref: (id: string) => string; operationDetail?: ReactNode }) {
  return <div className="job-record">
    {record ? <JobRecordSummary record={record}/> : null}
    {record ? <nav className="job-record__anchors" aria-label="Repere în fișa lucrării">
      <a href="#fisiere"><RecordIcon kind="file"/>Fișiere · {record.files.length}</a>
      <a href="#ore"><RecordIcon kind="hours"/>Operații și ore</a>
      <a href="#rezultate"><RecordIcon kind="check"/>Rezultate</a>
      <a href="#oameni"><RecordIcon kind="people"/>Oameni</a>
      <a href="#cronologie"><RecordIcon kind="history"/>Cronologie</a>
    </nav> : null}
    {record ? <JobRecordFiles record={record} canWriteFiles={canWriteFiles} operationHref={operationHref}/> : null}
    <JobRecordHours record={record} operationHref={operationHref} operationDetail={operationDetail}/>
    {record ? <JobRecordResults tasks={record?.hours?.tasks ?? []} operationHref={operationHref}/> : null}
    {record ? <JobRecordPeople hours={record.hours}/> : null}
    {record ? <JobRecordHistory events={record.timeline} operationHref={operationHref}/> : null}
  </div>;
}
