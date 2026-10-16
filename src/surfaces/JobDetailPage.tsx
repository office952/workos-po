import { useState } from "react";
import "../styles/surfaces/job-detail.css";
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
import { formatQuantity } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref, jobHref, quoteHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { SiteInstallationContextPanel } from "./SiteInstallationContextPanel";
import { JobProductionMap } from "./JobProductionMap";
import { ExecutionActualConsumptionHistory } from "./ExecutionActualConsumption";
import type { ExecutionTaskTransport } from "../api/types";

type JobDetailPageProps = {
  jobId: string;
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

export function JobDetailPage({ jobId }: JobDetailPageProps) {
  const jobResource = useResource(resourceKeys.job(jobId), () => loadJobDetail(jobId));
  const job = jobResource.data?.job ?? null;
  const quoteSnapshotId = jobResource.data?.quoteSnapshotId ?? null;
  const quoteHrefValue = jobResource.data?.quoteHref ?? null;
  const planId = jobResource.data?.planId ?? null;
  const planResource = useResource(planId ? resourceKeys.executionPlan(planId) : null, () =>
    loadExecutionPlan(planId ?? ""),
  );
  const plan = planResource.data ?? null;
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState(jobId);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [planningMessage, setPlanningMessage] = useState<string | null>(null);
  if (draftScope !== jobId) {
    setDraftScope(jobId);
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
      headerVariant="pilot-compact"
      eyebrow="Lucrare"
      title={job?.inscription || job?.productLabel || "Lucrare"}
      lead={job?.productLabel || "Dosar de producție și informații operaționale."}
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
          <a className="hit" href={executionHref(planId, { jobId })}>
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
          {job.needsAttention && job.attentionLabel ? (
            <div className="job-detail__focus-note" role="status">
              <span className="job-detail__eyebrow">NECESITĂ ATENȚIE</span>
              <strong>{job.attentionLabel}</strong>
              {plan ? <a href="#job-map">Vezi operațiile <span aria-hidden="true">↗</span></a> : null}
            </div>
          ) : null}
          {job.stage === "EXECUTION_COMPLETED" ? (
            <p className="job-detail__completion-note">
              Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.
            </p>
          ) : null}
          {!planId ? (
            <div className="job-detail__orientation" aria-label="Starea curentă a lucrării">
              <div className="job-detail__orientation-main">
                <span className="job-detail__eyebrow">FIȘA LUCRĂRII / STARE OPERAȚIONALĂ</span>
                <div className="job-detail__state-line"><strong>{job.stageLabel}</strong></div>
                <p>Lucrarea nu are încă un plan de execuție afișabil.</p>
              </div>
              <div className="job-detail__next">
                <span className="job-detail__eyebrow">URMĂTORUL PAS ÎN SISTEM</span>
                <strong>{job.nextActionLabel}</strong>
              </div>
            </div>
          ) : null}
          {plan ? (
            <JobProductionMap plan={plan} jobId={jobId} />
          ) : planPending ? (
            <div className="job-detail__map-placeholder" role="status">Se citește planul de producție…</div>
          ) : planId && planResource.status === "error" ? (
            <InlineAlert tone="error" title="Planul nu a putut fi citit">
              Dosarul operațional și rezultatele planului nu sunt disponibile momentan.
            </InlineAlert>
          ) : (
            <div className="job-detail__map-placeholder">
              <strong>Operațiile vor apărea după crearea planului.</strong>
              <span>Înainte de plan, folosește acțiunea disponibilă pentru această lucrare.</span>
            </div>
          )}
          <nav className="job-detail__sections" aria-label="Navigare în fișa lucrării">
            {plan ? <a href="#job-map">Dosarul de producție</a> : null}
            <a href="#job-overview">Rezumat</a>
            <a href="#job-route">Traseu de producție</a>
            <a href="#job-results">Rezultate</a>
          </nav>
          <div className="job-detail__body">
          <section className="job-detail__segment" id="job-overview" aria-label="Rezumatul lucrării">
          <SurfacePanel title="Identitate" label="Identitate">
            <dl className="fact-grid">
              <InfoRow label="Lucrare" value={job.productLabel} />
              <InfoRow label="Client" value={job.customerDisplayName ?? "—"} />
              <InfoRow label="Tip" value={job.kindLabel} />
              <InfoRow label="Prioritate" value={job.priorityLabel} />
              <InfoRow label="Termen" value={job.targetDateLabel} />
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
            <details className="job-detail__planning">
              <summary>{job.planningEditable ? "Editează termenul și prioritatea" : "Planificare (doar citire)"}</summary>
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
                disabled={!job.planningEditable || actionState === "pending"}
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
                disabled={!job.planningEditable || actionState === "pending"}
                onChange={setTargetDraft}
              />
              {job.planningEditable ? (
                <Button type="submit" disabled={actionState === "pending"}>
                  Salvează planificarea
                </Button>
              ) : (
                <p className="ui-note">Lucrarea finalizată are planificarea doar pentru citire.</p>
              )}
              {planningMessage ? <p className="ui-note">{planningMessage}</p> : null}
            </form>
            </details>
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
          </section>
          <section className="job-detail__segment" id="job-route" aria-label="Traseul de producție">
          <SurfacePanel
            title="Traseu de producție"
            description="Ghid din starea lucrării. Nu este planul de producție."
          >
            <LifecycleList steps={presentJobLifecycle(job)} />
            <p className="ui-note">
              {plan
                ? plan.progressLabel
                : planPending
                  ? "Se citește planul de execuție."
                  : "Planul nu există încă. După materializare, progresul vine din motorul de execuție."}
            </p>
          </SurfacePanel>
          </section>
          <section className="job-detail__segment" id="job-results" aria-label="Operații și rezultate">
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
                  <details className="job-detail__results-details">
                    <summary>Detalii complete pentru cele {plan.tasks.length} operații · cantități, consumuri și timp</summary>
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
                  <a className="text-link" href={executionHref(plan.planId, { jobId })}>
                    Deschide execuția
                  </a>
                </p>
                <p>
                  <a className="text-link" href={atelierHref({ jobId })}>
                    Deschide atelierul lucrării
                  </a>
                </p>
              </>
            ) : null}
          </SurfacePanel>
          </section>
          </div>
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
