import type { JobListItemTransport } from "../../api/types";
import { operationProgress, progressText, ROUTE_MARK_LABEL, routeMarks, STATIONS } from "./jobRegistryModel";

/** Five nodes for the stations; the station names live in the production line above. */
export function MiniRoute({ job }: { job: JobListItemTransport }) {
  const marks = routeMarks(job.stage);
  return (
    <ol className="jline-route" aria-label={`Traseu de producție: ${job.stageLabel}`}>
      {STATIONS.map((station, index) => (
        <li key={station.stage} data-mark={marks[index]}>
          <span className="u-visually-hidden">{`${station.milestone}: ${ROUTE_MARK_LABEL[marks[index] ?? "unknown"]}`}</span>
        </li>
      ))}
    </ol>
  );
}

/** A bar only when the server sends operation counts; otherwise the server label as text. */
export function ProgressBar({ job }: { job: JobListItemTransport }) {
  const progress = operationProgress(job);
  if (!progress) {
    return <span className="jline-progress" data-empty>{progressText(job)}</span>;
  }
  return (
    <span className="jline-progress">
      <span
        className="jline-progress__track"
        role="progressbar"
        aria-label="Operații finalizate"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        aria-valuetext={progressText(job)}
      >
        <span style={{ width: `${Math.round(progress.fraction * 100)}%` }} data-complete={progress.fraction === 1 || undefined} />
      </span>
      <span className="jline-progress__value">{`${progress.completed} / ${progress.total}`}</span>
    </span>
  );
}

export function StageLamp({ job }: { job: JobListItemTransport }) {
  const lit = job.stage !== "ORDER_CREATED" && job.stage !== "";
  return (
    <span className="rdesk-state">
      <span className="rdesk-lamp" data-filled={lit || undefined} aria-hidden="true" />
      {job.stageLabel || "—"}
    </span>
  );
}

export function Deadline({ job }: { job: JobListItemTransport }) {
  const parts: { text: string; tone?: "attention" }[] = [];
  if (job.overdue) parts.push({ text: "Termen depășit", tone: "attention" });
  if (job.priority !== "STANDARD") parts.push({ text: job.priorityLabel, tone: job.priority === "URGENT" ? "attention" : undefined });
  if (job.targetDate) parts.push({ text: `Termen ${job.targetDateLabel}` });
  if (parts.length === 0) return null;
  return (
    <span className="jline-flags">
      {parts.map((part) => (
        <span key={part.text} data-tone={part.tone}>{part.text}</span>
      ))}
    </span>
  );
}
