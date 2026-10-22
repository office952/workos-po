import { useRef, type KeyboardEvent } from "react";
import type { JobListItemTransport } from "../../api/types";
import { formatCount } from "../desk/deskKeys";
import type { DeskLayout } from "../desk/useDeskLayout";
import { jobName, stationTally } from "./jobRegistryModel";

type Props = {
  items: readonly JobListItemTransport[];
  ready: boolean;
  stage: string | null;
  layout: DeskLayout;
  onStage: (stage: string | null) => void;
};

const TOKENS = 3;

/**
 * The production line: one station per stage, with the number of jobs and their tokens.
 * A station is a filter; pressing it again clears the filter.
 */
export function ProductionLine({ items, ready, stage, layout, onStage }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stations = stationTally(items);
  const compact = layout === "full";

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div ref={rootRef} className="jline" data-compact={compact || undefined} role="group" aria-label="Linia de producție: filtru pe etapă" onKeyDown={onKeyDown}>
      {stations.map((station) => {
        const hidden = station.jobs.length - TOKENS;
        return (
          <button
            key={station.stage}
            type="button"
            className="jline__station"
            data-empty={station.count === 0 || undefined}
            aria-pressed={stage === station.stage}
            aria-label={`${station.label}: ${ready ? station.count : "—"} lucrări`}
            onClick={() => onStage(stage === station.stage ? null : station.stage)}
          >
            <span className="jline__head">
              <span className="jline__count">{ready ? formatCount(station.count) : "—"}</span>
              <span className="jline__label">{compact ? station.short : station.label}</span>
            </span>
            <span className="jline__track" aria-hidden="true"><span className="jline__node" /></span>
            {compact ? null : (
              <span className="jline__tokens" aria-hidden="true">
                {station.jobs.slice(0, TOKENS).map((job) => (
                  <span key={job.jobId} className="jline__token" data-attention={job.needsAttention || undefined} title={jobName(job)}>
                    {job.inscription || jobName(job)}
                  </span>
                ))}
                {hidden > 0 ? <span className="jline__token" data-more>{`+${hidden}`}</span> : null}
                {station.count === 0 ? <span className="jline__none">—</span> : null}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
