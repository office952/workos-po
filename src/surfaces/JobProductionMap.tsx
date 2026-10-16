import { useMemo, useState } from "react";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { executionHref } from "../routing/appRoute";
import "../styles/surfaces/job-production-map.css";

type TaskGroup = { label: string; tasks: ExecutionTaskTransport[] };

function groupTasks(tasks: ExecutionTaskTransport[]): TaskGroup[] {
  const groups = new Map<string, ExecutionTaskTransport[]>();
  for (const task of tasks) {
    const label = task.scopeLabel.trim() || "Operații generale";
    const items = groups.get(label) ?? [];
    items.push(task);
    groups.set(label, items);
  }
  return [...groups].map(([label, items]) => ({ label, tasks: items }));
}

function taskHasAttention(task: ExecutionTaskTransport): boolean {
  return Boolean(
    task.startBlockReason ||
      task.externalBlockLabel ||
      task.qualityBlockLabel ||
      task.openReworkEpisode?.status === "OPEN" ||
      task.waitingFor.length > 0,
  );
}

/** Visual grouping only: no eligibility calculation and no synthetic dependency edges. */
export function JobProductionMap({
  plan,
  jobId,
  jobAttention,
}: {
  plan: ExecutionPlanTransport;
  jobId: string;
  jobAttention?: string | null;
}) {
  const groups = useMemo(() => groupTasks(plan.tasks), [plan.tasks]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    plan.tasks.find((task) => task.taskId === selectedId) ??
    plan.tasks.find(taskHasAttention) ??
    plan.tasks[0] ??
    null;
  const dependencies = selected?.dependsOnLabels ?? [];
  const showUnnamedDependencies = (selected?.waitingFor.length ?? 0) > 0 && dependencies.length === 0;
  const messages = selected
    ? [
        selected.startBlockReason,
        selected.externalBlockLabel,
        selected.qualityBlockLabel,
      ].filter((message): message is string =>
        Boolean(message && message.trim() && message.trim() !== jobAttention),
      )
    : [];
  const uniqueMessages = [...new Set(messages)];
  const progress = plan.progress;

  return (
    <section className="job-map" id="job-map" aria-label="Harta producției">
      <div className="job-map__heading">
        <div>
          <span className="job-map__eyebrow">PLAN OPERAȚIONAL / DATE DIN EXECUȚIE</span>
          <h2>Harta producției</h2>
          <p>Operații grupate după contextul din plan. Selectează o operație pentru dependențe și detalii.</p>
        </div>
        <div className="job-map__summary" aria-label="Progres real al planului">
          {progress ? (
            <>
              <div><strong>{progress.completed} / {progress.total}</strong><span>finalizate</span></div>
              <div><strong>{progress.inProgress}</strong><span>în lucru</span></div>
              <div><strong>{progress.waitingDependencies}</strong><span>așteaptă dependențe</span></div>
            </>
          ) : (
            <div><strong>{plan.progressLabel}</strong><span>progres raportat</span></div>
          )}
        </div>
      </div>
      {plan.tasks.length === 0 ? (
        <p className="job-map__empty">Planul nu conține operații afișabile.</p>
      ) : (
        <div className="job-map__workspace">
          <div className="job-map__groups" aria-label="Grupuri de operații">
            {groups.map((group, index) => (
              <section className="job-map__group" key={group.label}>
                <div className="job-map__group-heading">
                  <span className="job-map__group-index">{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{group.label}</h3><p>{group.tasks.length} {group.tasks.length === 1 ? "operație" : "operații"}</p></div>
                </div>
                <div className="job-map__task-list">
                  {group.tasks.map((task) => {
                    const active = selected?.taskId === task.taskId;
                    return (
                      <button
                        key={task.taskId}
                        type="button"
                        className="job-map__task"
                        data-selected={active}
                        data-state={task.status}
                        aria-pressed={active}
                        onClick={() => setSelectedId(task.taskId)}
                      >
                        <span className="job-map__task-order">{task.seqLabel || "·"}</span>
                        <span className="job-map__task-copy">
                          <strong>{task.processLabel || "Operație"}</strong>
                          <small>{task.statusLabel}</small>
                        </span>
                        <span className="job-map__task-indicator" aria-hidden="true">
                          {taskHasAttention(task) ? "!" : active ? "●" : "·"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <aside className="job-map__inspector" aria-label="Detaliile operației selectate" aria-live="polite">
            {selected ? (
              <>
                <span className="job-map__eyebrow">OPERAȚIE SELECTATĂ / {selected.seqLabel || "—"}</span>
                <h3>{selected.processLabel || "Operație"}</h3>
                <p className="job-map__inspector-state">{selected.statusLabel} · {selected.scopeLabel || "Operații generale"}</p>
                <dl className="job-map__facts">
                  <div><dt>Responsabil / alocare</dt><dd>{selected.executorLabel ?? selected.assignmentLabel}</dd></div>
                  <div><dt>Capabilitate</dt><dd>{selected.requiredCapabilityLabel ?? "Nespecificată"}</dd></div>
                  <div><dt>Planificat</dt><dd>{selected.plannedTimeLabel}</dd></div>
                  <div><dt>Realizat</dt><dd>{selected.actualDurationLabel}</dd></div>
                </dl>
                {dependencies.length > 0 || showUnnamedDependencies ? (
                  <div className="job-map__dependencies">
                    <strong>Dependențe raportate</strong>
                    {dependencies.length > 0 ? (
                      <ul>{dependencies.map((label, index) => <li key={index}>{label}</li>)}</ul>
                    ) : (
                      <p>Așteaptă finalizarea unor operații anterioare.</p>
                    )}
                  </div>
                ) : null}
                {uniqueMessages.length > 0 ? (
                  <div className="job-map__attention">
                    <strong>Necesită verificare</strong>
                    <ul>{uniqueMessages.map((message) => <li key={message}>{message}</li>)}</ul>
                  </div>
                ) : null}
                {selected.materialBlockLabel && selected.materialBlockLabel !== jobAttention ? (
                  <p className="job-map__advisory">Materiale: {selected.materialBlockLabel}. Situația materialelor nu este automat o interdicție de execuție.</p>
                ) : null}
                <a className="job-map__execute" href={executionHref(plan.planId, { jobId })}>
                  Deschide planul în Execuție <span aria-hidden="true">↗</span>
                </a>
                <p className="job-map__fineprint">Acțiunile de pornire, finalizare și alocare rămân în Execuție. Eligibilitatea este stabilită de motor.</p>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
