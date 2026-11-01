import { useId } from "react";
import type { JobRecordFile, WorkHoursTask } from "../../../../api/jobRecord";
import { jobHref } from "../../../../routing/appRoute";
import type { BandMode } from "../../dossier/bandModel";
import { DossierIcon } from "../../dossier/dossierIcons";
import { follow } from "../../dossier/history/follow";
import { consumptionLine, operationGroups, taskFileLines, taskFiles, taskStage, taskWhenLine, type TaskStage } from "../workMemoryModel";

/**
 * R-005 · the operations of the recorded plan (1037:38132), grouped by state; the number keeps the
 * position in the plan. Each row is one link: Enter opens the technical dossier of that operation
 * in Lucrări. Nothing here starts, stops or changes an operation.
 */
export function MemoryOperations({
  jobId,
  tasks,
  files,
  mode,
  emptyText,
  searching,
}: {
  jobId: string;
  tasks: readonly WorkHoursTask[];
  files: readonly JobRecordFile[];
  mode: BandMode;
  emptyText: string | null;
  /** A search shows only what it found: no group is said to be empty because of the filter. */
  searching: boolean;
}) {
  if (emptyText) return <p className="wmem-empty">{emptyText}</p>;
  const groups = operationGroups(tasks).filter((group) => group.tasks.length > 0 || !searching);
  const allDone = !searching && tasks.length > 0 && tasks.every((task) => taskStage(task.status) === "done");
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="wmem-group" data-stage={group.stage} aria-label={`${group.title} · ${group.tasks.length}`}>
          <p className="wmem-group__title" aria-hidden="true">
            <span className="wmem-group__dot" />
            {group.title}
            <span className="wmem-group__count">{group.tasks.length}</span>
          </p>
          {group.tasks.length ? (
            <ol className="wmem-ops" data-stage={group.stage}>
              {group.tasks.map((task) => (
                <OperationRow key={task.taskId} jobId={jobId} task={task} stage={group.stage} files={files} mode={mode} />
              ))}
            </ol>
          ) : (
            <p className="wmem-empty wmem-empty--box">Nicio operație finalizată încă în planul înregistrat.</p>
          )}
        </section>
      ))}
      {allDone ? <p className="wmem-note">În lucru 0 · Urmează 0 — toate operațiile planului sunt înregistrate ca finalizate.</p> : null}
    </>
  );
}

function OperationRow({ jobId, task, stage, files, mode }: { jobId: string; task: WorkHoursTask; stage: TaskStage; files: readonly JobRecordFile[]; mode: BandMode }) {
  const detailsId = useId();
  const href = jobHref(jobId, { section: "operatii", taskId: task.taskId });
  const title = [task.processLabel, task.scopeLabel].filter(Boolean).join(" · ");
  const lines = [
    stage === "other" ? task.statusLabel : null,
    taskWhenLine(task, stage),
    consumptionLine(task, stage),
    stage === "done" ? null : [task.completedQuantityLabel, task.varianceLabel].filter(Boolean).join(" · ") || null,
    task.qualityLabel ?? null,
  ].filter((line): line is string => Boolean(line));
  const fileLines = taskFileLines(taskFiles(task.taskId, files), stage === "planned");
  const timed = stage !== "planned";
  return (
    <li className="wmem-op" data-stage={stage}>
      <a className="wmem-op__link" href={href} onClick={(event) => follow(event, href)} aria-label={`${task.seqLabel} · ${title} · dosarul tehnic`} aria-describedby={detailsId}>
        <span className="wmem-op__seq">
          {stage === "done" ? <DossierIcon name="check" size={13} /> : null}
          {task.seqLabel}
        </span>
        <span className="wmem-op__body" id={detailsId}>
          <span className="wmem-op__title">{title}</span>
          {timed && mode === "phone" ? <span className="wmem-op__line">{`${task.timeLabel} · timp înregistrat`}</span> : null}
          {lines.map((line) => (
            <span key={line} className="wmem-op__line">{line}</span>
          ))}
          {fileLines.map((line) => (
            <span key={line} className="wmem-op__line wmem-op__files">
              <DossierIcon name="file" size={13} />
              {line}
            </span>
          ))}
        </span>
        {timed && mode !== "phone" ? (
          <span className="wmem-op__time">
            <strong>{task.timeLabel}</strong>
            <span>timp înregistrat</span>
          </span>
        ) : null}
        <span className="wmem-op__go">
          {mode === "phone" ? null : <span>Dosarul tehnic</span>}
          <DossierIcon name="right" size={14} />
        </span>
      </a>
    </li>
  );
}
