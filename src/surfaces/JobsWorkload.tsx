import { useId, useState } from "react";
import { TransportError, readTransportErrorCode } from "../api/http";
import { postPlannedEffort } from "../api/planning";
import type { PlanningWorkloadTaskTransport } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateAfterExecutionTaskChange } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadPlanningWorkload } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { matchesSearch } from "../presentation/listFilter";
import {
  effortFieldsFromMinutes,
  formatKnownQueuedEffort,
  formatPlannedEffort,
  formatUnknownEffortCount,
  parseEffortFields,
  plannedEffortErrorMessage,
} from "../presentation/plannedEffort";
import { statusTone } from "../presentation/statusTone";
import "../styles/surfaces/jobs-workload.css";
import "../styles/surfaces/production-workspace.css";

/** Optional cross-job view; opening it never allocates or starts work. */
export function JobsWorkload({ active = true }: { active?: boolean }) {
  const workload = useResource(active ? resourceKeys.planningWorkload() : null, loadPlanningWorkload);
  const [query, setQuery] = useState("");
  const [showEstimates, setShowEstimates] = useState(false);
  const [estimateOptionsOpen, setEstimateOptionsOpen] = useState(false);
  const estimateOptionsId = useId();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const data = workload.data;
  const matches = (task: PlanningWorkloadTaskTransport) => matchesSearch(query, [
    task.productLabel, task.inscription, task.processLabel, task.customerDisplayName ?? "",
    task.scopeLabel, task.providerBindingLabel ?? "", task.assignedProvider?.label ?? "",
  ]);
  const providers = (data?.providers ?? []).filter(group => group.tasks.length > 0);
  const shownProviders = providers.map(group => ({
    ...group,
    shownTasks: query.trim() && matchesSearch(query, [group.provider.label]) ? group.tasks : group.tasks.filter(matches),
  })).filter(group => group.shownTasks.length > 0);
  const unassigned = data?.unassigned ?? [];
  const manual = data?.manual ?? [];
  const shownUnassigned = unassigned.filter(matches);
  const shownManual = manual.filter(matches);
  const total = providers.reduce((sum, group) => sum + group.tasks.length, 0) + unassigned.length + manual.length;
  const shown = shownProviders.reduce((sum, group) => sum + group.shownTasks.length, 0) + shownUnassigned.length + shownManual.length;

  function beginEdit(task: PlanningWorkloadTaskTransport): void {
    const fields = effortFieldsFromMinutes(task.plannedEffortMinutes);
    setEditingTaskId(task.taskId);
    setHours(fields.hours);
    setMinutes(fields.minutes);
    setActionError(null);
    setActionSuccess(null);
  }

  async function saveEffort(task: PlanningWorkloadTaskTransport): Promise<void> {
    const parsed = parseEffortFields(hours, minutes);
    if (!parsed.ok) {
      setActionError(plannedEffortErrorMessage(parsed.error));
      return;
    }
    setPending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await postPlannedEffort(task.taskId, parsed.plannedEffortMinutes);
      invalidateAfterExecutionTaskChange(task.executionPlanId);
      setEditingTaskId(null);
      setActionSuccess("Estimarea opțională a fost salvată.");
    } catch (error) {
      setActionError(plannedEffortErrorMessage(error instanceof TransportError ? readTransportErrorCode(error.body) : null));
    } finally {
      setPending(false);
    }
  }

  function rows(tasks: readonly PlanningWorkloadTaskTransport[]) {
    return <ul className="jobs-workload__rows">{tasks.map(task => {
      const title = task.inscription || task.productLabel || task.processLabel;
      const context = [task.customerDisplayName, task.scopeLabel, task.priorityLabel, task.targetDateLabel].filter(Boolean).join(" · ");
      return <li className="jobs-workload__row" key={task.taskId}>
        <div className="jobs-workload__identity">
          {task.jobHref ? <a href={task.jobHref}>{title}</a> : <strong>{title}</strong>}
          <p>{context}</p>
        </div>
        <div className="jobs-workload__operation"><strong>{task.processLabel}</strong>
          {task.providerBindingLabel ? <p>{task.providerBindingLabel}</p> : null}
        </div>
        <StatusBadge label={task.statusLabel} tone={statusTone(task.status === "IN_PROGRESS" ? "warning" : "workflow")} />
        <div className="jobs-workload__actions">
          <a className="jobs-workload__open" href={task.executionHref} aria-label={`Deschide operația · ${task.processLabel} · ${title}`}>Deschide operația</a>
          {showEstimates ? task.canEditEffort ? <button type="button" className="jobs-workload__estimate" disabled={pending} onClick={() => beginEdit(task)}>
            {task.plannedEffortMinutes === null ? "Adaugă estimare" : formatPlannedEffort(task.plannedEffortMinutes)}
          </button> : <span>{formatPlannedEffort(task.plannedEffortMinutes)}</span> : null}
        </div>
        {showEstimates && editingTaskId === task.taskId ? <form className="jobs-workload__editor" aria-label={`Timp estimat pentru ${task.processLabel}`} onSubmit={event => { event.preventDefault(); void saveEffort(task); }}>
          <TextField id={`effort-hours-${task.taskId}`} label="Ore" value={hours} onChange={setHours} inputMode="numeric" disabled={pending} />
          <TextField id={`effort-minutes-${task.taskId}`} label="Minute" value={minutes} onChange={setMinutes} inputMode="numeric" disabled={pending} />
          <Button type="submit" disabled={pending}>Salvează</Button>
          <Button variant="ghost" onClick={() => setEditingTaskId(null)} disabled={pending}>Anulează</Button>
          <p>Opțional. Lasă câmpurile goale pentru a șterge estimarea. Nu este necesară pentru începerea lucrului.</p>
        </form> : null}
      </li>;
    })}</ul>;
  }

  return <section hidden={!active} className="jobs-workload" aria-label="Pe utilaje și zone" data-surface="jobs-workload">
    <div className="jobs-workload__intro"><h2>Pe utilaje și zone</h2><p>Operațiile deschise ale lucrărilor, grupate după resursa folosită. Lucrul începe în Atelier.</p></div>
    {actionError ? <InlineAlert tone="error" title="Estimarea nu s-a salvat">{actionError}</InlineAlert> : null}
    {actionSuccess ? <p role="status">{actionSuccess}</p> : null}
    {active && !data && workload.status !== "error" ? <LoadingFloor label="Se citesc operațiile atelierului" variant="operational" rows={3} /> : null}
    {workload.status === "error" ? <ErrorState title="Operațiile pe utilaje și zone nu au putut fi citite">Reîncearcă deschiderea vederii. Datele de execuție rămân neschimbate.</ErrorState> : null}
    {data ? <>
      <div className="jobs-workload__toolbar">
        <label className="production-search"><span className="u-visually-hidden">Caută în utilaje și zone</span><input type="search" value={query} placeholder="Caută lucrare, client, operație sau utilaj" onChange={event => setQuery(event.target.value)} /></label>
        <span className="jobs-workload__count" role="status">{shown} din {total} operații deschise</span>
        <div className="jobs-workload__options">
          <button type="button" className="jobs-workload__options-toggle" aria-expanded={estimateOptionsOpen} aria-controls={estimateOptionsOpen ? estimateOptionsId : undefined} onClick={() => setEstimateOptionsOpen(open => !open)}>Estimări opționale</button>
          {estimateOptionsOpen ? <div id={estimateOptionsId}>
            <p>Poți consulta sau completa estimări când îți sunt utile.</p>
            <label><input type="checkbox" checked={showEstimates} onChange={event => setShowEstimates(event.target.checked)} /> Afișează estimările</label>
          </div> : null}
        </div>
      </div>
      {total === 0 ? <EmptyState title="Nu există operații deschise." description="Operațiile apar aici după trimiterea lucrării în producție." /> : shown === 0 ? <EmptyState title="Nicio operație pentru această căutare." /> : null}
      {shownUnassigned.length > 0 ? <SurfacePanel variant="flush" label="Resurse de verificat" title="Resurse de verificat" description="O resursă lipsește sau trebuie aleasă dintre mai multe variante eligibile.">{rows(shownUnassigned)}</SurfacePanel> : null}
      <div className="jobs-workload__groups">{shownProviders.map(group => <SurfacePanel key={`${group.provider.kind}:${group.provider.id}`} variant="flush" label={group.provider.label} title={group.provider.label}
        meta={<div className="jobs-workload__summary"><span>{group.shownTasks.length} operații afișate</span>{showEstimates ? <><span>{query.trim() ? "Întregul utilaj / zonă: " : ""}{formatKnownQueuedEffort(group.knownQueuedMinutes, group.unknownEffortCount)}</span>{group.unknownEffortCount > 0 ? <span>{formatUnknownEffortCount(group.unknownEffortCount)}</span> : null}</> : null}</div>}>
        {rows(group.shownTasks)}
      </SurfacePanel>)}</div>
      {shownManual.length > 0 ? <SurfacePanel variant="flush" label="Operații fără utilaj obligatoriu" title="Operații fără utilaj obligatoriu" description="Nu este necesară alocarea unui utilaj sau a unei zone pentru aceste operații.">{rows(shownManual)}</SurfacePanel> : null}
    </> : null}
  </section>;
}
