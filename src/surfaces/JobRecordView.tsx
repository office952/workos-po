import type { ReactNode } from "react";
import type { JobRecord } from "../api/jobRecord";
import type { JobSheetSection } from "../routing/appRoute";
import { JobRecordFiles } from "./jobRecord/JobRecordFiles";
import { JobRecordPeople, JobRecordHistory } from "./jobRecord/JobRecordHistory";
import { JobRecordOperations } from "./jobRecord/JobRecordOperations";
import { JobRecordSummary, type JobSummaryContext } from "./jobRecord/JobRecordSummary";
import "../styles/surfaces/job-record.css";

function Section({ active, section, children }: { active: JobSheetSection; section: JobSheetSection; children: ReactNode }) {
  return <div className="job-sheet__section" hidden={active !== section}>{children}</div>;
}

export function JobRecordView({
  section,
  record,
  canWriteFiles,
  operationHref,
  selectedTaskId,
  selectedLabel,
  invalidTask,
  planUnavailable,
  workspaceHref,
  onOpenTask,
  onCloseTask,
  dossier,
  dates,
  summaryContext,
}: {
  section: JobSheetSection;
  record: JobRecord | null;
  canWriteFiles: boolean;
  operationHref: (id: string) => string;
  selectedTaskId: string | null;
  selectedLabel: string | null;
  invalidTask: boolean;
  planUnavailable: boolean;
  workspaceHref: string | null;
  onOpenTask: (taskId: string) => void;
  onCloseTask: () => void;
  dossier: ReactNode;
  dates: ReactNode;
  summaryContext?: JobSummaryContext;
}) {
  return (
    <div className="job-record job-record-sections">
      <Section active={section} section="situatie">
        {record?.hours ? <JobRecordSummary record={record} context={summaryContext} operationHref={operationHref} /> : record ? (
          <section className="job-record__section" aria-label="Situația lucrării">
            <h2>Situația lucrării</h2>
            <p>Evidența orelor, a duratei calendaristice și a timpului de utilaj nu este disponibilă.</p>
          </section>
        ) : null}
      </Section>
      <Section active={section} section="operatii">
        <JobRecordOperations
          record={record}
          selectedTaskId={selectedTaskId}
          selectedLabel={selectedLabel}
          invalidTask={invalidTask}
          planUnavailable={planUnavailable}
          workspaceHref={workspaceHref}
          onOpen={onOpenTask}
          onClose={onCloseTask}
          dossier={dossier}
        />
      </Section>
      <Section active={section} section="fisiere">
        {record ? <JobRecordFiles record={record} canWriteFiles={canWriteFiles} operationHref={operationHref} /> : null}
      </Section>
      <Section active={section} section="oameni">
        {record ? <JobRecordPeople hours={record.hours} operationHref={operationHref} /> : null}
      </Section>
      <Section active={section} section="istoric">
        {record ? <JobRecordHistory events={record.timeline} operationHref={operationHref} /> : null}
      </Section>
      <Section active={section} section="date">
        {dates}
      </Section>
    </div>
  );
}
