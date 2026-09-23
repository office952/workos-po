import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import type { JobListItemTransport } from "../api/types";
import { statusTone } from "../presentation/statusTone";
import { jobHref } from "../routing/appRoute";

type LinkedJobsProps = {
  title: string;
  jobs: readonly JobListItemTransport[];
};

export function LinkedJobs({ title, jobs }: LinkedJobsProps) {
  if (jobs.length === 0) {
    return null;
  }
  return (
    <SurfacePanel variant="flush" title={title} label={title}>
      {jobs.map((job) => (
        <WorklistRow
          key={`${job.kind}:${job.jobId}`}
          variant="compact"
          href={jobHref(job.jobId)}
          identity={job.kind === "ASSEMBLY" ? job.productLabel : job.inscription || job.productLabel}
          identityDetail={[job.priorityLabel, job.targetDateLabel].filter(Boolean).join(" · ")}
          context={job.customerDisplayName ?? undefined}
          state={
            <StatusBadge
              label={job.stageLabel}
              tone={statusTone(job.stage === "EXECUTION_COMPLETED" ? "success" : "workflow")}
            />
          }
          actionLabel="Deschide"
        />
      ))}
    </SurfacePanel>
  );
}
