import type { JobRecord } from "../../../../api/jobRecord";
import { countLabel } from "../../dossier/historyModel";
import { stageCounts, stageLegend, taskStage } from "../workMemoryModel";

/**
 * R-005 · the progress of the job, said once (1037:38080): every operation of the plan as a cell
 * in plan order, the recorded hours and the people who worked. A missing plan is said, not zeroed;
 * an unreadable record falls back to the job's own progress words from the client's works.
 */
export function MemoryProgress({ hours, fallback }: { hours: JobRecord["hours"] | undefined; fallback: string | null }) {
  if (hours === undefined) {
    return fallback ? (
      <div className="wmem-progress">
        <div className="wmem-progress__part">
          <p className="wmem-kicker">Progres</p>
          <p className="wmem-progress__value">{fallback}</p>
        </div>
      </div>
    ) : null;
  }
  if (hours === null) {
    return (
      <div className="wmem-progress">
        <p className="wmem-progress__missing">Fără plan de execuție înregistrat · ore și persoane neînregistrate</p>
      </div>
    );
  }
  const counts = stageCounts(hours.tasks);
  const people = hours.people.map((person) => person.label);
  return (
    <div className="wmem-progress">
      <div className="wmem-progress__part wmem-progress__ops">
        <p className="wmem-kicker">Operații înregistrate</p>
        {hours.tasks.length ? (
          <ol className="wmem-band" aria-hidden="true">
            {hours.tasks.map((task) => (
              <li key={task.taskId} data-stage={taskStage(task.status)} />
            ))}
          </ol>
        ) : null}
        <p className="wmem-legend">
          {stageLegend(counts).map((entry) => (
            <span key={entry.stage} data-stage={entry.stage}>
              {entry.text}
            </span>
          ))}
        </p>
      </div>
      <div className="wmem-progress__part">
        <p className="wmem-kicker">Ore înregistrate</p>
        <p className="wmem-progress__value">{hours.totalLabel}</p>
        <p className="wmem-progress__note">{hours.coverageLabel}</p>
      </div>
      <div className="wmem-progress__part">
        <p className="wmem-kicker">Au lucrat</p>
        <p className="wmem-progress__value">{people.length ? countLabel(people.length, "persoană", "persoane") : "Nicio persoană înregistrată"}</p>
        {people.length ? <p className="wmem-progress__note">{people.join(" · ")}</p> : null}
      </div>
    </div>
  );
}
