import { useState } from "react";
import { TransportError } from "../api/http";
import {
  assignTaskProvider,
  completeExecutionTask,
  startExecutionTask,
} from "../api/lifecycle";
import type { ExecutionTaskTransport } from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { MeasurePair } from "../components/MeasurePair";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterExecutionTaskChange } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadExecutionPlan, loadOperatorSession } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import {
  draftCompletedQuantity,
  parseCompletedQuantity,
} from "../presentation/completedQuantity";
import { statusTone } from "../presentation/statusTone";
import { executionHref } from "../routing/appRoute";

type ExecutionPageProps = {
  planId: string;
};

function firstActionableTask(
  tasks: readonly ExecutionTaskTransport[],
): ExecutionTaskTransport | null {
  return (
    tasks.find((task) => task.canComplete || task.canClaimStart || task.canAssign) ??
    tasks.find((task) => task.status !== "COMPLETED") ??
    tasks[0] ??
    null
  );
}

function taskStatusKind(task: ExecutionTaskTransport) {
  if (task.status === "COMPLETED") {
    return statusTone("success");
  }
  if (task.waitingFor.length > 0) {
    return statusTone("warning");
  }
  return statusTone("workflow");
}

export function ExecutionPage({ planId }: ExecutionPageProps) {
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const planResource = useResource(resourceKeys.executionPlan(planId), () =>
    loadExecutionPlan(planId),
  );
  const plan = planResource.data ?? null;
  const identified = session.status === "success" ? session.data !== null : null;
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({});

  function actualQuantityDraft(task: ExecutionTaskTransport): string {
    if (actualDrafts[task.taskId] !== undefined) {
      return actualDrafts[task.taskId];
    }
    if (task.requiresCompletedQuantity && task.plannedQuantity !== null) {
      return draftCompletedQuantity(task.plannedQuantity);
    }
    return "";
  }

  async function assign(task: ExecutionTaskTransport): Promise<void> {
    const providerId = task.eligibleProviderIds[0];
    if (!providerId) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await assignTaskProvider(task.taskId, providerId);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Alocarea utilajului nu este permisă pentru această sarcină."
          : "Alocarea a eșuat.",
      );
    }
  }

  async function start(task: ExecutionTaskTransport): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      await startExecutionTask(task.taskId);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Sarcina nu poate fi începută. Verifică identificarea și eligibilitatea."
          : "Pornirea a eșuat.",
      );
    }
  }

  async function complete(task: ExecutionTaskTransport): Promise<void> {
    const completionInput: { completedQuantity?: number } = {};
    if (task.requiresCompletedQuantity) {
      const parsed = parseCompletedQuantity(actualQuantityDraft(task));
      if (parsed === null) {
        setActionState("error");
        setActionError("Cantitatea realizată trebuie să fie un număr valid, zero sau pozitiv.");
        return;
      }
      completionInput.completedQuantity = parsed;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await completeExecutionTask(task.taskId, completionInput);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Sarcina nu poate fi închisă încă."
          : "Finalizarea a eșuat.",
      );
    }
  }

  const allComplete =
    plan !== null && plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "COMPLETED");
  const currentTask = allComplete || !plan ? null : firstActionableTask(plan.tasks);
  const sessionKnown = session.status === "success";

  return (
    <SlicePage
      contextLabel="Execuție"
      currentHref={executionHref(planId)}
      workspace="operational"
      eyebrow="Execuție"
      title={plan?.inscription || plan?.productLabel || "Execuție"}
      lead="Planul vine de la motorul de producție. Operatorul pornește și închide sarcinile eligibile."
      meta={
        plan
          ? [
              plan.statusLabel,
              plan.progressLabel,
              session.data ? session.data.displayName : identified === false ? "Operator neidentificat" : null,
            ]
              .filter((part): part is string => Boolean(part))
              .join(" · ")
          : undefined
      }
    >
      {planResource.status === "error" && !plan ? (
        <InlineAlert tone="error" title="Planul nu a putut fi citit">
          Planul de execuție nu este disponibil.
        </InlineAlert>
      ) : null}
      {identified === false ? (
        <InlineAlert tone="blocked" title="Operator neidentificat">
          Intră în atelier înainte de a porni sau închide o sarcină.{" "}
          <a className="text-link" href="/atelier">
            Deschide atelierul
          </a>
        </InlineAlert>
      ) : null}
      {allComplete ? (
        <InlineAlert tone="pending" title="Lucrare executată">
          Toate sarcinile din plan sunt închise. Compară planificat și realizat pe lucrare.
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert tone="error" title="Acțiunea a eșuat">
          {actionError}
        </InlineAlert>
      ) : null}
      {currentTask ? (
        <article
          className="operational-task operational-task--current"
          data-task-id={currentTask.taskId}
        >
          <SurfacePanel
            variant="operational"
            title={`${currentTask.seqLabel} ${currentTask.processLabel}`}
            description="Prima sarcină eligibilă din acest plan."
            status={
              <StatusBadge
                label={currentTask.statusLabel}
                tone={taskStatusKind(currentTask)}
              />
            }
            label={`${currentTask.seqLabel} ${currentTask.processLabel}`}
          >
            <MeasurePair
              planned={currentTask.plannedQuantityLabel ?? "Fără cantitate măsurabilă"}
              actual={currentTask.completedQuantityLabel ?? "—"}
            />
            <dl className="fact-grid">
              <InfoRow label="Zonă" value={currentTask.scopeLabel} />
              <InfoRow label="Alocare" value={currentTask.assignmentLabel} />
              <InfoRow label="Diferență" value={currentTask.varianceLabel ?? "—"} />
            </dl>
            {currentTask.waitingFor.length > 0 ? (
              <p>Așteaptă: {currentTask.waitingFor.join(", ")}</p>
            ) : null}
            {currentTask.operatorRelation === "not_eligible" ? (
              <p>Alt operator trebuie să preia această sarcină.</p>
            ) : null}
            {currentTask.requiresCompletedQuantity && currentTask.status !== "COMPLETED" ? (
              <TextField
                id={`actual-${currentTask.taskId}`}
                label="Cantitate realizată"
                value={actualQuantityDraft(currentTask)}
                inputMode="decimal"
                disabled={actionState === "pending"}
                onChange={(value) => {
                  setActualDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [currentTask.taskId]: value,
                  }));
                }}
              />
            ) : null}
            <div className="cluster">
              {currentTask.canAssign ? (
                <Button
                  variant="secondary"
                  disabled={actionState === "pending"}
                  onClick={() => void assign(currentTask)}
                >
                  Alocă utilajul eligibil
                </Button>
              ) : null}
              {currentTask.canClaimStart ? (
                <Button
                  disabled={actionState === "pending" || identified !== true}
                  onClick={() => void start(currentTask)}
                >
                  Pornește
                </Button>
              ) : null}
              {currentTask.canComplete ? (
                <Button
                  disabled={actionState === "pending" || identified !== true}
                  onClick={() => void complete(currentTask)}
                >
                  Închide sarcina
                </Button>
              ) : null}
            </div>
          </SurfacePanel>
          <SurfacePanel variant="quiet" title="Fapte">
            <dl>
              <InfoRow
                label="Operator"
                value={
                  !sessionKnown
                    ? "Se identifică"
                    : identified
                      ? "Identificat"
                      : "Neidentificat"
                }
              />
              <InfoRow label="Zonă / utilaj" value={currentTask.assignmentLabel} />
              <InfoRow
                label="Dependențe"
                value={
                  currentTask.waitingFor.length > 0
                    ? currentTask.waitingFor.join(", ")
                    : "Îndeplinite"
                }
              />
            </dl>
            <p className="ui-note">
              Planul nu se rescrie. Actualul devine fapt istoric după confirmare.
            </p>
          </SurfacePanel>
        </article>
      ) : null}
      {!plan && planResource.status !== "error" ? (
        <article className="operational-task operational-task--current">
          <SurfacePanel variant="operational" title="Sarcină curentă" label="Sarcină curentă" busy>
            <LoadingFloor variant="operational" label="Se citește planul" />
          </SurfacePanel>
        </article>
      ) : null}
      {plan
        ? plan.tasks
            .filter((task) => task.taskId !== currentTask?.taskId)
            .map((task) => (
              <article
                key={task.taskId}
                className="operational-task operational-task--compact"
                data-task-id={task.taskId}
              >
                <Worklist
                  variant="operational"
                  label={`${task.seqLabel} ${task.processLabel}`}
                >
                  <WorklistRow
                    variant="operational"
                    identity={`${task.seqLabel} ${task.processLabel}`}
                    identityDetail={task.completedQuantityLabel ?? undefined}
                    context={task.scopeLabel}
                    state={
                      <StatusBadge label={task.statusLabel} tone={taskStatusKind(task)} />
                    }
                  />
                </Worklist>
                {task.varianceLabel ? <p>{task.varianceLabel}</p> : null}
              </article>
            ))
        : null}
      {plan ? (
        <p>
          <a className="text-link" href="/lucrari">
            Revino la lucrări
          </a>
        </p>
      ) : null}
    </SlicePage>
  );
}
