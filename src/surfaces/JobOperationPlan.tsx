import { useId, useState } from "react";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { presentExecutionNextAction } from "../presentation/executionNextAction";
import { jobTaskAttentionNotes, jobTaskNotes, presentJobProvider } from "../presentation/jobOperationNotes";
import { matchesSearch } from "../presentation/listFilter";
import { jobHref } from "../routing/appRoute";

type Filter = "all" | "working" | "attention" | "completed";


export function JobOperationPlan({ jobId, plan }: { jobId: string; plan: ExecutionPlanTransport }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const id = useId();
  const groups: Array<{ value: Filter; label: string; tasks: ExecutionTaskTransport[] }> = [
    { value: "all", label: "Toate", tasks: plan.tasks },
    { value: "working", label: "În lucru", tasks: plan.tasks.filter(task => task.status === "IN_PROGRESS" || task.status === "OUTSIDE") },
    { value: "attention", label: "De verificat", tasks: plan.tasks.filter(task => task.status !== "COMPLETED" && jobTaskAttentionNotes(task).length > 0) },
    { value: "completed", label: "Finalizate", tasks: plan.tasks.filter(task => task.status === "COMPLETED") },
  ];
  const tasks = (groups.find(group => group.value === filter)?.tasks ?? []).filter(task =>
    matchesSearch(query, [
      `${task.seqLabel} ${task.processLabel} ${task.scopeLabel} ${presentJobProvider(task)} ${task.executorLabel ?? task.startedByLabel ?? ""} ${task.statusLabel} ${jobTaskNotes(task).join(" ")}`,
    ]),
  );

  return <section aria-label="Planul operațiilor" className="job-plan">
    <div className="job-plan__toolbar">
      <label className="job-plan__search" htmlFor={id}>
        <span className="u-visually-hidden">Caută operație, componentă sau executant</span>
        <input id={id} type="search" placeholder="Caută operație, componentă sau executant" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="job-plan__filters" role="group" aria-label="Filtrează operațiile">
        {groups.map(group => <button key={group.value} type="button" aria-pressed={filter === group.value} onClick={() => setFilter(group.value)}>{group.label} <span>· {group.tasks.length}</span></button>)}
      </div>
    </div>
    <div className="job-sheet__panel job-plan__table-wrap">
      <table className="job-plan__table">
        <caption className="u-visually-hidden">Operațiile lucrării, starea, executantul înregistrat și resursa alocată</caption>
        <thead><tr><th scope="col">Operație / componentă</th><th scope="col">Stare</th><th scope="col">Executant înregistrat</th><th scope="col">Utilaj / resursă</th><th scope="col">Motiv / de verificat</th></tr></thead>
        <tbody>{tasks.map(task => <tr key={task.taskId}>
          <td data-label="Operație / componentă"><a href={jobHref(jobId, { taskId: task.taskId, section: "operatie" })}>{task.seqLabel} · {task.processLabel}</a><span className="job-sheet__secondary">{task.scopeLabel}</span></td>
          <td data-label="Stare"><span className="job-sheet__task-state" data-status={task.status}>{task.statusLabel}</span></td>
          <td data-label="Executant înregistrat">{task.executorLabel ?? task.startedByLabel ?? "Neînregistrat"}</td>
          <td data-label="Utilaj / resursă">{presentJobProvider(task)}</td>
          <td data-label="Motiv / de verificat">{jobTaskNotes(task).length ? jobTaskNotes(task).map(line => <p key={line}>{line}</p>) : presentExecutionNextAction(task, null)}</td>
        </tr>)}</tbody>
      </table>
      {tasks.length === 0 ? <EmptyState title="Nicio operație în această selecție." /> : null}
    </div>
    <p className="job-sheet__secondary" role="status">{tasks.length} din {plan.tasks.length} operații afișate</p>
  </section>;
}
