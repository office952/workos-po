import { useEffect, useState } from "react";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { TransportError, readTransportErrorCode } from "../api/http";
import { patchJobPlanning, postJobExecutionPlan, postJobProductionRelease } from "../api/jobs";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LifecycleList } from "../components/LifecycleList";
import { LoadingFloor } from "../components/LoadingFloor";
import { MeasurePair } from "../components/MeasurePair";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import {
  invalidateAfterCreateExecutionPlan,
  invalidateAfterProductionRelease,
} from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadExecutionPlan, loadJobDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentJobLifecycle } from "../presentation/jobLifecycle";
import {
  presentJobSheetLead,
  presentJobSheetTitle,
} from "../presentation/jobSheetIdentity";
import { formatQuantity } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref, jobHref, quoteHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { SiteInstallationContextPanel } from "./SiteInstallationContextPanel";
import { ExecutionActualConsumptionHistory } from "./ExecutionActualConsumption";
import { JobTaskWorkbench } from "./JobTaskWorkbench";
import { JobTaskFingerprint } from "./JobTaskFingerprint";
import "../styles/surfaces/job-task-workbench.css";
import { JobFilesPanel } from "./JobFilesPanel";
import { JobMaterialPreparation } from "./JobMaterialPreparation";
import type { ExecutionTaskTransport } from "../api/types";

type JobDetailPageProps = {
  jobId: string;
  taskId?: string | null;
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

export function JobDetailPage({ jobId, taskId = null }: JobDetailPageProps) {
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
    if (!resolvedTaskId) {
      return;
    }
    const next = jobHref(jobId, { taskId: resolvedTaskId });
    if (`${window.location.pathname}${window.location.search}` !== next) {
      navigate(next, "replace");
    }
  }, [jobId, resolvedTaskId]);

  function chooseTask(nextTaskId: string): void {
    setChosenTaskId(nextTaskId);
    navigate(jobHref(jobId, { taskId: nextTaskId }), "replace");
  }
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState(jobId);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [planningMessage, setPlanningMessage] = useState<string | null>(null);
  if (draftScope !== jobId) {
    setDraftScope(jobId);
    setChosenTaskId(taskId);
    setTrackedUrlTask(taskId);
    setPriorityDraft(null);
    setTargetDraft(null);
    setPlanningMessage(null);
  }
  const priority = priorityDraft ?? job?.priority ?? "STANDARD";
  const targetDate = targetDraft ?? job?.targetDate ?? "";
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

  return (
    <SlicePage
      contextLabel="Lucrare"
      currentHref={jobHref(jobId)}
      workspace="traveler"
      surface="job-detail"
      instrument={plan ? <JobTaskFingerprint tasks={plan.tasks} selectedTaskId={selectedTask?.taskId ?? null} onSelect={chooseTask} /> : undefined}
      headerVariant="pilot-compact"
      eyebrow="Lucrare"
      title={job ? presentJobSheetTitle(job) : "Lucrare"}
      lead={job ? presentJobSheetLead(job) : "Se citește lucrarea."}
      meta={job?.customerDisplayName ?? undefined}
      status={
        job ? (
          <StatusBadge
            label={job.stageLabel}
            tone={statusTone(job.stage === "EXECUTION_COMPLETED" ? "success" : "workflow")}
          />
        ) : null
      }
      action={
        job?.nextAction === "RELEASE_TO_PRODUCTION" ? (
          <Button disabled={actionState === "pending"} onClick={() => void release()}>
            Eliberează pentru producție
          </Button>
        ) : job?.nextAction === "CREATE_EXECUTION_PLAN" ? (
          <Button disabled={actionState === "pending"} onClick={() => void createPlan()}>
            Creează planul de execuție
          </Button>
        ) : job &&
          (job.nextAction === "OPEN_EXECUTION" || job.nextAction === "CONTINUE_EXECUTION") &&
          planId ? (
          <a className="hit" href={executionHref(planId, { jobId, taskId: selectedTask?.taskId })}>
            <span className="button button--primary">{job.nextActionLabel}</span>
          </a>
        ) : null
      }
    >
      {jobResource.status === "error" && !job ? (
        <InlineAlert tone="error" title="Lucrarea nu a putut fi citită">
          Identitatea lucrării nu este disponibilă.
        </InlineAlert>
      ) : null}
      {job ? (
        <>
          {job.stage === "EXECUTION_COMPLETED" ? <p className="job-sheet-completed">Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p> : null}
          {job.needsAttention && job.attentionLabel ? <p className="job-sheet-attention">{job.attentionLabel}</p> : null}
          {planResource.status === "error" ? <InlineAlert tone="error" title="Planul nu a putut fi citit">Datele planului nu au putut fi actualizate.</InlineAlert> : null}
          {plan ? <JobTaskWorkbench key={jobId} jobId={jobId} plan={plan} taskId={selectedTask?.taskId ?? null} onSelect={chooseTask} /> : null}
          <SurfacePanel title="Identitate" label="Identitate">
            <div className="job-sheet-context">
              <p>Prioritate {job.priorityLabel}</p>
              <p>Termen {job.targetDateLabel}</p>
              <p>Progres {job.progressLabel ?? "—"}</p>
            </div>
            <dl className="fact-grid">
              <InfoRow label="Tip" value={job.kindLabel} />
              <InfoRow label="Următoarea acțiune" value={job.nextActionLabel} />
              {job.attentionLabel && !job.needsAttention ? <InfoRow label="Mesaj operațional" value={job.attentionLabel} /> : null}
              {materialAttention ? (
                <InfoRow label="Material" value={materialAttention} />
              ) : null}
            </dl>
            {job.memberLabels.length > 0 ? (
              <p>{job.memberLabels.join(" · ")}</p>
            ) : null}
            {sourceHref ? (
              <p>
                <a className="text-link" href={sourceHref}>
                  {job.kind === "ASSEMBLY" ? "Deschide ansamblul" : "Deschide oferta sursă"}
                </a>
              </p>
            ) : null}
            {job.planningEditable ? (
              <details>
                <summary>Editează prioritatea și termenul</summary>
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void savePlanning();
                  }}
                >
                  <SelectField
                    id="job-priority"
                    label="Prioritate operațională"
                    value={priority}
                    disabled={actionState === "pending"}
                    options={[
                      { value: "STANDARD", label: "Standard" },
                      { value: "HIGH", label: "Ridicată" },
                      { value: "URGENT", label: "Urgentă" },
                    ]}
                    onChange={setPriorityDraft}
                  />
                  <TextField
                    id="job-target-date"
                    label="Termen operațional"
                    value={targetDate}
                    hint="Dată calendaristică YYYY-MM-DD. Gol înseamnă fără termen."
                    disabled={actionState === "pending"}
                    onChange={setTargetDraft}
                  />
                  <Button type="submit" disabled={actionState === "pending"}>
                    Salvează planificarea
                  </Button>
                  {planningMessage ? <p className="ui-note">{planningMessage}</p> : null}
                </form>
              </details>
            ) : (
              <p className="ui-note">Lucrarea finalizată are planificarea doar pentru citire.</p>
            )}
            <p className="ui-note">
              Oferta acceptată rămâne sursa istorică. Lucrarea adaugă doar starea
              operațională.
            </p>
            {actionError ? (
              <InlineAlert tone="error" title="Acțiunea a eșuat">
                {actionError}
              </InlineAlert>
            ) : null}
          </SurfacePanel>
          {jobResource.data?.siteInstallation ? (
            <SiteInstallationContextPanel context={jobResource.data.siteInstallation} />
          ) : null}
          {plan ? <details className="job-sheet-archive"><summary>Biblioteca lucrării — încărcare generală, distinctă de fișierele operației</summary><JobFilesPanel jobId={jobId} /></details> : <JobFilesPanel jobId={jobId} />}
          {materialAttention ? <p className="job-sheet-attention">{materialAttention}</p> : null}
          <details>
            <summary>Materiale — sumar, detalii și acțiuni</summary>
            <JobMaterialPreparation
              jobId={jobId}
              returnTo={jobHref(jobId, { taskId: selectedTask?.taskId })}
            />
          </details>
          <SurfacePanel
            title="Traseu de producție"
            description="Indicator compact. Nu este planul de producție."
          >
            <p className="ui-note">
              {plan
                ? plan.progressLabel
                : planPending
                  ? "Se citește planul de execuție."
                  : "Planul nu există încă. După materializare, progresul vine din motorul de execuție."}
            </p>
            <details>
              <summary>Pașii traseului</summary>
              <LifecycleList steps={presentJobLifecycle(job)} />
            </details>
          </SurfacePanel>
          <SurfacePanel
            title="Planificat și realizat"
            label="Planificat și realizat"
            busy={planPending}
          >
            <div className="stack" data-testid="planned-vs-actual">
              {planPending ? (
                <LoadingFloor variant="facts" label="Se citește planul" rows={3} />
              ) : !plan ? (
                <EmptyState title="Planul de execuție nu există încă." />
              ) : (
                <>
                  {plan.timeSummary ? (
                    <div className="stack">
                      <p>{plan.timeSummary.plannedKnownLabel}</p>
                      <p>{plan.timeSummary.actualKnownLabel}</p>
                    </div>
                  ) : null}
                  <p className="ui-note">Sumarul este pe lucrare. Detaliile stau pe operația selectată; comparația se deschide la cerere.</p>
                  <details className="job-sheet-results"><summary>Compară {plan.tasks.length} operații</summary>
                  {plan.tasks.map((task) => (
                    <div key={task.taskId} className="stack">
                      <p className="section-label">
                        {task.seqLabel} {task.processLabel}
                      </p>
                      <p className="section-label">Cantitate de lucrare</p>
                      <MeasurePair
                        planned={task.plannedQuantityLabel ?? "Fără cantitate măsurabilă"}
                        actual={task.completedQuantityLabel ?? "—"}
                      />
                      {task.varianceLabel ? (
                        <p className="worklist-row__detail" data-testid="work-quantity-outcome">
                          Cantitate executată: {task.varianceLabel}
                        </p>
                      ) : (
                        <p className="worklist-row__detail">{task.statusLabel}</p>
                      )}
                      <TaskMaterialConsumption task={task} />
                      {task.executionMode === "EXTERNAL" && task.externalProviderLabel ? (
                        <p className="worklist-row__detail">{task.externalProviderLabel}</p>
                      ) : null}
                      {task.qualityControl ? (
                        <p className="worklist-row__detail" data-testid="job-quality-state">
                          {jobQualityLabel(task)}
                        </p>
                      ) : null}
                      <p className="section-label">Timp</p>
                      <p>Planificat {task.plannedTimeLabel}</p>
                      <p>Realizat {task.actualDurationLabel}</p>
                      {task.timeVarianceLabel ? <p>{task.timeVarianceLabel}</p> : null}
                      {task.machineRunTotalLabel ? (
                        <p>Total utilaj — {task.machineRunTotalLabel}</p>
                      ) : null}
                    </div>
                  ))}
                  </details>
                </>
              )}
            </div>
            {plan ? (
              <>
                <p>
                  <a className="text-link" href={executionHref(plan.planId, { jobId, taskId: selectedTask?.taskId })}>
                    Deschide execuția
                  </a>
                </p>
                <p>
                  <a className="text-link" href={atelierHref({ jobId, returnTo: jobHref(jobId, { taskId: selectedTask?.taskId }) })}>
                    Deschide atelierul lucrării
                  </a>
                </p>
              </>
            ) : null}
          </SurfacePanel>
        </>
      ) : jobResource.status !== "error" ? (
        <>
          <SurfacePanel title="Identitate" label="Identitate" busy>
            <LoadingFloor variant="traveler" label="Se citește lucrarea" />
          </SurfacePanel>
          <SurfacePanel title="Traseu de producție" busy>
            <LoadingFloor variant="facts" label="Se citește traseul" rows={3} />
          </SurfacePanel>
          <SurfacePanel title="Planificat și realizat" label="Planificat și realizat" busy>
            <LoadingFloor variant="facts" label="Se citește planul" rows={3} />
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}
