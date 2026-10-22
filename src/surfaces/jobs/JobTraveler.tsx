import type { JobListItemTransport } from "../../api/types";
import { formatTimestamp } from "../../presentation/format";
import { presentJobWorklistAction } from "../../presentation/worklistAction";
import { jobHref } from "../../routing/appRoute";
import { DeskActions, DeskSheet } from "../desk/DeskDossier";
import { ProgressRing } from "./JobParts";
import { jobName, operationProgress, progressText, ROUTE_MARK_LABEL, routeMarks, STATIONS } from "./jobRegistryModel";

/** Where a presented action lands, said in words; derived from the href the presenter built. */
function destination(href: string, job: JobListItemTransport): string {
  if (href.includes("sectiune=operatii")) return "secțiunea Operații din fișa lucrării";
  if (href === jobHref(job.jobId)) return job.nextAction === "VIEW_COMPLETED" ? "fișa lucrării, în consultare" : "fișa lucrării";
  return "pagina indicată de lucrare";
}

/** The traveler: the job's route, operation progress and next step, on the light table. */
export function JobTraveler({ job }: { job: JobListItemTransport }) {
  const action = presentJobWorklistAction(job);
  const sheetHref = jobHref(job.jobId);
  const marks = routeMarks(job.stage);
  const progress = operationProgress(job);
  const created = formatTimestamp(job.createdAt);
  const destinations = [{ action: action.actionLabel, target: destination(action.actionHref, job) }];
  if (action.actionHref !== sheetHref) destinations.push({ action: "Fișa completă", target: "fișa lucrării" });

  return (
    <DeskSheet
      label={`Fișa de traseu: ${jobName(job)}`}
      actions={
        <DeskActions destinations={destinations}>
          <a className="rdesk-dossier__primary" href={action.actionHref}>
            <span>{action.actionLabel}</span>
            <span aria-hidden="true">→</span>
          </a>
          {action.actionHref !== sheetHref ? (
            <a className="rdesk-dossier__secondary" href={sheetHref}>Fișa completă</a>
          ) : null}
        </DeskActions>
      }
    >
      <p className="rdesk-sheet__head">
        <span>{`Lucrare · ${job.kindLabel}`}</span>
        {created ? <span>{created}</span> : null}
      </p>
      <div className="rdesk-sheet__identity">
        <div>
          <p className="rdesk-sheet__name">{jobName(job)}</p>
          <p className="rdesk-sheet__lead">{job.customerDisplayName ?? "Client neprecizat"}</p>
          {job.inscription && job.inscription !== jobName(job) ? <p className="rdesk-sheet__text">{job.inscription}</p> : null}
        </div>
        <ProgressRing job={job} />
      </div>
      <dl className="rdesk-sheet__facts">
        <div><dt>Tip</dt><dd>{job.kindLabel}</dd></div>
        <div><dt>Prioritate</dt><dd>{job.priorityLabel}</dd></div>
        <div><dt>Termen</dt><dd data-missing={!job.targetDate || undefined}>{job.targetDateLabel}</dd></div>
      </dl>
      <hr className="rdesk-sheet__perforation" />
      <div className="jline-sheet__progress">
        <p className="rdesk-sheet__label">Progres operații</p>
        {progress ? (
          <p className="jline-sheet__value">
            <strong>{`${progress.completed} / ${progress.total}`}</strong>
            <span>finalizate</span>
          </p>
        ) : null}
        <p className="rdesk-sheet__text">{progressText(job)}</p>
      </div>
      <div>
        <p className="rdesk-sheet__list-head">
          <span className="rdesk-sheet__label">Traseu de producție</span>
          <span className="rdesk-sheet__label">Stare</span>
        </p>
        <ol className="rdesk-sheet__list jline-sheet__route">
          {STATIONS.map((station, index) => (
            <li key={station.stage} data-mark={marks[index]}>
              <span className="rdesk-sheet__item-title">{station.milestone}</span>
              <span className="rdesk-sheet__item-value" data-tone={marks[index] === "current" ? "attention" : undefined}>
                {ROUTE_MARK_LABEL[marks[index] ?? "unknown"]}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {job.nextActionLabel ? (
        <p className="rdesk-sheet__note">{`Pas următor: ${job.nextActionLabel}`}</p>
      ) : null}
      {job.attentionLabel ? <p className="rdesk-sheet__note" data-tone="attention">{job.attentionLabel}</p> : null}
    </DeskSheet>
  );
}
