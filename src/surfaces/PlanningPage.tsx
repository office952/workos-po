import { useMemo, useState } from "react";
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
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterExecutionTaskChange } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadPlanningWorkload } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import {
  effortFieldsFromMinutes,
  formatKnownQueuedEffort,
  formatPlannedEffort,
  formatUnknownEffortCount,
  parseEffortFields,
  plannedEffortErrorMessage,
} from "../presentation/plannedEffort";
import { statusTone } from "../presentation/statusTone";

const TASK_COLUMNS = ["Lucrare", "Proces", "Stare", "Timp estimat"] as const;

export function PlanningPage() {
  const workload = useResource(resourceKeys.planningWorkload(), loadPlanningWorkload);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const data = workload.data;
  const providers = useMemo(() => data?.providers ?? [], [data]);
  const unassigned = useMemo(() => data?.unassigned ?? [], [data]);
  const empty =
    workload.status === "success" &&
    providers.length === 0 &&
    unassigned.length === 0;

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
      setActionSuccess(null);
      return;
    }
    setPending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await postPlannedEffort(task.taskId, parsed.plannedEffortMinutes);
      invalidateAfterExecutionTaskChange(task.executionPlanId);
      setEditingTaskId(null);
      setActionSuccess("Timpul estimat a fost salvat.");
    } catch (error) {
      const code =
        error instanceof TransportError ? readTransportErrorCode(error.body) : null;
      setActionError(plannedEffortErrorMessage(code));
    } finally {
      setPending(false);
    }
  }

  return (
    <SlicePage
      contextLabel="Planificare"
      currentHref="/planificare"
      workspace="operational"
      eyebrow="Planificare"
      title="Planificare"
      lead="Ce lucru este acum pe fiecare zonă sau utilaj și cât timp estimat avem."
    >
      {actionError ? (
        <InlineAlert tone="error" title="Timpul estimat nu s-a salvat">
          {actionError}
        </InlineAlert>
      ) : null}
      {actionSuccess ? (
        <InlineAlert tone="success" title="Salvat">
          {actionSuccess}
        </InlineAlert>
      ) : null}

      {workload.status === "loading" && !data ? (
        <LoadingFloor
          label="Se citește planificarea"
          variant="operational"
          worklistVariant="operational"
        />
      ) : null}

      {workload.status === "error" ? (
        <ErrorState title="Planificarea nu a putut fi citită">
          Încercați din nou. Datele de execuție rămân neschimbate.
        </ErrorState>
      ) : null}

      {empty ? (
        <EmptyState
          title="Nu există lucru de planificat."
          description="Când apar planuri de execuție, sarcinile deschise se grupează aici pe zonă sau utilaj."
        />
      ) : null}

      {workload.status === "success" || data ? (
        <>
          <SurfacePanel
            variant="flush"
            label="Lucru nealocat"
            title="Lucru nealocat"
            description="Sarcini deschise care cer un furnizor, dar nu au alocare."
          >
            {unassigned.length === 0 ? (
              <EmptyState title="Nu există sarcini nealocate." />
            ) : (
              <Worklist
                label="Sarcini nealocate"
                variant="operational"
                columns={TASK_COLUMNS}
              >
                {unassigned.map((task) => (
                  <PlannerTaskRow
                    key={task.taskId}
                    task={task}
                    editing={editingTaskId === task.taskId}
                    hours={hours}
                    minutes={minutes}
                    pending={pending}
                    onHoursChange={setHours}
                    onMinutesChange={setMinutes}
                    onBeginEdit={() => beginEdit(task)}
                    onCancel={() => setEditingTaskId(null)}
                    onSave={() => void saveEffort(task)}
                    unassigned
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>

          <div className="planner-floor">
            {providers.length === 0 ? (
              <SurfacePanel variant="flush" label="Furnizori" title="Zone și utilaje">
                <EmptyState
                  title="Nu există zone sau utilaje active."
                  description="Configurați furnizorii în administrare. Execuția rămâne disponibilă."
                />
              </SurfacePanel>
            ) : (
              providers.map((group) => (
                <SurfacePanel
                  key={`${group.provider.kind}:${group.provider.id}`}
                  variant="flush"
                  label={group.provider.label}
                  title={group.provider.label}
                  description={group.provider.kindLabel || undefined}
                  meta={
                    <ProviderEffortSummary
                      knownQueuedMinutes={group.knownQueuedMinutes}
                      unknownEffortCount={group.unknownEffortCount}
                    />
                  }
                >
                  {group.tasks.length === 0 ? (
                    <EmptyState title="Nicio sarcină deschisă pe acest furnizor." />
                  ) : (
                    <Worklist
                      label={`Sarcini ${group.provider.label}`}
                      variant="operational"
                      columns={TASK_COLUMNS}
                    >
                      {group.tasks.map((task) => (
                        <PlannerTaskRow
                          key={task.taskId}
                          task={task}
                          editing={editingTaskId === task.taskId}
                          hours={hours}
                          minutes={minutes}
                          pending={pending}
                          onHoursChange={setHours}
                          onMinutesChange={setMinutes}
                          onBeginEdit={() => beginEdit(task)}
                          onCancel={() => setEditingTaskId(null)}
                          onSave={() => void saveEffort(task)}
                        />
                      ))}
                    </Worklist>
                  )}
                </SurfacePanel>
              ))
            )}
          </div>
        </>
      ) : null}
    </SlicePage>
  );
}

function ProviderEffortSummary({
  knownQueuedMinutes,
  unknownEffortCount,
}: {
  knownQueuedMinutes: number;
  unknownEffortCount: number;
}) {
  return (
    <p className="planner-summary">
      <span>{formatKnownQueuedEffort(knownQueuedMinutes, unknownEffortCount)}</span>
      {unknownEffortCount > 0 ? (
        <span>{formatUnknownEffortCount(unknownEffortCount)}</span>
      ) : null}
    </p>
  );
}

function PlannerTaskRow({
  task,
  editing,
  hours,
  minutes,
  pending,
  onHoursChange,
  onMinutesChange,
  onBeginEdit,
  onCancel,
  onSave,
  unassigned = false,
}: {
  task: PlanningWorkloadTaskTransport;
  editing: boolean;
  hours: string;
  minutes: string;
  pending: boolean;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
  onBeginEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  unassigned?: boolean;
}) {
  const identity = task.inscription || task.productLabel || task.processLabel;
  const identityDetail = task.inscription ? task.productLabel : task.requiredCapabilityLabel;

  if (editing) {
    return (
      <div className="worklist-row worklist-row--operational worklist-row--static planner-row-edit">
        <span className="worklist-row__identity">
          <span className="worklist-row__title">{identity}</span>
          {identityDetail ? <span className="worklist-row__detail">{identityDetail}</span> : null}
        </span>
        <span className="worklist-row__context">{task.processLabel}</span>
        <span className="worklist-row__state">
          <StatusBadge
            label={task.statusLabel}
            tone={statusTone(task.status === "IN_PROGRESS" ? "warning" : "workflow")}
          />
        </span>
        <form
          className="planner-effort-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <TextField
            id={`effort-hours-${task.taskId}`}
            label="Ore"
            value={hours}
            onChange={onHoursChange}
            hint="Gol înseamnă fără estimare."
          />
          <TextField
            id={`effort-minutes-${task.taskId}`}
            label="Minute"
            value={minutes}
            onChange={onMinutesChange}
          />
          <Button type="submit" disabled={pending}>
            Salvează
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Anulează
          </Button>
        </form>
      </div>
    );
  }

  return (
    <WorklistRow
      variant="operational"
      identity={identity}
      identityDetail={identityDetail}
      context={task.processLabel}
      state={
        <StatusBadge
          label={task.statusLabel}
          tone={statusTone(task.status === "IN_PROGRESS" ? "warning" : "workflow")}
        />
      }
      actionLabel={
        unassigned
          ? "Alocă în Execuție"
          : task.canEditEffort
            ? formatPlannedEffort(task.plannedEffortMinutes)
            : formatPlannedEffort(task.plannedEffortMinutes)
      }
      href={unassigned ? task.executionHref : undefined}
      onSelect={task.canEditEffort && !unassigned ? onBeginEdit : undefined}
    />
  );
}
