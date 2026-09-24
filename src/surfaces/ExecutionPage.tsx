import { useState } from "react";
import { TransportError } from "../api/http";
import {
  assignTaskProvider,
  completeExecutionTask,
  startExecutionTask,
  startMachineRun,
  stopMachineRun,
} from "../api/lifecycle";
import type {
  EligibleProviderTransport,
  ExecutionPlanProgressTransport,
  ExecutionTaskCompletionInput,
  ExecutionTaskTransport,
} from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { MeasurePair } from "../components/MeasurePair";
import { SelectField } from "../components/SelectField";
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
import {
  actualConsumptionDraftKey,
  canEditActualConsumption,
  collectActualConsumptionInput,
} from "../presentation/executionActuals";
import { parseActualDurationDraft } from "../presentation/actualDuration";
import { presentExecutionCompletionError } from "../presentation/executionCompletionError";
import {
  presentCurrentTaskRole,
  presentExecutionNextAction,
} from "../presentation/executionNextAction";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref, jobHref } from "../routing/appRoute";
import {
  ExecutionActualConsumptionFields,
  ExecutionActualConsumptionHistory,
} from "./ExecutionActualConsumption";
import { SiteInstallationContextPanel } from "./SiteInstallationContextPanel";

type ExecutionPageProps = {
  planId: string;
  taskId?: string | null;
  jobId?: string | null;
};

function firstActionableTask(
  tasks: readonly ExecutionTaskTransport[],
): ExecutionTaskTransport | null {
  return (
    tasks.find(
      (task) => task.canComplete || task.canClaimStart || task.canAssignProvider,
    ) ??
    tasks.find((task) => task.status !== "COMPLETED") ??
    tasks[0] ??
    null
  );
}

function providerChoiceLabel(provider: EligibleProviderTransport): string {
  return provider.kindLabel
    ? `${provider.kindLabel} — ${provider.label}`
    : provider.label;
}

function ProviderAssignmentControls({
  task,
  selectedProviderId,
  pending,
  onSelect,
  onAssign,
}: {
  task: ExecutionTaskTransport;
  selectedProviderId: string;
  pending: boolean;
  onSelect: (providerId: string) => void;
  onAssign: (providerId: string) => void;
}) {
  const providers = task.eligibleProviders;
  if (providers.length === 0) {
    return null;
  }
  const onlyProvider = providers.length === 1 ? providers[0] : null;
  const chosen = onlyProvider
    ? onlyProvider
    : (providers.find((provider) => provider.id === selectedProviderId) ?? null);
  const assignableId = chosen?.id ?? "";
  return (
    <div className="stack">
      {onlyProvider ? (
        <p>Se alocă: {providerChoiceLabel(onlyProvider)}</p>
      ) : (
        <SelectField
          id={`provider-${task.taskId}`}
          label="Utilaj / zonă"
          hint="Alege explicit utilajul sau zona. Nimic nu se alocă până alegi."
          value={selectedProviderId}
          disabled={pending}
          options={providers.map((provider) => ({
            value: provider.id,
            label: providerChoiceLabel(provider),
          }))}
          onChange={onSelect}
        />
      )}
      <div className="cluster">
        <Button
          variant="secondary"
          disabled={pending || !assignableId}
          onClick={() => onAssign(assignableId)}
        >
          {chosen ? `Alocă ${chosen.label}` : "Alocă utilajul"}
        </Button>
      </div>
    </div>
  );
}

function selectCurrentExecutionTask(
  tasks: readonly ExecutionTaskTransport[],
  taskId: string | null,
): ExecutionTaskTransport | null {
  if (tasks.length === 0) {
    return null;
  }
  const requested = taskId
    ? (tasks.find((task) => task.taskId === taskId) ?? null)
    : null;
  if (requested) {
    return requested;
  }
  return firstActionableTask(tasks);
}

function PlanSummary({
  statusLabel,
  progress,
}: {
  statusLabel: string;
  progress: ExecutionPlanProgressTransport | null;
}) {
  const items = [
    { key: "status", label: statusLabel },
    progress
      ? { key: "done", label: `Finalizate ${progress.completed} / ${progress.total}` }
      : null,
    progress && progress.inProgress > 0
      ? { key: "live", label: `În curs ${progress.inProgress}` }
      : null,
    progress && progress.waitingDependencies > 0
      ? { key: "wait", label: `Așteaptă ${progress.waitingDependencies}` }
      : null,
    progress && progress.noProvider > 0
      ? { key: "provider", label: `Fără utilaj / zonă ${progress.noProvider}` }
      : null,
    progress && progress.varianceCount > 0
      ? { key: "variance", label: `Diferențe ${progress.varianceCount}` }
      : null,
  ].filter((item): item is { key: string; label: string } => item !== null);
  return (
    <p className="plan-summary" aria-label="Starea planului">
      {items.map((item) => (
        <span key={item.key} className="plan-summary__item">
          {item.label}
        </span>
      ))}
    </p>
  );
}

function compactTaskFacts(task: ExecutionTaskTransport): string[] {
  const parts: string[] = [];
  if (task.requiresProvider || task.assignmentLabel !== "Nealocat") {
    parts.push(task.assignmentLabel);
  }
  if (task.executorLabel) {
    parts.push(task.executorLabel);
  }
  if (task.waitingFor.length === 0 && task.plannedQuantityLabel) {
    parts.push(task.plannedQuantityLabel);
  }
  if (task.completedQuantityLabel) {
    parts.push(task.completedQuantityLabel);
  }
  if (task.varianceLabel) {
    parts.push(task.varianceLabel);
  }
  if (task.actualConsumption.length > 0) {
    parts.push("Consum înregistrat");
  }
  return parts;
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

export function ExecutionPage({
  planId,
  taskId = null,
  jobId = null,
}: ExecutionPageProps) {
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const planResource = useResource(resourceKeys.executionPlan(planId), () =>
    loadExecutionPlan(planId),
  );
  const plan = planResource.data ?? null;
  const identified = session.status === "success" ? session.data !== null : null;
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [resourceActualDrafts, setResourceActualDrafts] = useState<Record<string, string>>(
    {},
  );
  const [selectedProviderByTask, setSelectedProviderByTask] = useState<
    Record<string, string>
  >({});

  function actualQuantityDraft(task: ExecutionTaskTransport): string {
    if (actualDrafts[task.taskId] !== undefined) {
      return actualDrafts[task.taskId];
    }
    if (task.requiresCompletedQuantity && task.plannedQuantity !== null) {
      return draftCompletedQuantity(task.plannedQuantity);
    }
    return "";
  }

  async function assign(
    task: ExecutionTaskTransport,
    providerId: string,
  ): Promise<void> {
    if (!task.canAssignProvider || !providerId) {
      return;
    }
    const known = task.eligibleProviders.some((provider) => provider.id === providerId);
    if (!known) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await assignTaskProvider(task.taskId, providerId);
      setActionState("idle");
      setSelectedProviderByTask((current) => {
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
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

  async function startRun(task: ExecutionTaskTransport): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      await startMachineRun(task.taskId);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Rularea utilajului nu poate fi pornită."
          : "Pornirea utilajului a eșuat.",
      );
    }
  }

  async function stopRun(task: ExecutionTaskTransport): Promise<void> {
    const machineRunId = task.machineRuns.find((run) => run.active)?.machineRunId;
    if (!machineRunId) {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await stopMachineRun(machineRunId);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Rularea utilajului nu poate fi oprită."
          : "Oprirea utilajului a eșuat.",
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
    const completionInput: ExecutionTaskCompletionInput = {};
    if (task.requiresCompletedQuantity) {
      const parsed = parseCompletedQuantity(actualQuantityDraft(task));
      if (parsed === null) {
        setActionState("error");
        setActionError("Cantitatea realizată trebuie să fie un număr valid, zero sau pozitiv.");
        return;
      }
      completionInput.completedQuantity = parsed;
    }
    if (canEditActualConsumption(task)) {
      const collected = collectActualConsumptionInput(
        task.plannedResources,
        resourceActualDrafts,
        task.taskId,
      );
      if (!collected.ok) {
        setActionState("error");
        setActionError("Cantitatea consumată trebuie să fie un număr valid, zero sau pozitiv.");
        return;
      }
      if (collected.actualConsumption) {
        completionInput.actualConsumption = collected.actualConsumption;
      }
    }
    const duration = parseActualDurationDraft(durationDrafts[task.taskId] ?? "");
    if (!duration.ok) {
      setActionState("error");
      setActionError("Timpul efectiv trebuie să fie un număr întreg de minute, zero sau pozitiv.");
      return;
    }
    if (duration.actualDurationMinutes !== undefined) {
      completionInput.actualDurationMinutes = duration.actualDurationMinutes;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await completeExecutionTask(task.taskId, completionInput);
      setActionState("idle");
      invalidateAfterExecutionTaskChange(planId);
    } catch (error) {
      setActionState("error");
      setActionError(presentExecutionCompletionError(error));
    }
  }

  const resolvedJobId = jobId ?? plan?.jobId ?? null;
  const allComplete =
    plan !== null && plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "COMPLETED");
  const currentTask = plan ? selectCurrentExecutionTask(plan.tasks, taskId) : null;
  const actionableTask = plan ? firstActionableTask(plan.tasks) : null;
  const sessionKnown = session.status === "success";

  return (
    <SlicePage
      contextLabel="Execuție"
      currentHref={executionHref(planId, { taskId, jobId: resolvedJobId })}
      workspace="operational"
      eyebrow="Execuție"
      title={plan?.inscription || plan?.productLabel || "Execuție"}
      lead="Planul vine de la motorul de producție. Operatorul pornește și închide sarcinile pe care le poate lucra."
      meta={
        plan
          ? [
              plan.priorityLabel,
              plan.targetDateLabel,
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
          <a className="text-link" href={atelierHref({ jobId: resolvedJobId })}>
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
      {plan ? (
        <PlanSummary statusLabel={plan.statusLabel} progress={plan.progress} />
      ) : null}
      {currentTask ? (
        <article
          className="operational-task operational-task--current"
          data-task-id={currentTask.taskId}
        >
          <SurfacePanel
            variant="operational"
            title={`${currentTask.seqLabel} ${currentTask.processLabel}`}
            description={presentCurrentTaskRole(currentTask, actionableTask)}
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
              <InfoRow label="Timp planificat" value={currentTask.plannedTimeLabel} />
              <InfoRow label="Timp efectiv" value={currentTask.actualDurationLabel} />
              {currentTask.timeVarianceLabel ? (
                <InfoRow label="Diferență timp" value={currentTask.timeVarianceLabel} />
              ) : null}
              {currentTask.executorLabel || currentTask.startedByLabel ? (
                <InfoRow
                  label="Operator sarcină"
                  value={currentTask.executorLabel ?? currentTask.startedByLabel ?? ""}
                />
              ) : null}
              <InfoRow label="Diferență" value={currentTask.varianceLabel ?? "—"} />
              <InfoRow
                label="Următorul pas"
                value={presentExecutionNextAction(currentTask, identified)}
              />
            </dl>
            {plan?.siteInstallation && currentTask.scopeLabel === "Montaj la locație" ? (
              <SiteInstallationContextPanel context={plan.siteInstallation} />
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
            {canEditActualConsumption(currentTask) ? (
              <ExecutionActualConsumptionFields
                taskId={currentTask.taskId}
                plannedResources={currentTask.plannedResources}
                drafts={resourceActualDrafts}
                disabled={actionState === "pending"}
                onChange={(resourceId, value) => {
                  setResourceActualDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [actualConsumptionDraftKey(currentTask.taskId, resourceId)]: value,
                  }));
                }}
              />
            ) : (
              <ExecutionActualConsumptionHistory
                actualConsumption={currentTask.actualConsumption}
              />
            )}
            {currentTask.requiresProvider &&
            currentTask.assignmentLabel === "Nealocat" &&
            currentTask.eligibleProviders.length === 0 &&
            currentTask.status !== "COMPLETED" ? (
              <InlineAlert tone="blocked" title="Utilaj / zonă lipsă">
                Această sarcină cere un utilaj sau o zonă de lucru eligibilă deja configurată
                în organizație. Execuția nu inventează utilaje sau zone.
              </InlineAlert>
            ) : null}
            {currentTask.canAssignProvider ? (
              <ProviderAssignmentControls
                task={currentTask}
                selectedProviderId={selectedProviderByTask[currentTask.taskId] ?? ""}
                pending={actionState === "pending"}
                onSelect={(providerId) => {
                  setSelectedProviderByTask((current) => ({
                    ...current,
                    [currentTask.taskId]: providerId,
                  }));
                }}
                onAssign={(providerId) => void assign(currentTask, providerId)}
              />
            ) : currentTask.requiresProvider &&
              currentTask.eligibleProviders.length > 0 &&
              currentTask.status !== "COMPLETED" &&
              currentTask.assignmentLabel === "Nealocat" ? (
              <p>
                Utilaje eligibile:{" "}
                {currentTask.eligibleProviders
                  .map((provider) => providerChoiceLabel(provider))
                  .join(", ")}
              </p>
            ) : null}
            {(currentTask.canComplete || currentTask.completionBlockedByActiveMachineRun) &&
            currentTask.status !== "COMPLETED" ? (
              <TextField
                id={`actual-duration-${currentTask.taskId}`}
                label="Timp efectiv (minute)"
                value={durationDrafts[currentTask.taskId] ?? ""}
                inputMode="numeric"
                disabled={actionState === "pending"}
                onChange={(value) => {
                  setDurationDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [currentTask.taskId]: value,
                  }));
                }}
              />
            ) : null}
            {currentTask.canStartMachineRun ||
            currentTask.canStopMachineRun ||
            currentTask.machineRuns.length > 0 ? (
              <div className="stack" data-testid="machine-run">
                {currentTask.canStopMachineRun ? (
                  <>
                    <p>Utilaj: {currentTask.activeMachineRunLabel}</p>
                    <p>Pornit la: {currentTask.activeMachineRunStartedLabel}</p>
                  </>
                ) : null}
                {currentTask.machineRuns
                  .filter((run) => !run.active && run.durationLabel)
                  .map((run) => (
                    <p key={run.machineRunId}>{run.durationLabel}</p>
                  ))}
                {currentTask.machineRunTotalLabel ? (
                  <p>Total utilaj — {currentTask.machineRunTotalLabel}</p>
                ) : null}
                {currentTask.completionBlockedByActiveMachineRun ? (
                  <p>Oprește rularea utilajului înainte de a închide sarcina.</p>
                ) : null}
              </div>
            ) : null}
            <div className="cluster">
              {currentTask.canClaimStart ? (
                <Button
                  disabled={actionState === "pending" || identified !== true}
                  onClick={() => void start(currentTask)}
                >
                  Pornește
                </Button>
              ) : null}
              {currentTask.canStartMachineRun ? (
                <Button
                  disabled={actionState === "pending" || identified !== true}
                  onClick={() => void startRun(currentTask)}
                >
                  Pornește utilajul
                </Button>
              ) : null}
              {currentTask.canStopMachineRun ? (
                <Button
                  disabled={actionState === "pending" || identified !== true}
                  onClick={() => void stopRun(currentTask)}
                >
                  Oprește utilajul
                </Button>
              ) : null}
              {currentTask.canComplete || currentTask.completionBlockedByActiveMachineRun ? (
                <Button
                  disabled={
                    actionState === "pending" ||
                    identified !== true ||
                    currentTask.completionBlockedByActiveMachineRun
                  }
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
                    : currentTask.dependsOnLabels.length > 0
                      ? "Îndeplinite"
                      : "Fără dependențe"
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
      {plan ? (
        <Worklist variant="operational" label="Planul de execuție">
          {executionGroups(plan.tasks).map((group) => (
            <section key={group.label ?? "plan"} data-execution-scope={group.label ?? undefined}>
              {group.label ? <h2 className="section-label">{group.label}</h2> : null}
              {group.tasks.map((task) => {
                const facts = compactTaskFacts(task);
                return (
                  <article
                    key={task.taskId}
                    className="operational-task operational-task--compact"
                    data-task-id={task.taskId}
                  >
                    <WorklistRow
                      variant="operational"
                      href={executionHref(planId, {
                        taskId: task.taskId,
                        jobId: resolvedJobId,
                      })}
                      current={task.taskId === currentTask?.taskId}
                      identity={`${task.seqLabel} ${task.processLabel}`}
                      identityDetail={presentExecutionNextAction(task, identified)}
                      context={task.scopeLabel}
                      state={
                        <StatusBadge label={task.statusLabel} tone={taskStatusKind(task)} />
                      }
                    />
                    {facts.length > 0 ? (
                      <p className="task-row-facts">
                        {facts.map((fact) => (
                          <span key={fact}>{fact}</span>
                        ))}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </Worklist>
      ) : null}
      {plan ? (
        <p>
          <a className="text-link" href={resolvedJobId ? jobHref(resolvedJobId) : "/lucrari"}>
            {resolvedJobId ? "Revino la lucrare" : "Revino la lucrări"}
          </a>
        </p>
      ) : null}
    </SlicePage>
  );
}

const PREFERRED_ASSEMBLY_SCOPES = ["Panou ACM", "Litere", "Logo", "Ansamblare"] as const;

export function executionGroups<T extends { scopeLabel: string }>(
  tasks: readonly T[],
): { label: string | null; tasks: T[] }[] {
  const assembly = tasks.some((task) => task.scopeLabel === "Ansamblare");
  if (!assembly) {
    return [{ label: null, tasks: [...tasks] }];
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const label of PREFERRED_ASSEMBLY_SCOPES) {
    if (tasks.some((task) => task.scopeLabel === label)) {
      ordered.push(label);
      seen.add(label);
    }
  }
  for (const task of tasks) {
    if (seen.has(task.scopeLabel)) {
      continue;
    }
    seen.add(task.scopeLabel);
    ordered.push(task.scopeLabel);
  }
  return ordered.map((label) => ({
    label,
    tasks: tasks.filter((task) => task.scopeLabel === label),
  }));
}
