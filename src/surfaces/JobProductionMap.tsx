import { useMemo, useState } from "react";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { executionHref } from "../routing/appRoute";
import "../styles/surfaces/job-production-map.css";

type TaskGroup = { label: string; tasks: ExecutionTaskTransport[] };
type LinkedTask = { task: ExecutionTaskTransport; relation: "before" | "after" };

function groupTasks(tasks: ExecutionTaskTransport[]): TaskGroup[] {
  const groups = new Map<string, ExecutionTaskTransport[]>();
  for (const task of tasks) {
    const label = task.scopeLabel.trim() || "Operații generale";
    const group = groups.get(label) ?? [];
    group.push(task);
    groups.set(label, group);
  }
  return [...groups].map(([label, items]) => ({ label, tasks: items }));
}

/* Signals come from the engine, not from assumed material readiness or a UI status machine. */
function hasSignal(task: ExecutionTaskTransport): boolean {
  return Boolean(
    task.startBlockReason ||
    task.externalBlockLabel ||
    task.qualityBlockLabel ||
    task.openReworkEpisode?.status === "OPEN",
  );
}

function taskCaption(task: ExecutionTaskTransport): string {
  return [task.seqLabel, task.processLabel].filter(Boolean).join(" · ");
}

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
  const taskLookup = useMemo(
    () => new Map(plan.tasks.map((task) => [task.taskId, task])),
    [plan.tasks],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    (selectedId ? taskLookup.get(selectedId) : null) ??
    plan.tasks.find(hasSignal) ??
    plan.tasks.find((task) => task.status === "IN_PROGRESS") ??
    plan.tasks[0] ??
    null;

  const selectedGroupLabel = selected?.scopeLabel.trim() || "Operații generale";
  const selectedGroup = groups.find((group) => group.label === selectedGroupLabel) ?? groups[0];
  const predecessors: LinkedTask[] = (selected?.waitingFor ?? []).flatMap((id) => {
    const task = taskLookup.get(id);
    return task ? [{ task, relation: "before" as const }] : [];
  });
  const successors: LinkedTask[] = selected
    ? plan.tasks
        .filter((task) => task.taskId !== selected.taskId && task.waitingFor.includes(selected.taskId))
        .map((task) => ({ task, relation: "after" as const }))
    : [];
  const dependencyLabels = selected?.dependsOnLabels ?? [];
  const seenPredecessorIds = new Set(predecessors.map(({ task }) => task.taskId));
  const extraDependencyLabels = dependencyLabels.filter(
    (label) => !predecessors.some(({ task }) => label.includes(task.processLabel)),
  );
  const unknownPredecessors = (selected?.waitingFor ?? []).filter((id) => !seenPredecessorIds.has(id));
  const messages = selected
    ? [
        selected.startBlockReason,
        selected.externalBlockLabel,
        selected.qualityBlockLabel,
      ].filter((message): message is string => Boolean(message?.trim()))
    : [];
  const uniqueMessages = [...new Set(messages)];
  const totalSignals = plan.tasks.filter(hasSignal).length;
  const progress = plan.progress;

  function chooseTask(id: string): void {
    if (taskLookup.has(id)) {
      setSelectedId(id);
    }
  }

  if (!plan.tasks.length) {
    return (
      <section className="job-map" id="job-map" aria-label="Harta producției">
        <div className="job-map__heading">
          <div>
            <span className="job-map__eyebrow">PLAN OPERAȚIONAL</span>
            <h2>Harta producției</h2>
          </div>
        </div>
        <p className="job-map__empty">Planul nu conține operații afișabile.</p>
      </section>
    );
  }

  return (
    <section className="job-map" id="job-map" aria-label="Harta producției">
      <div className="job-map__heading">
        <div className="job-map__heading-copy">
          <span className="job-map__eyebrow">PLAN OPERAȚIONAL / TRASEU DIN EXECUȚIE</span>
          <h2>Harta producției</h2>
          <p>Alege un subansamblu sau o operație. WorkOS îți arată relațiile confirmate în plan.</p>
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
      <div className="job-map__workspace">
        <div className="job-map__main">
          <div className="job-map__visual-key">
            <span>SUBANSAMBLE · {groups.length}</span>
            <span>SELECTEAZĂ PENTRU EXPLORARE</span>
          </div>
          <div className="job-map__assemblies" role="group" aria-label="Subansamblele planului">
            {groups.map((group, index) => {
              const active = group.label === selectedGroupLabel;
              const inProgress = group.tasks.filter((task) => task.status === "IN_PROGRESS").length;
              const signals = group.tasks.filter(hasSignal).length;
              return (
                <button
                  type="button"
                  className="job-map__assembly"
                  data-selected={active}
                  aria-pressed={active}
                  key={group.label}
                  onClick={() => {
                    const next = group.tasks.find(hasSignal) ??
                      group.tasks.find((task) => task.status === "IN_PROGRESS") ??
                      group.tasks[0];
                    if (next) chooseTask(next.taskId);
                  }}
                >
                  <span className="job-map__assembly-top">
                    <span className="job-map__assembly-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="job-map__assembly-mark" aria-hidden="true">↗</span>
                  </span>
                  <span className="job-map__assembly-visual" aria-hidden="true">
                    <span className="job-map__assembly-sheet job-map__assembly-sheet--back" />
                    <span className="job-map__assembly-sheet job-map__assembly-sheet--mid" />
                    <span className="job-map__assembly-sheet job-map__assembly-sheet--front" />
                    <span className="job-map__assembly-axis" />
                  </span>
                  <span className="job-map__assembly-bottom">
                    <strong>{group.label}</strong>
                    <small>{group.tasks.length} {group.tasks.length === 1 ? "operație" : "operații"}</small>
                  </span>
                  <span className="job-map__assembly-signals">
                    {inProgress > 0 ? <span>{inProgress} în lucru</span> : null}
                    {signals > 0 ? <span className="job-map__signal">{signals} {signals === 1 ? "semnal" : "semnale"}</span> : null}
                    {inProgress === 0 && signals === 0 ? <span>Vezi operațiile</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="job-map__schematic-note">Schemă de navigare între subansamble, nu desen tehnic sau geometrie de fabricație.</p>

          <div className="job-map__route-heading">
            <div>
              <span className="job-map__eyebrow">TRASEUL OPERAȚIEI SELECTATE</span>
              <h3>{selected?.processLabel}</h3>
            </div>
            <span className="job-map__route-context">{selectedGroupLabel}</span>
          </div>
          <div className="job-map__trace" aria-label="Dependențe și continuări confirmate">
            <div className="job-map__trace-stage" data-kind="before">
              <span className="job-map__trace-label">01 / DEPIND DE</span>
              {predecessors.length > 0 ? predecessors.map(({ task }) => (
                <button
                  key={task.taskId}
                  type="button"
                  className="job-map__trace-task"
                  onClick={() => chooseTask(task.taskId)}
                  aria-label={task.processLabel}
                >
                  <span className="job-map__trace-task-name">{taskCaption(task)}</span>
                  <small>{task.statusLabel}</small>
                </button>
              )) : (
                <p className="job-map__trace-muted">
                  {unknownPredecessors.length > 0
                    ? "Există referințe nerezolvate în plan."
                    : "Nicio dependență activă identificată."}
                </p>
              )}
            </div>
            <div className="job-map__trace-junction" aria-hidden="true"><span>→</span></div>
            <div className="job-map__trace-stage job-map__trace-stage--selected">
              <span className="job-map__trace-label">02 / ÎN FOCUS</span>
              <strong className="job-map__trace-selected-title">{selected?.processLabel}</strong>
              <span className="job-map__trace-status">{selected?.statusLabel}</span>
              {selected && hasSignal(selected) ? <span className="job-map__trace-signal">Necesită atenție</span> : null}
              {selected?.waitingFor.length ? <span className="job-map__trace-info">Așteaptă operații raportate de plan</span> : null}
            </div>
            <div className="job-map__trace-junction" aria-hidden="true"><span>→</span></div>
            <div className="job-map__trace-stage" data-kind="after">
              <span className="job-map__trace-label">03 / DEPIND DE ACEASTA</span>
              {successors.length > 0 ? successors.map(({ task }) => (
                <button
                  key={task.taskId}
                  type="button"
                  className="job-map__trace-task"
                  onClick={() => chooseTask(task.taskId)}
                  aria-label={task.processLabel}
                >
                  <span className="job-map__trace-task-name">{taskCaption(task)}</span>
                  <small>{task.statusLabel}</small>
                </button>
              )) : <p className="job-map__trace-muted">Nicio continuare directă raportată în plan.</p>}
            </div>
          </div>
          {predecessors.length === 0 && successors.length === 0 ? (
            <p className="job-map__no-links">Lipsa legăturilor vizibile nu confirmă automat eligibilitatea de pornire.</p>
          ) : null}

          <div className="job-map__queue">
            <div className="job-map__queue-title">
              <strong>Operații · {selectedGroup?.label}</strong>
              <span>{selectedGroup?.tasks.length ?? 0} în grup</span>
            </div>
            <div className="job-map__queue-list" role="group" aria-label="Selectează operația din subansamblu">
              {selectedGroup?.tasks.map((task) => {
                const active = selected?.taskId === task.taskId;
                return (
                  <button
                    type="button"
                    key={task.taskId}
                    className="job-map__queue-task"
                    aria-pressed={active}
                    data-selected={active}
                    onClick={() => chooseTask(task.taskId)}
                  >
                    <span className="job-map__queue-index">{task.seqLabel || "·"}</span>
                    <span className="job-map__queue-name">{task.processLabel}</span>
                    <span className="job-map__queue-status">{task.statusLabel}</span>
                    {hasSignal(task) ? <span className="job-map__queue-alert" aria-label="Necesită verificare">!</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="job-map__inspector" aria-label="Detaliile operației selectate" aria-live="polite">
          {selected ? (
            <>
              <span className="job-map__eyebrow">OPERAȚIE SELECTATĂ / {selected.seqLabel || "—"}</span>
              <h3>{selected.processLabel}</h3>
              <p className="job-map__inspector-state">{selected.statusLabel} · {selectedGroupLabel}</p>
              {(uniqueMessages.length > 0 || (jobAttention && totalSignals > 0)) ? (
                <div className="job-map__attention">
                  <strong>Atenționări raportate</strong>
                  {uniqueMessages.length > 0 ? (
                    <ul>{uniqueMessages.map((message) => <li key={message}>{message}</li>)}</ul>
                  ) : (
                    <p>Lucrarea necesită atenție. Verifică operațiile care au un semnal asociat.</p>
                  )}
                </div>
              ) : null}
              <dl className="job-map__facts">
                <div><dt>Responsabil / alocare</dt><dd>{selected.executorLabel ?? selected.assignmentLabel}</dd></div>
                <div><dt>Capabilitate</dt><dd>{selected.requiredCapabilityLabel ?? "Nespecificată"}</dd></div>
                <div><dt>Planificat</dt><dd>{selected.plannedTimeLabel}</dd></div>
                <div><dt>Realizat</dt><dd>{selected.actualDurationLabel}</dd></div>
              </dl>
              {(dependencyLabels.length > 0 || unknownPredecessors.length > 0) ? (
                <div className="job-map__dependencies">
                  <strong>Dependențe raportate</strong>
                  {dependencyLabels.length > 0 ? (
                    <ul>{dependencyLabels.map((label, i) => <li key={i}>{label}</li>)}</ul>
                  ) : <p>Planul raportează operații anterioare.</p>}
                </div>
              ) : null}
              {selected.materialBlockLabel ? (
                <p className="job-map__advisory">
                  Materiale: {selected.materialBlockLabel}. Semnalul nu este automat o interdicție de pornire; motorul decide eligibilitatea.
                </p>
              ) : null}
              <a className="job-map__execute" href={executionHref(plan.planId, { jobId })}>
                Deschide planul în Execuție <span aria-hidden="true">↗</span>
              </a>
              <p className="job-map__fineprint">
                Pornirea, finalizarea și alocarea rămân în Execuție. Traseul vizual nu schimbă regulile motorului.
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
