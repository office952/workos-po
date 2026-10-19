import { useEffect, useState } from "react";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { TransportError, readTransportErrorCode } from "../api/http";
import { fetchJobMaterialPreparation } from "../api/jobMaterials";
import { patchJobPlanning, postJobExecutionPlan, postJobProductionRelease } from "../api/jobs";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LifecycleList } from "../components/LifecycleList";
import { LoadingFloor } from "../components/LoadingFloor";
import { MeasurePair } from "../components/MeasurePair";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import {
  invalidateAfterCreateExecutionPlan,
  invalidateAfterProductionRelease,
} from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadExecutionPlan, loadJobDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { PageRegion } from "../layout/PageRegion";
import { presentJobLifecycle } from "../presentation/jobLifecycle";
import { presentMaterialPreparationSummary } from "../presentation/materialPreparationSummary";
import {
  presentJobSheetLead,
  presentJobSheetTitle,
  presentJobSheetSecondary,
} from "../presentation/jobSheetIdentity";
import { formatQuantity } from "../presentation/format";
import { atelierHref, executionHref, jobHref, quoteHref, type JobSheetSection } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { SiteInstallationContextPanel } from "./SiteInstallationContextPanel";
import { ExecutionActualConsumptionHistory } from "./ExecutionActualConsumption";
import { JobTaskWorkbench } from "./JobTaskWorkbench";
import { JobOperationPlan } from "./JobOperationPlan";
import { jobTaskAttentionNotes, jobTaskNotes, presentJobProvider } from "../presentation/jobOperationNotes";
import cncIcon from "../assets/job-sheet/cnc.svg";
import { JobOperationFiles } from "./JobOperationFiles";
import "../styles/surfaces/job-task-workbench.css";
import "../styles/surfaces/job-sheet.css";
import { JobFilesPanel } from "./JobFilesPanel";
import { JobMaterialPreparation } from "./JobMaterialPreparation";
import type { ExecutionTaskTransport } from "../api/types";

type JobDetailPageProps = {
  jobId: string;
  taskId?: string | null;
  section?: JobSheetSection;
};

function TaskMaterialConsumption({ task }: { task: ExecutionTaskTransport }) {
  const planned = task.plannedResources;
  const actual = task.actualConsumption;
  return (
    <div data-testid="material-consumption">
      <p className="section-label">Consum de material</p>
      {planned.length > 0 ? (
        <ul className="execution-actuals__history">
          {planned.map((resource) => (
            <li key={resource.resourceId}>
              <span>{resource.label}</span>
              <span>Planificat: {formatQuantity(resource.plannedQuantity, resource.unit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Consum planificat neînregistrat.</p>
      )}
      {actual.length > 0 ? (
        <ExecutionActualConsumptionHistory actualConsumption={actual} />
      ) : (
        <p data-testid="actual-consumption-missing">Consum efectiv neînregistrat.</p>
      )}
    </div>
  );
}

function jobQualityLabel(task: ExecutionTaskTransport): string {
  if (task.openReworkEpisode?.status === "OPEN") {
    const note =
      task.qualityAttempts?.filter((attempt) => attempt.result === "FAIL").at(-1)?.note ?? null;
    return note
      ? `Respins la control. Corecție deschisă. ${note}`
      : "Respins la control. Corecție deschisă.";
  }
  if (task.latestQualityResult === "FAIL") {
    return "Corecție închisă. Poate fi verificată din nou.";
  }
  if (task.latestQualityResult === "PASS") {
    return "Acceptat la control.";
  }
  return task.qualityBlockLabel ?? task.statusLabel;
}

export function JobDetailPage({ jobId, taskId = null, section = taskId ? "operatie" : "situatie" }: JobDetailPageProps) {
  const jobResource = useResource(resourceKeys.job(jobId), () => loadJobDetail(jobId));
  const job = jobResource.data?.job ?? null;
  const quoteSnapshotId = jobResource.data?.quoteSnapshotId ?? null;
  const quoteHrefValue = jobResource.data?.quoteHref ?? null;
  const planId = jobResource.data?.planId ?? null;
  const planResource = useResource(planId ? resourceKeys.executionPlan(planId) : null, () =>
    loadExecutionPlan(planId ?? ""),
  );
  const plan = planResource.data ?? null;
  const [chosenTaskId, setChosenTaskId] = useState<string | null>(taskId);
  const [trackedUrlTask, setTrackedUrlTask] = useState<string | null>(taskId);
  if (taskId !== trackedUrlTask) {
    setTrackedUrlTask(taskId);
    setChosenTaskId(taskId);
  }
  const resolvedTaskId =
    (chosenTaskId && plan?.tasks.some((task) => task.taskId === chosenTaskId)
      ? chosenTaskId
      : null) ??
    plan?.tasks.find((task) => task.status === "IN_PROGRESS")?.taskId ??
    plan?.tasks[0]?.taskId ??
    null;
  const selectedTask = plan?.tasks.find((task) => task.taskId === resolvedTaskId) ?? null;

  useEffect(() => {
    if (!resolvedTaskId || section !== "operatie") {
      return;
    }
    const next = jobHref(jobId, { taskId: resolvedTaskId, section });
    if (`${window.location.pathname}${window.location.search}` !== next) {
      navigate(next, "replace");
    }
  }, [jobId, resolvedTaskId, section]);

  function chooseTask(nextTaskId: string): void {
    setChosenTaskId(nextTaskId);
    navigate(jobHref(jobId, { taskId: nextTaskId, section }), "replace");
  }
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState(jobId);
  const [visitedOperation, setVisitedOperation] = useState(section === "operatie");
  if (section === "operatie" && !visitedOperation) setVisitedOperation(true);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [planningMessage, setPlanningMessage] = useState<string | null>(null);
  if (draftScope !== jobId) {
    setDraftScope(jobId);
    setVisitedOperation(section === "operatie");
    setChosenTaskId(taskId);
    setTrackedUrlTask(taskId);
    setPriorityDraft(null);
    setTargetDraft(null);
    setPlanningMessage(null);
  }
  const priority = priorityDraft ?? job?.priority ?? "STANDARD";
  const targetDate = targetDraft ?? job?.targetDate ?? "";
  const materialPreparation = useResource(resourceKeys.jobMaterialPreparation(jobId), () =>
    fetchJobMaterialPreparation(jobId),
  );
  const materialSummary = presentMaterialPreparationSummary(materialPreparation);
  const materialAttention = (plan?.tasks ?? [])
    .map((task) => task.materialBlockLabel)
    .filter((label): label is string => Boolean(label))
    .join(" ");

  async function release(): Promise<void> {
    if (!job) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await postJobProductionRelease(job.jobId);
      setActionState("idle");
      invalidateAfterProductionRelease(jobId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Lucrarea nu poate fi eliberată încă."
          : "Eliberarea a eșuat.",
      );
    }
  }

  async function createPlan(): Promise<void> {
    const snapshotId = job?.releaseSnapshotId;
    if (!job || !snapshotId) {
      setActionState("error");
      setActionError("Eliberarea trebuie să existe înainte de plan.");
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      const presented = presentExecutionPlan(await postJobExecutionPlan(job.jobId));
      if (!presented) {
        setActionState("error");
        setActionError("Planul de execuție nu a putut fi prezentat.");
        return;
      }
      setActionState("idle");
      invalidateAfterCreateExecutionPlan(jobId);
      navigate(executionHref(presented.planId, { jobId: job.jobId }));
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Planul nu poate fi creat încă."
          : "Crearea planului a eșuat.",
      );
    }
  }

  async function savePlanning(): Promise<void> {
    if (!job || !job.planningEditable) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    setPlanningMessage(null);
    try {
      await patchJobPlanning(job.jobId, {
        priority,
        targetDate: targetDate.trim() === "" ? null : targetDate.trim(),
      });
      setActionState("idle");
      setPriorityDraft(null);
      setTargetDraft(null);
      setPlanningMessage("Prioritatea și termenul au fost salvate.");
      invalidateAfterProductionRelease(jobId);
    } catch (error) {
      setActionState("error");
      const code = error instanceof TransportError ? readTransportErrorCode(error.body) : null;
      setActionError(
        code === "planning_readonly"
          ? "Lucrarea finalizată nu mai poate fi replanificată."
          : code === "invalid_target_date"
            ? "Termenul trebuie să fie o dată calendaristică."
            : "Planificarea nu a putut fi salvată.",
      );
    }
  }

  const planPending = Boolean(planId) && !plan && planResource.status !== "error";
  const sourceHref =
    job?.kind === "ASSEMBLY"
      ? quoteHrefValue
      : quoteSnapshotId
        ? quoteHref(job?.productCode ?? "", quoteSnapshotId)
        : null;

  const tabs: Array<{ value: JobSheetSection; label: string }> = [
    { value: "situatie", label: "Situație" },
    { value: "fisiere", label: "Fișiere" },
    { value: "materiale", label: "Materiale" },
    { value: "rezultate", label: "Rezultate" },
    { value: "sursa", label: "Date și sursă" },
  ];
  const sectionHref = (value: JobSheetSection) => jobHref(jobId, { section: value, taskId: selectedTask?.taskId });
  const operationHref = (id: string) => jobHref(jobId, { taskId: id, section: "operatie" });
  const attentionTasks = (plan?.tasks ?? []).filter(task => task.status !== "COMPLETED" && jobTaskAttentionNotes(task).length > 0);
  const activeTasks = (plan?.tasks ?? []).filter(task => task.status === "IN_PROGRESS" || task.status === "OUTSIDE");
  const resultTasks = (plan?.tasks ?? []).filter(task => task.status === "COMPLETED" || task.completedQuantityLabel !== null || task.actualDurationMinutes !== null);
  const secondary = job ? presentJobSheetSecondary(job) : null;

  return (
    <PageRegion>
      <div className="job-sheet" data-surface="job-detail">
        <header className="job-sheet__header">
          <a className="job-sheet__back" href={section === "plan" || section === "operatie" ? sectionHref("situatie") : "/lucrari"}>
            {section === "plan" || section === "operatie" ? "← Fișa lucrării" : "← Urmărire producție"}
          </a>
          <div className="job-sheet__identity-row">
            <div className="job-sheet__identity">
              <p className="job-sheet__eyebrow">{section === "plan" ? "Planul operațiilor" : section === "operatie" ? "Dosarul operației" : "Fișa lucrării"}</p>
              <h1>{job ? presentJobSheetTitle(job) : "Lucrare"}</h1>
              <p>{job?.customerDisplayName ?? (job ? "Client neînregistrat" : "Se citește lucrarea.")}{secondary ? ` · ${secondary}` : ""}</p>
            </div>
            <div className="job-sheet__header-action">
              {section === "operatie" ? <a className="job-sheet__link-button" href={sectionHref("plan")}>Înapoi la planul operațiilor</a> : section === "plan" ? plan ? <a className="job-sheet__link-button job-sheet__link-button--primary" href={executionHref(plan.planId, { jobId, taskId: selectedTask?.taskId })}>Deschide execuția</a> : null : planId ? <a className="job-sheet__link-button job-sheet__link-button--primary" href={sectionHref("plan")}>Deschide planul de operații</a> : null}
            </div>
          </div>
          {job ? <div className="job-sheet__planning">
            <span>Prioritate: {job.priorityLabel}</span><span>Termen: {job.targetDateLabel}</span>
            {job.planningEditable ? <details className="job-sheet__planning-editor">
              <summary>Modifică prioritatea și termenul</summary>
              <form onSubmit={event => { event.preventDefault(); void savePlanning(); }}>
                <SelectField id="job-priority" label="Prioritate operațională" value={priority} disabled={actionState === "pending"} options={[{ value: "STANDARD", label: "Standard" }, { value: "HIGH", label: "Ridicată" }, { value: "URGENT", label: "Urgentă" }]} onChange={setPriorityDraft} />
                <TextField id="job-target-date" label="Termen operațional" value={targetDate} hint="Dată calendaristică YYYY-MM-DD. Gol înseamnă fără termen." disabled={actionState === "pending"} onChange={setTargetDraft} />
                <Button type="submit" disabled={actionState === "pending"}>Salvează planificarea</Button>
                {planningMessage ? <p role="status">{planningMessage}</p> : null}
              </form>
            </details> : <span className="job-sheet__secondary">Planificare doar pentru citire</span>}
          </div> : null}
          {section === "plan" && plan ? <p className="job-sheet__plan-progress">{plan.progressLabel} · {plan.statusLabel}</p> : null}
          {actionError ? <InlineAlert tone="error" title="Acțiunea a eșuat">{actionError}</InlineAlert> : null}
        </header>
        {section !== "plan" && section !== "operatie" ? <nav className="job-sheet__tabs" aria-label="Secțiunile lucrării">
          {tabs.map(tab => <a key={tab.value} href={sectionHref(tab.value)} aria-current={section === tab.value ? "page" : undefined}>{tab.label}</a>)}
        </nav> : null}
        <div className="job-sheet__body" data-section={section}>
          {jobResource.status === "error" ? <InlineAlert tone="error" title="Lucrarea nu a putut fi actualizată">{job ? "Ultima citire rămâne afișată." : "Identitatea lucrării nu este disponibilă."}</InlineAlert> : null}
          {!job && jobResource.status !== "error" ? <LoadingFloor variant="traveler" label="Se citește lucrarea" /> : null}
          {planResource.status === "error" ? <InlineAlert tone="error" title="Planul nu a putut fi citit">Datele planului nu au putut fi actualizate.</InlineAlert> : null}
          {job && section === "situatie" ? <div className="job-sheet__overview">
            <section className="job-sheet__panel job-sheet__situation" aria-label="Situația producției">
              <div className="job-sheet__progress">
                <h2>{job.stageLabel}</h2>
                <p className="job-sheet__progress-label">{plan?.progressLabel ?? job.progressLabel ?? "Progres neînregistrat"}</p>
                {plan?.progress && plan.progress.total > 0 ? <progress className="job-sheet__progress-meter" aria-label="Operații finalizate" value={plan.progress.completed} max={plan.progress.total} /> : null}
                {plan ? plan.statusLabel !== job.stageLabel ? <p className="job-sheet__secondary">{plan.statusLabel}</p> : null : <p>{presentJobSheetLead(job)}</p>}
              </div>
              {job.stage === "EXECUTION_COMPLETED" ? <p>Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p> : null}
              {job.attentionLabel ? <p className="job-sheet__warning">{job.attentionLabel}</p> : null}
              {job.nextAction === "RELEASE_TO_PRODUCTION" ? <Button disabled={actionState === "pending"} onClick={() => void release()}>Eliberează pentru producție</Button> : job.nextAction === "CREATE_EXECUTION_PLAN" ? <Button disabled={actionState === "pending"} onClick={() => void createPlan()}>Creează planul de execuție</Button> : null}
              {(attentionTasks.length > 0 || materialSummary.length > 0) ? <div className="job-sheet__attention">
                <h3>De verificat</h3>
                <div className="job-sheet__attention-grid">
                  {attentionTasks.slice(0, 4).map(task => <article className="job-sheet__warning" key={task.taskId}><strong>{task.seqLabel} · {task.processLabel}</strong>{jobTaskNotes(task).map(line => <p key={line}>{line}</p>)}<a className="job-sheet__link-button" href={operationHref(task.taskId)}>Vezi operația</a></article>)}
                  {materialSummary.length ? <article className="job-sheet__warning" data-testid="material-preparation-summary">{materialSummary.map(line => <p key={line}>{line}</p>)}<a className="job-sheet__link-button" href={sectionHref("materiale")}>Vezi materialul în această fișă</a></article> : null}
                </div>
                {attentionTasks.length > 4 ? <a className="job-sheet__text-link" href={sectionHref("plan")}>Vezi toate cele {attentionTasks.length} operații de verificat</a> : null}
              </div> : null}
            </section>
            {planPending ? <LoadingFloor variant="facts" label="Se citește planul de execuție" rows={3} /> : null}
            {plan ? <section aria-label="Activitate" className="job-sheet__activity"><h2>Activitate</h2>
              {activeTasks.length ? <div className="job-sheet__activity-grid">{activeTasks.map(task => <article className="job-sheet__panel" key={task.taskId}>
                <div className="job-sheet__activity-title">{/router/i.test(task.assignmentLabel) ? <img className="job-sheet__operation-icon" src={cncIcon} width="48" height="48" alt="" /> : <span className="job-sheet__sequence" aria-hidden="true">{task.seqLabel}</span>}<div><h3>{task.seqLabel} · {task.processLabel}</h3><p className="job-sheet__secondary">{task.scopeLabel} · {presentJobProvider(task)}</p></div></div>
                <span className="job-sheet__task-state" data-status={task.status}>{task.statusLabel}</span>
                <p>Executant înregistrat: {task.executorLabel ?? task.startedByLabel ?? "Neînregistrat"}</p><p className="job-sheet__secondary">Timp efectiv: {task.actualDurationLabel}</p>
                <a className="job-sheet__link-button" href={operationHref(task.taskId)}>Deschide operația</a>
              </article>)}</div> : <p className="job-sheet__secondary">Nicio operație începută în planul lucrării.</p>}
              <div className="job-sheet__continuation"><a className="job-sheet__text-link" href={executionHref(plan.planId, { jobId, taskId: selectedTask?.taskId })}>Deschide execuția</a><a className="job-sheet__text-link" href={atelierHref({ jobId, returnTo: sectionHref("situatie") })}>Deschide atelierul lucrării</a></div>
            </section> : null}
          </div> : null}
          {job && plan ? <div className="job-sheet__plan" hidden={section !== "plan"}><JobOperationPlan key={`${jobId}:${plan.planId}`} jobId={jobId} plan={plan} /></div> : null}
          {job && section === "plan" && !plan ? planPending ? <LoadingFloor variant="facts" label="Se citește planul" rows={5} /> : planResource.status !== "error" ? <EmptyState title="Planul de execuție nu există încă." /> : null : null}
          {job && visitedOperation && plan ? <div hidden={section !== "operatie"} className="job-sheet__operation"><JobTaskWorkbench key={jobId} jobId={jobId} plan={plan} taskId={selectedTask?.taskId ?? null} onSelect={chooseTask} active={section === "operatie"} /></div> : null}
          {job && section === "operatie" && !plan ? planPending ? <LoadingFloor variant="facts" label="Se citește operația" rows={3} /> : planResource.status !== "error" ? <EmptyState title="Planul de execuție nu există încă." /> : null : null}
          {job && section === "fisiere" ? <>
            {plan ? <JobOperationFiles jobId={jobId} plan={plan} task={selectedTask} onSelect={chooseTask} /> : planPending ? <LoadingFloor variant="facts" label="Se citesc operațiile" rows={2} /> : null}
            <details className="job-sheet__archive"><summary>Biblioteca lucrării — încărcare generală</summary><JobFilesPanel jobId={jobId} /></details>
          </> : null}
          {job && section === "materiale" ? <>
            {materialAttention ? <p className="job-sheet__warning">Blocaj de execuție: {materialAttention}</p> : null}
            <JobMaterialPreparation jobId={jobId} returnTo={sectionHref("materiale")} />
          </> : null}
          {job && section === "rezultate" ? <SurfacePanel title="Rezultate înregistrate" label="Planificat și realizat" busy={planPending}>
            <div className="stack" data-testid="planned-vs-actual">
              {planPending ? <LoadingFloor variant="facts" label="Se citește planul" rows={3} /> : !plan ? planResource.status !== "error" ? <EmptyState title="Planul de execuție nu există încă." /> : null : <>
                <p>{plan.progressLabel}</p>
                {resultTasks.length > 0 ? <div className="job-plan__table-wrap"><table className="job-plan__table job-sheet__results-table"><caption className="u-visually-hidden">Cantități și timp planificat comparate cu rezultatele înregistrate</caption>
                  <thead><tr><th scope="col">Operație</th><th scope="col">Cantitate planificată</th><th scope="col">Cantitate realizată</th><th scope="col">Timp planificat</th><th scope="col">Timp efectiv</th></tr></thead>
                  <tbody>{resultTasks.map(task => <tr key={task.taskId}>
                    <td data-label="Operație"><a href={operationHref(task.taskId)}>{task.seqLabel} · {task.processLabel}</a><span className="job-sheet__secondary">{task.statusLabel}{task.executorLabel ? ` · ${task.executorLabel}` : ""}</span></td>
                    <td data-label="Cantitate planificată">{task.plannedQuantityLabel ?? "Neînregistrată"}</td><td data-label="Cantitate realizată">{task.completedQuantityLabel ?? "Neînregistrată"}</td><td data-label="Timp planificat">{task.plannedTimeLabel}</td><td data-label="Timp efectiv">{task.actualDurationLabel}</td>
                  </tr>)}</tbody>
                </table></div> : <EmptyState title="Niciun rezultat înregistrat încă." />}
                {plan.timeSummary ? <div className="job-sheet__secondary"><p>{plan.timeSummary.plannedKnownLabel}</p><p>{plan.timeSummary.actualKnownLabel}</p></div> : null}
                <details className="job-sheet__results"><summary>Compară {plan.tasks.length} operații — consum, timp și control</summary>
                  {plan.tasks.map(task => <article className="job-sheet__result-detail" key={task.taskId}>
                    <h3>{task.seqLabel} · {task.processLabel}</h3><p className="section-label">Cantitate de lucrare</p>
                    <MeasurePair planned={task.plannedQuantityLabel ?? "Fără cantitate măsurabilă"} actual={task.completedQuantityLabel ?? "—"} />
                    {task.varianceLabel ? <p data-testid="work-quantity-outcome">Cantitate executată: {task.varianceLabel}</p> : <p>{task.statusLabel}</p>}
                    <TaskMaterialConsumption task={task} />
                    {task.executionMode === "EXTERNAL" && task.externalProviderLabel ? <p>{task.externalProviderLabel}</p> : null}
                    {task.qualityControl ? <p data-testid="job-quality-state">{jobQualityLabel(task)}</p> : null}
                    <p>Planificat {task.plannedTimeLabel}</p><p>Realizat {task.actualDurationLabel}</p>{task.timeVarianceLabel ? <p>{task.timeVarianceLabel}</p> : null}{task.machineRunTotalLabel ? <p>Total utilaj — {task.machineRunTotalLabel}</p> : null}
                  </article>)}
                </details>
              </>}
            </div>
          </SurfacePanel> : null}
          {job && section === "sursa" ? <>
            <SurfacePanel title="Date și sursă" label="Date și sursă"><div className="job-sheet__source-grid"><div><h3>{job.kindLabel}{job.inscription ? ` · ${job.inscription}` : ""}</h3><p>{job.productLabel}</p>{job.memberLabels.length > 0 ? <p>{job.memberLabels.join(" · ")}</p> : null}<dl className="job-sheet__facts"><div><dt>Următoarea acțiune</dt><dd>{job.nextActionLabel}</dd></div></dl></div><div><h3>Sursă comercială acceptată</h3><p className="job-sheet__secondary">Oferta acceptată rămâne istoricul comercial al lucrării.</p>{sourceHref ? <a className="job-sheet__link-button" href={sourceHref}>{job.kind === "ASSEMBLY" ? "Deschide ansamblul sursă" : "Deschide oferta sursă"}</a> : <p className="job-sheet__secondary">Legătura către sursă nu este disponibilă.</p>}</div></div></SurfacePanel>
            {jobResource.data?.siteInstallation ? <SiteInstallationContextPanel context={jobResource.data.siteInstallation} /> : null}
            <SurfacePanel title="Traseu de producție"><details><summary>Pașii traseului</summary><LifecycleList steps={presentJobLifecycle(job)} /></details></SurfacePanel>
          </> : null}
        </div>
      </div>
    </PageRegion>
  );
}
