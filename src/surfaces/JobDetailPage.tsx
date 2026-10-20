import { useEffect, useState } from "react";
import { presentJobProduction } from "../adapters/jobAdapter";
import { TransportError, readTransportErrorCode, readTransportReasons } from "../api/http";
import { fetchJobMaterialPreparation } from "../api/jobMaterials";
import { patchJobPlanning, postJobProduction } from "../api/jobs";
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
import { loadExecutionPlan, loadJobDetail, loadOperatorSession } from "../data/routeLoaders";
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
import { atelierHref, canonicalJobSection, jobHref, quoteHref, type JobSheetSection, type JobSheetSectionInput } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { SiteInstallationContextPanel } from "./SiteInstallationContextPanel";
import { ExecutionActualConsumptionHistory } from "./ExecutionActualConsumption";
import { TaskDossierPanel } from "./TaskDossierPanel";
import { useCloudSession } from "../session/CloudSessionContext";
import { readCloudBoundaryVersion } from "../session/sessionExpiryBridge";
import { canPublishInstructions } from "../presentation/dossierAccess";
import { JobOperationPlan } from "./JobOperationPlan";
import { jobTaskAttentionNotes, jobTaskNotes, presentJobProvider, presentRecordedExecutor } from "../presentation/jobOperationNotes";
import cncIcon from "../assets/job-sheet/cnc.svg";
import { JobOperationFiles } from "./JobOperationFiles";
import "../styles/surfaces/task-dossier.css";
import "../styles/surfaces/job-sheet.css";
import { JobFilesPanel } from "./JobFilesPanel";
import { JobMaterialPreparation } from "./JobMaterialPreparation";
import type { ExecutionTaskTransport } from "../api/types";

type JobDetailPageProps = {
  jobId: string;
  taskId?: string | null;
  section?: JobSheetSectionInput;
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

export function JobDetailPage({ jobId, taskId = null, section: requestedSection = taskId ? "operatii" : "situatie" }: JobDetailPageProps) {
  const section = canonicalJobSection(requestedSection);
  const cloud = useCloudSession();
  const owner = canPublishInstructions(cloud);
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
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
  const resolvedTaskId = chosenTaskId ??
    plan?.tasks.find((task) => task.status === "IN_PROGRESS")?.taskId ??
    plan?.tasks[0]?.taskId ?? null;
  const selectedTask = plan?.tasks.find((task) => task.taskId === resolvedTaskId) ?? null;

  useEffect(() => {
    if (!resolvedTaskId || section !== "operatii") {
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
  const [visitedOperation, setVisitedOperation] = useState(section === "operatii");
  if (section === "operatii" && !visitedOperation) setVisitedOperation(true);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [planningMessage, setPlanningMessage] = useState<string | null>(null);
  if (draftScope !== jobId) {
    setDraftScope(jobId);
    setVisitedOperation(section === "operatii");
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

  async function sendToProduction(): Promise<void> {
    if (!job || actionState === "pending") return;
    setActionState("pending");
    setActionError(null);
    try {
      const prepared = presentJobProduction(await postJobProduction(job.jobId));
      if (!prepared) throw new Error("production_not_confirmed");
      invalidateAfterCreateExecutionPlan(jobId);
      setActionState("idle");
      navigate(jobHref(jobId, { section: "operatii" }));
    } catch (error) {
      setActionState("error");
      const reasons = error instanceof TransportError ? readTransportReasons(error.body) : [];
      setActionError(reasons.join(" ") || "Lucrarea nu a putut fi trimisă în producție. Poți reîncerca în siguranță.");
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
    { value: "operatii", label: "Operații" },
    { value: "documente", label: "Documente și materiale" },
    { value: "rezultate", label: "Rezultate" },
  ];
  const sectionHref = (value: JobSheetSection) => jobHref(jobId, { section: value, taskId: selectedTask?.taskId });
  const operationHref = (id: string) => jobHref(jobId, { taskId: id, section: "operatii" });
  const attentionTasks = (plan?.tasks ?? []).filter(task => task.status !== "COMPLETED" && jobTaskAttentionNotes(task).length > 0);
  const activeTasks = (plan?.tasks ?? []).filter(task => task.status === "IN_PROGRESS" || task.status === "OUTSIDE");
  const resultTasks = (plan?.tasks ?? []).filter(task => task.status === "COMPLETED" || task.completedQuantityLabel !== null || task.actualDurationMinutes !== null);
  const secondary = job ? presentJobSheetSecondary(job) : null;

  return (
    <PageRegion>
      <div className="job-sheet" data-surface="job-detail">
        <header className="job-sheet__header">
          <a className="job-sheet__back" href="/lucrari">← Urmărire producție</a>
          <div className="job-sheet__identity-row">
            <div className="job-sheet__identity">
              <p className="job-sheet__eyebrow">Fișa lucrării</p>
              <h1>{job ? presentJobSheetTitle(job) : "Lucrare"}</h1>
              <p>{job?.customerDisplayName ?? (job ? "Client neînregistrat" : "Se citește lucrarea.")}{secondary ? ` · ${secondary}` : ""}</p>
            </div>
            <div className="job-sheet__header-action">
              {planId ? <a className="job-sheet__link-button" href={atelierHref({ jobId, planId, taskId: selectedTask?.taskId })}>Deschide în Atelier</a> : null}
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
          {section === "operatii" && plan ? <p className="job-sheet__plan-progress">{plan.progressLabel} · {plan.statusLabel}</p> : null}
          {actionError ? <InlineAlert tone="error" title="Acțiunea a eșuat">{actionError}</InlineAlert> : null}
        </header>
        <nav className="job-sheet__tabs" aria-label="Secțiunile lucrării">
          {tabs.map(tab => <a key={tab.value} href={sectionHref(tab.value)} aria-current={section === tab.value ? "page" : undefined}>{tab.label}</a>)}
        </nav>
        <div className="job-sheet__body" data-section={section}>
          {jobResource.status === "error" ? <InlineAlert tone="error" title="Lucrarea nu a putut fi actualizată">{job ? "Ultima citire rămâne afișată." : "Identitatea lucrării nu este disponibilă."}</InlineAlert> : null}
          {!job && jobResource.status !== "error" ? <LoadingFloor variant="traveler" label="Se citește lucrarea" /> : null}
          {planResource.status === "error" ? <InlineAlert tone="error" title="Planul nu a putut fi citit">Datele planului nu au putut fi actualizate.</InlineAlert> : null}
          {job && section === "situatie" ? <div className="job-sheet__overview" data-has-plan={plan !== null}>
            <section className="job-sheet__panel job-sheet__situation" aria-label="Situația producției">
              <div className="job-sheet__progress">
                <h2>{job.stageLabel}</h2>
                <p className="job-sheet__progress-label">{plan?.progressLabel ?? job.progressLabel ?? "Progres neînregistrat"}</p>
                {plan?.progress && plan.progress.total > 0 ? <progress className="job-sheet__progress-meter" aria-label="Operații finalizate" value={plan.progress.completed} max={plan.progress.total} /> : null}
                {plan ? plan.statusLabel !== job.stageLabel ? <p className="job-sheet__secondary">{plan.statusLabel}</p> : null : <p>{presentJobSheetLead(job)}</p>}
              </div>
              {job.stage === "EXECUTION_COMPLETED" ? <p>Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p> : null}
              {job.attentionLabel ? <p className="job-sheet__warning">{job.attentionLabel}</p> : null}
              {!planId && owner ? <Button disabled={actionState === "pending"} onClick={() => void sendToProduction()}>{actionState === "pending" ? "Se pregătește producția…" : "Trimite în producție"}</Button> : null}

            </section>
            {planPending ? <LoadingFloor variant="facts" label="Se citește planul de execuție" rows={3} /> : null}
            {plan ? <section aria-label="Activitate" className="job-sheet__activity"><h2>Activitate</h2>
              {activeTasks.length ? <div className="job-sheet__activity-grid">{activeTasks.map(task => <article className="job-sheet__panel" key={task.taskId}>
                <div className="job-sheet__activity-title">{/router/i.test(task.assignmentLabel) ? <img className="job-sheet__operation-icon" src={cncIcon} width="48" height="48" alt="" /> : <span className="job-sheet__sequence" aria-hidden="true">{task.seqLabel}</span>}<div><h3>{task.seqLabel} · {task.processLabel}</h3><p className="job-sheet__secondary">{task.scopeLabel} · {presentJobProvider(task)}</p></div></div>
                <span className="job-sheet__task-state" data-status={task.status}>{task.statusLabel}</span>
                <p>Executant înregistrat: {presentRecordedExecutor(task)}</p><p className="job-sheet__secondary">Timp efectiv: {task.actualDurationLabel}</p>
                <a className="job-sheet__link-button" href={operationHref(task.taskId)}>Deschide operația</a>
              </article>)}</div> : <p className="job-sheet__secondary">Nicio operație în lucru în acest moment.</p>}
              <div className="job-sheet__continuation"><a className="job-sheet__text-link" href={sectionHref("operatii")}>Vezi operațiile</a><a className="job-sheet__text-link" href={atelierHref({ jobId, returnTo: sectionHref("situatie") })}>Deschide atelierul lucrării</a></div>
            </section> : null}
              {(attentionTasks.length > 0 || materialSummary.length > 0) ? <section className="job-sheet__panel job-sheet__attention" aria-label="De verificat">
                <h3>De verificat</h3>
                <div className="job-sheet__attention-grid">
                  {attentionTasks.slice(0, 4).map(task => <article className="job-sheet__warning" key={task.taskId}><strong>{task.seqLabel} · {task.processLabel}</strong>{jobTaskNotes(task).map(line => <p key={line}>{line}</p>)}<a className="job-sheet__link-button" href={operationHref(task.taskId)}>Vezi operația</a></article>)}
                  {materialSummary.length ? <article className="job-sheet__warning" data-testid="material-preparation-summary">{materialSummary.map(line => <p key={line}>{line}</p>)}<a className="job-sheet__link-button" href={sectionHref("documente")}>Vezi materialul în această fișă</a></article> : null}
                </div>
                {attentionTasks.length > 4 ? <a className="job-sheet__text-link" href={sectionHref("operatii")}>Vezi toate cele {attentionTasks.length} operații de verificat</a> : null}
              </section> : null}
          </div> : null}
          {job && plan ? <section hidden={section !== "operatii"} className="job-sheet__operations" aria-label="Operațiile lucrării">
            <div className="job-sheet__plan"><JobOperationPlan key={`${jobId}:${plan.planId}`} jobId={jobId} plan={plan} selectedTaskId={selectedTask?.taskId} /></div>
            {chosenTaskId && !selectedTask ? <InlineAlert tone="error" title="Operația nu există în această lucrare">Alege o operație din lista de mai sus. Linkul nu a fost înlocuit cu altă operație.</InlineAlert> : null}
            {visitedOperation && selectedTask ? <section className="job-sheet__selected-operation" id="operatie-selectata" aria-label="Dosarul operației selectate">
              <header><div><p className="section-label">Operație selectată · {selectedTask.scopeLabel}</p><h2>{selectedTask.seqLabel} · {selectedTask.processLabel}</h2><p>{selectedTask.statusLabel} · {presentJobProvider(selectedTask)} · {presentRecordedExecutor(selectedTask)}</p></div></header>
              <TaskDossierPanel taskId={selectedTask.taskId} taskLabel={`${selectedTask.seqLabel} ${selectedTask.processLabel}`} canInstruct={owner} operatorIdentified={Boolean(session.data)} canWriteFiles={owner || Boolean(session.data)} sessionScope={[plan.planId, cloud.user?.email ?? "", cloud.organization?.organizationId ?? "", String(readCloudBoundaryVersion()), session.data?.personId ?? ""].join("|")} />
            </section> : null}
          </section> : null}
          {job && section === "operatii" && !plan ? planPending ? <LoadingFloor variant="facts" label="Se citesc operațiile" rows={5} /> : <EmptyState title="Lucrarea nu este încă disponibilă în Atelier." description="Trimite lucrarea în producție din Situație pentru a pregăti operațiile." /> : null}
          {job && section === "documente" ? <>
            {plan ? <JobOperationFiles jobId={jobId} plan={plan} task={selectedTask} onSelect={chooseTask} /> : planPending ? <LoadingFloor variant="facts" label="Se citesc operațiile" rows={2} /> : null}
            <details className="job-sheet__archive"><summary>Biblioteca lucrării — încărcare generală</summary><JobFilesPanel jobId={jobId} /></details>
          </> : null}
          {job && section === "documente" ? <>
            {materialAttention ? <p className="job-sheet__warning">Blocaj de execuție: {materialAttention}</p> : null}
            <JobMaterialPreparation jobId={jobId} returnTo={sectionHref("documente")} />
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
          {job && section === "situatie" ? <details className="job-sheet__source-details" id="sursa" open={window.location.hash === "#sursa" || undefined}><summary>Date comerciale și istoricul lucrării</summary>
            <SurfacePanel title="Date și sursă" label="Date și sursă"><div className="job-sheet__source-grid"><div><h3>{job.kindLabel}{job.inscription ? ` · ${job.inscription}` : ""}</h3><p>{job.productLabel}</p>{job.memberLabels.length > 0 ? <p>{job.memberLabels.join(" · ")}</p> : null}<dl className="job-sheet__facts"><div><dt>Următoarea acțiune</dt><dd>{job.nextActionLabel}</dd></div></dl></div><div><h3>Sursă comercială acceptată</h3><p className="job-sheet__secondary">Oferta acceptată rămâne istoricul comercial al lucrării.</p>{sourceHref ? <a className="job-sheet__link-button" href={sourceHref}>{job.kind === "ASSEMBLY" ? "Deschide ansamblul sursă" : "Deschide oferta sursă"}</a> : <p className="job-sheet__secondary">Legătura către sursă nu este disponibilă.</p>}</div></div></SurfacePanel>
            {jobResource.data?.siteInstallation ? <SiteInstallationContextPanel context={jobResource.data.siteInstallation} /> : null}
            <SurfacePanel title="Traseu de producție"><LifecycleList steps={presentJobLifecycle(job)} /></SurfacePanel>
          </details> : null}
        </div>
      </div>
    </PageRegion>
  );
}
