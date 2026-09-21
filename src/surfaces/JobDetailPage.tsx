import { useState } from "react";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { TransportError } from "../api/http";
import { postExecutionPlan, postProductionRelease } from "../api/lifecycle";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LifecycleList } from "../components/LifecycleList";
import { LoadingFloor } from "../components/LoadingFloor";
import { MeasurePair } from "../components/MeasurePair";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import {
  invalidateAfterCreateExecutionPlan,
  invalidateAfterProductionRelease,
} from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadExecutionPlan, loadJobDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentJobLifecycle } from "../presentation/jobLifecycle";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref, jobHref, quoteHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";

type JobDetailPageProps = {
  jobId: string;
};

export function JobDetailPage({ jobId }: JobDetailPageProps) {
  const jobResource = useResource(resourceKeys.job(jobId), () => loadJobDetail(jobId));
  const job = jobResource.data?.job ?? null;
  const quoteSnapshotId = jobResource.data?.quoteSnapshotId ?? null;
  const planId = jobResource.data?.planId ?? null;
  const planResource = useResource(planId ? resourceKeys.executionPlan(planId) : null, () =>
    loadExecutionPlan(planId ?? ""),
  );
  const plan = planResource.data ?? null;
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  async function release(): Promise<void> {
    if (!job) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await postProductionRelease(job.productCode, job.orderSnapshotId);
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
      const presented = presentExecutionPlan(
        await postExecutionPlan(job.productCode, snapshotId),
      );
      if (!presented) {
        setActionState("error");
        setActionError("Planul de execuție nu a putut fi prezentat.");
        return;
      }
      setActionState("idle");
      invalidateAfterCreateExecutionPlan(jobId);
      navigate(executionHref(presented.planId));
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Planul nu poate fi creat încă."
          : "Crearea planului a eșuat.",
      );
    }
  }

  const planPending = Boolean(planId) && !plan && planResource.status !== "error";

  return (
    <SlicePage
      contextLabel="Lucrare"
      currentHref={jobHref(jobId)}
      workspace="traveler"
      eyebrow="Lucrare"
      title={job?.inscription || job?.productLabel || "Lucrare"}
      lead="Eliberează producția, materializează planul și compară planificat cu realizat."
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
          <SurfacePanel title="Identitate" label="Identitate">
            <dl className="fact-grid">
              <InfoRow label="Produs" value={job.productLabel} />
              <InfoRow label="Client" value={job.customerDisplayName ?? "—"} />
              <InfoRow label="Următoarea acțiune" value={job.nextActionLabel} />
            </dl>
            {quoteSnapshotId ? (
              <p>
                <a className="text-link" href={quoteHref(job.productCode, quoteSnapshotId)}>
                  Deschide oferta sursă
                </a>
              </p>
            ) : null}
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
                plan.tasks.map((task) => (
                  <div key={task.taskId} className="stack">
                    <p className="section-label">
                      {task.seqLabel} {task.processLabel}
                    </p>
                    <MeasurePair
                      planned={task.plannedQuantityLabel ?? "Fără cantitate măsurabilă"}
                      actual={task.completedQuantityLabel ?? "—"}
                    />
                    {task.varianceLabel ? (
                      <p className="worklist-row__detail">{task.varianceLabel}</p>
                    ) : (
                      <p className="worklist-row__detail">{task.statusLabel}</p>
                    )}
                  </div>
                ))
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
