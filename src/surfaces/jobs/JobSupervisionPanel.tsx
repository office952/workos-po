import { useState } from "react";
import {
  assignExternalProvider,
  closeReworkEpisode,
  confirmTaskMaterial,
  handOffExternalTask,
  markTaskExternal,
  recordExternalReturn,
} from "../../api/lifecycle";
import { TransportError, readTransportReasons } from "../../api/http";
import type { ExecutionTaskTransport } from "../../api/types";
import { Button } from "../../components/Button";
import { InlineAlert } from "../../components/InlineAlert";
import { SelectField } from "../../components/SelectField";
import { StatusBadge } from "../../components/StatusBadge";
import { TextField } from "../../components/TextField";
import { invalidateAfterExecutionTaskChange } from "../../data/invalidation";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { formatTimestamp } from "../../presentation/format";
import "../../styles/surfaces/job-supervision.css";

/**
 * Production supervision on the job sheet (Operații): the organizational decisions around an
 * operation, taken from the signed-in account with the rights the server already grants. No
 * operator identification is asked here; starting, completing and controlling an operation stay in
 * Atelier, with the operator's PIN. Every action shown comes from a server flag on the operation.
 */
type SupervisionNeed = { taskId: string; label: string; scopeLabel: string; reason: string };

type PlanForSupervision = {
  tasks: readonly ExecutionTaskTransport[];
  canConfirmMaterial?: boolean;
  externalProviderChoices?: readonly { providerId: string; name: string }[];
};

function unconfirmedMaterials(task: ExecutionTaskTransport) {
  return (task.materialLines ?? []).filter((line) => line.status !== "AVAILABLE");
}

function materialPending(task: ExecutionTaskTransport, canConfirmMaterial: boolean): boolean {
  return canConfirmMaterial && task.status === "PLANNED" && Boolean(task.materialBlockLabel) && unconfirmedMaterials(task).length > 0;
}

function hasExternalStep(task: ExecutionTaskTransport): boolean {
  return Boolean(task.canAssignExternalProvider || task.canHandOffExternal || task.canRecordExternalReturn);
}

function needReason(task: ExecutionTaskTransport, canConfirmMaterial: boolean): string | null {
  if (task.canCloseReworkEpisode) return "Corecție de închis";
  if (task.canRecordExternalReturn) return "Revenire de înregistrat";
  if (task.canHandOffExternal) return "De predat furnizorului";
  if (task.canAssignExternalProvider && task.executionMode === "EXTERNAL") return "Furnizor de ales";
  if (materialPending(task, canConfirmMaterial)) return "Material de confirmat";
  return null;
}

function supervisionNeeds(plan: PlanForSupervision): SupervisionNeed[] {
  const canConfirmMaterial = plan.canConfirmMaterial === true;
  return plan.tasks.flatMap((task) => {
    const reason = needReason(task, canConfirmMaterial);
    return reason
      ? [{ taskId: task.taskId, label: `${task.seqLabel} · ${task.processLabel}`, scopeLabel: task.scopeLabel, reason }]
      : [];
  });
}

function hasSupervisoryAction(task: ExecutionTaskTransport, canConfirmMaterial: boolean): boolean {
  return Boolean(task.canExternalize || hasExternalStep(task) || task.canCloseReworkEpisode || materialPending(task, canConfirmMaterial));
}

export function JobSupervisionPanel({
  jobId,
  planId,
  plan,
  selectedTask,
  roleLabel,
  operationHref,
}: {
  jobId: string;
  planId: string;
  plan: PlanForSupervision;
  selectedTask: ExecutionTaskTransport | null;
  /** The role of the signed-in account, as the server names it (e.g. „Producție”). */
  roleLabel: string | null;
  operationHref: (taskId: string) => string;
}) {
  const canConfirmMaterial = plan.canConfirmMaterial === true;
  const needs = supervisionNeeds(plan);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Record<string, string>>({});
  const [correction, setCorrection] = useState<Record<string, string>>({});
  const anyAction = plan.tasks.some((task) => hasSupervisoryAction(task, canConfirmMaterial));
  if (!anyAction && needs.length === 0) {
    return null;
  }

  async function run(action: () => Promise<unknown>, fallback: string): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      invalidateAfterExecutionTaskChange(planId);
      invalidateResources(resourceKeys.jobRecord(jobId));
    } catch (reason) {
      setError(
        reason instanceof TransportError
          ? (readTransportReasons(reason.body)[0] ?? (reason.status === 403 ? "Rolul tău nu poate face această acțiune." : fallback))
          : fallback,
      );
    } finally {
      setPending(false);
    }
  }

  const task = selectedTask;
  const taskHasAction = task ? hasSupervisoryAction(task, canConfirmMaterial) : false;
  const failNote =
    task?.latestQualityResult === "FAIL"
      ? ((task.qualityAttempts ?? []).filter((attempt) => attempt.result === "FAIL").at(-1) ?? null)
      : null;

  return (
    <section className="job-supervision" aria-label="Supervizare producție" data-testid="job-supervision">
      <header className="job-supervision__head">
        <h2>Supervizare producție</h2>
        <p className="job-supervision__who">
          {roleLabel ? `Contul tău: ${roleLabel}. ` : ""}Fără PIN de operator. Pornirea, finalizarea și
          controlul rămân în Atelier.
        </p>
      </header>
      {needs.length > 0 ? (
        <div className="job-supervision__needs">
          <p className="job-supervision__label">Necesită Producția · {needs.length}</p>
          <ul>
            {needs.map((need) => (
              <li key={need.taskId} data-current={task?.taskId === need.taskId ? "true" : undefined}>
                <a className="text-link" href={operationHref(need.taskId)}>
                  {need.label}
                </a>
                <span className="job-supervision__scope">{need.scopeLabel}</span>
                <span className="job-supervision__reason">{need.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ui-note">Nicio operație nu așteaptă acum o decizie a Producției.</p>
      )}
      {task && taskHasAction ? (
        <div className="job-supervision__task" data-testid="job-supervision-task">
          <p className="job-supervision__label">Operația deschisă</p>
          <h3>
            {task.seqLabel} · {task.processLabel} · {task.scopeLabel}
          </h3>
          <div className="cluster">
            <StatusBadge label={task.statusLabel ?? task.status} tone="neutral" />
          </div>
          {error ? (
            <InlineAlert tone="error" title="Acțiunea nu a fost salvată">
              {error} Lista a fost recitită; nimic nu a fost dublat.
            </InlineAlert>
          ) : null}

          {materialPending(task, canConfirmMaterial) ? (
            <div className="job-supervision__block" data-testid="job-supervision-material">
              <p>
                Operația nu poate fi pornită în Atelier până când materialul este confirmat (Materiale execuție:
                Obligatoriu).
              </p>
              {unconfirmedMaterials(task).map((line) => (
                <div className="job-supervision__material" key={line.resourceId}>
                  <span>
                    <strong>{line.label}</strong> · {line.statusLabel}
                  </span>
                  <div className="cluster">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        void run(
                          () => confirmTaskMaterial(task.taskId, line.resourceId, "AVAILABLE"),
                          "Confirmarea materialului nu a putut fi salvată.",
                        )
                      }
                    >
                      Confirmă disponibil
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || line.status === "NOT_AVAILABLE"}
                      onClick={() =>
                        void run(
                          () => confirmTaskMaterial(task.taskId, line.resourceId, "NOT_AVAILABLE"),
                          "Starea materialului nu a putut fi salvată.",
                        )
                      }
                    >
                      Indisponibil
                    </Button>
                  </div>
                </div>
              ))}
              <p className="ui-note">
                Confirmarea este o decizie de execuție: se salvează contul tău și ora. Nu cere cantitate și nu
                modifică stocul.
              </p>
            </div>
          ) : null}

          {task.canExternalize ? (
            <div className="job-supervision__block">
              <p>Operația poate fi executată de un furnizor din afara atelierului.</p>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void run(() => markTaskExternal(task.taskId), "Sarcina nu poate fi marcată pentru execuție externă.")
                }
              >
                Marchează pentru execuție externă
              </Button>
            </div>
          ) : null}

          {task.executionMode === "EXTERNAL" ? (
            <div className="job-supervision__block" data-testid="job-supervision-external">
              <dl className="job-supervision__facts">
                <div>
                  <dt>Furnizor extern</dt>
                  <dd>{task.externalProviderLabel ?? "Nealocat"}</dd>
                </div>
                {task.handedOffAt ? (
                  <div>
                    <dt>Predat la</dt>
                    <dd>{formatTimestamp(task.handedOffAt) ?? task.handedOffAt}</dd>
                  </div>
                ) : null}
                {task.returnedAt ? (
                  <div>
                    <dt>Revenit la</dt>
                    <dd>{formatTimestamp(task.returnedAt) ?? task.returnedAt}</dd>
                  </div>
                ) : null}
              </dl>
              {task.externalBlockLabel ? <p>{task.externalBlockLabel}</p> : null}
              {task.canAssignExternalProvider ? (
                <>
                  <SelectField
                    id={`supervision-provider-${task.taskId}`}
                    label="Furnizor extern"
                    value={provider[task.taskId] ?? ""}
                    disabled={pending}
                    options={(plan.externalProviderChoices ?? []).map((choice) => ({ value: choice.providerId, label: choice.name }))}
                    onChange={(value) => setProvider((current) => ({ ...current, [task.taskId]: value }))}
                  />
                  <Button
                    variant="secondary"
                    disabled={pending || !provider[task.taskId]}
                    onClick={() =>
                      void run(
                        () => assignExternalProvider(task.taskId, provider[task.taskId] ?? ""),
                        "Furnizorul extern nu poate fi alocat.",
                      )
                    }
                  >
                    Alocă furnizorul
                  </Button>
                </>
              ) : null}
              {task.canHandOffExternal ? (
                <Button
                  disabled={pending}
                  onClick={() => void run(() => handOffExternalTask(task.taskId), "Predarea nu este permisă încă.")}
                >
                  Predă către furnizor
                </Button>
              ) : null}
              {task.canRecordExternalReturn ? (
                <>
                  <p className="ui-note">
                    Predarea nu înseamnă finalizare. Operațiile care depind de aceasta rămân în așteptare până la
                    revenire.
                  </p>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void run(() => recordExternalReturn(task.taskId), "Revenirea nu poate fi înregistrată.")
                    }
                  >
                    Înregistrează revenirea
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}

          {task.canCloseReworkEpisode ? (
            <div className="job-supervision__block" data-testid="job-supervision-correction">
              <InlineAlert tone="error" title="Respins la control">
                {failNote?.note ?? "Controlul a fost respins."} Corecția este necesară; operațiile următoare rămân
                blocate.
              </InlineAlert>
              <TextField
                id={`supervision-correction-${task.taskId}`}
                label="Notă de corecție"
                value={correction[task.taskId] ?? ""}
                disabled={pending}
                onChange={(value) => setCorrection((current) => ({ ...current, [task.taskId]: value }))}
              />
              <Button
                disabled={pending || (correction[task.taskId] ?? "").trim().length === 0}
                onClick={() =>
                  void run(
                    () => closeReworkEpisode(task.taskId, (correction[task.taskId] ?? "").trim()),
                    "Corecția nu a putut fi închisă.",
                  )
                }
              >
                Închide corecția
              </Button>
              <p className="ui-note">După închidere, controlul este oferit din nou operatorului, în Atelier.</p>
            </div>
          ) : null}
        </div>
      ) : task ? (
        <p className="ui-note">Operația deschisă nu are acum o acțiune de supervizare.</p>
      ) : needs.length > 0 ? (
        <p className="ui-note">Deschide o operație din listă pentru a lua decizia.</p>
      ) : null}
    </section>
  );
}
