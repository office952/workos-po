import { useMemo, useState } from "react";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { executionHref } from "../routing/appRoute";
import "../styles/surfaces/job-production-map.css";

type Group = { label: string; tasks: ExecutionTaskTransport[] };
type Filter = "all" | "active" | "waiting";
const PER_PAGE = 7;
const active = (task: ExecutionTaskTransport) => task.status === "IN_PROGRESS";
const hasIssue = (task: ExecutionTaskTransport) => Boolean(
  task.startBlockReason || task.externalBlockLabel || task.qualityBlockLabel ||
  task.openReworkEpisode?.status === "OPEN",
);
const viewType = (label: string) =>
  /liter|volum/i.test(label) ? "letters" : /panou|acm|dibond|alucobond/i.test(label) ? "panel" : "generic";

function groupTasks(tasks: ExecutionTaskTransport[]): Group[] {
  const scopes = new Map<string, ExecutionTaskTransport[]>();
  for (const task of tasks) {
    const label = task.scopeLabel.trim() || "Operații generale";
    const group = scopes.get(label) ?? [];
    group.push(task);
    scopes.set(label, group);
  }
  return [...scopes].map(([label, tasks]) => ({ label, tasks }));
}

export function JobProductionMap({
  plan, jobId, jobKind,
}: {
  plan: ExecutionPlanTransport; jobId: string; jobKind?: string;
}) {
  const groups = useMemo(() => groupTasks(plan.tasks), [plan.tasks]);
  const hasComposition = jobKind === "ASSEMBLY" && groups.length > 1;
  const [scope, setScope] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [taskId, setTaskId] = useState<string | null>(null);
  const selectedGroup = groups.find((group) => group.label === scope) ?? (hasComposition ? null : groups[0] ?? null);
  const available = selectedGroup ? selectedGroup.tasks : plan.tasks;
  const search = query.toLocaleLowerCase("ro-RO").trim();
  const filtered = available.filter((task) =>
    (filter === "all" || (filter === "active" ? active(task) : task.waitingFor.length > 0)) &&
    (!search || [task.processLabel, task.scopeLabel, task.seqLabel, task.statusLabel, task.assignmentLabel]
      .some((label) => label.toLocaleLowerCase("ro-RO").includes(search))),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const selected = shown.find((task) => task.taskId === taskId) ??
    shown.find(hasIssue) ?? shown.find(active) ?? shown[0] ?? null;
  const currentScope = selectedGroup?.label ?? (hasComposition ? "Compoziția lucrării" : "Lucrare");
  const activeCount = available.filter(active).length;
  const issueCount = available.filter(hasIssue).length;
  const hasPanel = groups.some((group) => viewType(group.label) === "panel");
  const hasLetters = groups.some((group) => viewType(group.label) === "letters");
  const view = selectedGroup ? viewType(selectedGroup.label) : "composition";
  const previewPanel = hasPanel && (view === "panel" || view === "composition");
  const previewLetters = hasLetters && (view === "letters" || view === "composition");
  const inscription = plan.inscription.trim();
  const displayProduct = plan.productLabel.trim() || "Lucrare în producție";
  const warningTexts = selected ? [
    selected.startBlockReason, selected.externalBlockLabel, selected.qualityBlockLabel,
  ].filter((reason): reason is string => Boolean(reason?.trim())) : [];
  const dependencies = selected ?
    [...new Set([...selected.dependsOnLabels, ...selected.waitingFor])] : [];

  function changeScope(value: string | null) {
    setScope(value); setFilter("all"); setQuery(""); setPage(1); setTaskId(null);
  }
  function changeFilter(value: Filter) {
    setFilter(value); setPage(1); setTaskId(null);
  }

  return (
    <section className="job-dossier" id="job-map" aria-label="Dosarul de producție">
      <div className="job-dossier__lead">
        <div>
          <span className="job-dossier__eyebrow">01 / VEDERE DE ANSAMBLU</span>
          <h2>Ce se întâmplă cu lucrarea</h2>
          <p>Selectează partea lucrării, apoi operația. Detaliile se actualizează fără să pierzi contextul.</p>
        </div>
        {plan.progress ? (
          <div className="job-dossier__metrics" aria-label="Progresul real al planului">
            <div><strong>{plan.progress.completed} / {plan.progress.total}</strong><span>finalizate</span></div>
            <div><strong>{plan.progress.inProgress}</strong><span>în lucru</span></div>
            <div><strong>{plan.progress.waitingDependencies}</strong><span>așteaptă dependențe</span></div>
          </div>
        ) : <span className="job-dossier__eyebrow">{plan.progressLabel}</span>}
      </div>
      {plan.tasks.length === 0 ? (
        <p className="job-dossier__empty">Planul nu conține operații afișabile.</p>
      ) : (
        <div className="job-dossier__workspace">
          <div className="job-dossier__visual">
            <div className="job-dossier__visual-head">
              <span className="job-dossier__eyebrow">COMPONENTELE LUCRĂRII</span>
              <span>{groups.length} {groups.length === 1 ? "SECȚIUNE" : "SECȚIUNI"}</span>
            </div>
            <div className="job-dossier__scopes" role="group" aria-label="Părțile lucrării">
              {hasComposition ? (
                <button type="button" aria-pressed={!selectedGroup} onClick={() => changeScope(null)}>
                  <small>01</small> COMPOZIȚIE
                </button>
              ) : null}
              {groups.map((group, index) => (
                <button type="button" key={group.label}
                  aria-pressed={selectedGroup?.label === group.label || (!hasComposition && !scope && groups[0]?.label === group.label)}
                  onClick={() => changeScope(group.label)}>
                  <small>{String(index + (hasComposition ? 2 : 1)).padStart(2, "0")}</small> {group.label}
                </button>
              ))}
            </div>
            <div className="job-dossier__stage" data-view={view} aria-label="Reprezentare orientativă a lucrării">
              <div className="job-dossier__grid" aria-hidden="true" />
              {previewPanel ? <div className="job-dossier__panel-shape" aria-hidden="true" /> : null}
              {previewLetters && inscription ? (
                <div className="job-dossier__letters" aria-hidden="true">{inscription}</div>
              ) : (
                <div className="job-dossier__fallback" aria-hidden="true">
                  {selectedGroup?.label ?? displayProduct}
                </div>
              )}
              <span className="job-dossier__disclaimer">VIZUAL ORIENTATIV · NU ESTE GEOMETRIE CAD</span>
            </div>
            <div className="job-dossier__visual-foot">
              <div><strong>{currentScope}</strong>
                <span>{selectedGroup ? String(available.length) + " operații în secțiune" : displayProduct}</span>
              </div>
              <div><strong>{activeCount}</strong><span>în lucru</span></div>
            </div>
          </div>

          <div className="job-dossier__operations">
            <div className="job-dossier__operations-title">
              <div>
                <span className="job-dossier__eyebrow">02 / ATELIER · OPERAȚII</span>
                <h3>{selectedGroup ? "Operații · " + selectedGroup.label : "Operațiile lucrării"}</h3>
                <p>{filtered.length} din {available.length} operații afișabile în selecția curentă.</p>
              </div>
              {issueCount > 0 ? <div className="job-dossier__attention"><strong>SEMNALE ÎN SECȚIUNE</strong><span>{issueCount} {issueCount === 1 ? "operație necesită" : "operații necesită"} verificare</span></div> : null}
            </div>
            <div className="job-dossier__tools">
              <div className="job-dossier__filters" role="group" aria-label="Filtrare operații">
                <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")}>TOATE</button>
                <button type="button" aria-pressed={filter === "active"} onClick={() => changeFilter("active")}>ÎN LUCRU</button>
                <button type="button" aria-pressed={filter === "waiting"} onClick={() => changeFilter("waiting")}>DEPENDENȚE</button>
              </div>
              <input aria-label="Caută operație" type="search" placeholder="Caută operație..." value={query}
                onChange={(event) => { setQuery(event.currentTarget.value); setPage(1); setTaskId(null); }} />
            </div>
            <div className="job-dossier__tasks" role="group" aria-label="Operațiile filtrate">
              {shown.map((task) => (
                <button type="button" key={task.taskId} className="job-dossier__task"
                  aria-pressed={task.taskId === selected?.taskId}
                  data-selected={task.taskId === selected?.taskId}
                  onClick={() => setTaskId(task.taskId)}>
                  <span className="job-dossier__seq">{task.seqLabel || "—"}</span>
                  <span className="job-dossier__task-copy"><strong>{task.processLabel || "Operație"}</strong><small>{task.assignmentLabel}</small></span>
                  <span className="job-dossier__task-state">{task.statusLabel}</span>
                  <span className="job-dossier__task-arrow" aria-hidden="true">{hasIssue(task) ? "!" : "↗"}</span>
                </button>
              ))}
              {shown.length === 0 ? <p className="job-dossier__empty">Nu există operații pentru filtrul ales.</p> : null}
            </div>
            <div className="job-dossier__pager">
              <span>{shown.length ? (currentPage - 1) * PER_PAGE + 1 : 0}–{Math.min(currentPage * PER_PAGE, filtered.length)} din {filtered.length}</span>
              <div>
                <button type="button" aria-label="Pagina anterioară" disabled={currentPage <= 1}
                  onClick={() => { setPage(currentPage - 1); setTaskId(null); }}>←</button>
                <span>{currentPage} / {pages}</span>
                <button type="button" aria-label="Pagina următoare" disabled={currentPage >= pages}
                  onClick={() => { setPage(currentPage + 1); setTaskId(null); }}>→</button>
              </div>
            </div>
            <aside className="job-dossier__details" aria-label="Detaliile operației selectate" aria-live="polite">
              {selected ? (
                <>
                  <div className="job-dossier__details-head">
                    <div>
                      <span className="job-dossier__eyebrow">OPERAȚIE SELECTATĂ / {selected.seqLabel || "—"}</span>
                      <h4>{selected.processLabel}</h4>
                      <p>{selected.statusLabel} · {selected.scopeLabel || "Operații generale"}</p>
                    </div>
                    <a href={executionHref(plan.planId, { jobId })}>VEZI ÎN EXECUȚIE ↗</a>
                  </div>
                  <dl className="job-dossier__facts">
                    <div><dt>Alocare</dt><dd>{selected.executorLabel ?? selected.assignmentLabel}</dd></div>
                    <div><dt>Capabilitate</dt><dd>{selected.requiredCapabilityLabel ?? "Nespecificată"}</dd></div>
                    <div><dt>Planificat</dt><dd>{selected.plannedTimeLabel}</dd></div>
                    <div><dt>Realizat</dt><dd>{selected.actualDurationLabel}</dd></div>
                  </dl>
                  {warningTexts.length ? <div className="job-dossier__warning">
                    <strong>Atenționări ale operației</strong>
                    <ul>{[...new Set(warningTexts)].map((s) => <li key={s}>{s}</li>)}</ul>
                  </div> : null}
                  {dependencies.length ? <div className="job-dossier__dependency">
                    <strong>Dependențe raportate</strong>
                    <ul>{dependencies.map((s) => <li key={s}>{s}</li>)}</ul>
                    <small>Etichete din plan; nu sunt transformate în legături către operații ambigue.</small>
                  </div> : null}
                  {selected.materialBlockLabel ? <p className="job-dossier__advisory">
                    Materiale: {selected.materialBlockLabel}. Semnalul nu reprezintă automat un blocaj de execuție.
                  </p> : null}
                </>
              ) : <p>Selectează un alt filtru pentru a vedea operațiile.</p>}
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}
