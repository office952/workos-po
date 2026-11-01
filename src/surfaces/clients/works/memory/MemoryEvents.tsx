import { useState } from "react";
import type { JobRecord } from "../../../../api/jobRecord";
import { DossierIcon } from "../../dossier/dossierIcons";
import { formatDay } from "../../dossier/dossierModel";
import { countWithDe } from "../workMemoryModel";

const RECENT = 5;

/**
 * R-005 · the recorded events (1037:38506), most recent first. Without a search the five latest
 * are shown with a way to see them all; a search shows every match. Read only.
 */
export function MemoryEvents({ events, searching, emptyText }: { events: JobRecord["timeline"]; searching: boolean; emptyText: string | null }) {
  const [all, setAll] = useState(false);
  if (!events.length) return emptyText ? <p className="wmem-empty">{emptyText}</p> : null;
  const latest = [...events].reverse();
  const shown = searching || all ? latest : latest.slice(0, RECENT);
  return (
    <>
      <ol className="wmem-events">
        {shown.map((event) => (
          <li key={event.eventId}>
            <p className="wmem-event__head">
              <span className="wmem-event__day">{formatDay(event.occurredAt)}</span>
              <span className="wmem-event__label">{event.label}</span>
            </p>
            {event.actorLabel || event.taskLabel || event.detail ? <p>{[event.actorLabel, event.taskLabel, event.detail].filter(Boolean).join(" · ")}</p> : null}
          </li>
        ))}
      </ol>
      {!searching && latest.length > RECENT ? (
        <button type="button" className="wmem-more" aria-expanded={all} onClick={() => setAll((value) => !value)}>
          {all ? "Arată doar cele mai recente" : `Arată toate cele ${countWithDe(latest.length, "eveniment", "evenimente")}`}
          <DossierIcon name={all ? "chevronUp" : "chevronDown"} size={14} />
        </button>
      ) : null}
    </>
  );
}
