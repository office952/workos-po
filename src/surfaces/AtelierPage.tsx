import { useMemo, useState } from "react";
import { presentOperatorSession } from "../adapters/operatorAdapter";
import { TransportError, readTransportErrorCode } from "../api/http";
import { configureOperatorPin, identifyOperator, logoutOperator } from "../api/operator";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterOperatorSessionChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import {
  loadOperatorCandidates,
  loadOperatorInbox,
  loadOperatorSession,
} from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentInboxLane } from "../presentation/inboxLane";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref } from "../routing/appRoute";

type AtelierPageProps = {
  jobId?: string | null;
};

export function AtelierPage({ jobId = null }: AtelierPageProps) {
  const candidates = useResource(resourceKeys.operatorCandidates(), loadOperatorCandidates);
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const inbox = useResource(
    session.status === "success" && session.data ? resourceKeys.operatorInbox() : null,
    loadOperatorInbox,
  );
  const [personId, setPersonId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const people = useMemo(() => candidates.data ?? [], [candidates.data]);
  const currentSession = session.data ?? null;
  const tasks = useMemo(() => {
    const all = inbox.data ?? [];
    if (!jobId) {
      return all;
    }
    return all.filter((task) => task.jobId === jobId);
  }, [inbox.data, jobId]);
  const selectedPersonId = personId || people[0]?.personId || "";
  const selected = people.find((item) => item.personId === selectedPersonId) ?? null;
  const lanes = useMemo(() => tasks.map((task) => presentInboxLane(task)), [tasks]);
  const readyCount = lanes.filter((lane) => lane.lane === "ready").length;
  const nextCount = lanes.filter((lane) => lane.lane === "next").length;
  const sessionKnown = session.status === "success";
  const candidatesPending = candidates.status !== "success" && people.length === 0;

  async function login(): Promise<void> {
    if (!selectedPersonId || pin.trim() === "") {
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      const next = presentOperatorSession(await identifyOperator(selectedPersonId, pin));
      if (!next) {
        setActionState("error");
        setActionError("Identificarea nu a reușit.");
        return;
      }
      setPin("");
      setActionState("idle");
      writeResource(resourceKeys.operatorSession(), next);
      invalidateAfterOperatorSessionChange();
    } catch (error) {
      setActionState("error");
      const code =
        error instanceof TransportError ? readTransportErrorCode(error.body) : null;
      setActionError(
        code === "not_configured"
          ? "PIN-ul acestui operator nu este configurat."
          : "PIN-ul nu este recunoscut.",
      );
    }
  }

  async function configurePin(): Promise<void> {
    if (!selectedPersonId || pin.trim() === "" || pin !== confirmPin) {
      setActionState("error");
      setActionError("PIN-ul și confirmarea trebuie să coincidă.");
      return;
    }
    setActionState("pending");
    setActionError(null);
    try {
      await configureOperatorPin(selectedPersonId, pin, confirmPin);
      setConfirmPin("");
      setActionState("idle");
      invalidateAfterOperatorSessionChange();
    } catch {
      setActionState("error");
      setActionError("PIN-ul nu a putut fi configurat.");
    }
  }

  async function logout(): Promise<void> {
    await logoutOperator();
    writeResource(resourceKeys.operatorSession(), null);
    invalidateAfterOperatorSessionChange();
  }

  return (
    <SlicePage
      contextLabel="Atelier"
      currentHref={atelierHref({ jobId })}
      workspace="operational"
      eyebrow="Atelier"
      title="Atelier"
      lead={
        jobId
          ? "Identifică operatorul, apoi preia sarcina acestei lucrări."
          : "Identifică operatorul, apoi preia sarcina disponibilă."
      }
      status={
        !sessionKnown ? null : currentSession ? (
          <StatusBadge label={currentSession.displayName} tone={statusTone("workflow")} />
        ) : (
          <StatusBadge label="Neidentificat" tone={statusTone("warning")} />
        )
      }
      action={
        currentSession ? (
          <Button variant="secondary" onClick={() => void logout()}>
            Ieși din atelier
          </Button>
        ) : null
      }
    >
      {candidates.status === "error" && people.length === 0 ? (
        <InlineAlert tone="error" title="Atelierul nu a putut fi citit">
          Operatorii nu sunt disponibili.
        </InlineAlert>
      ) : null}
      {!sessionKnown || candidatesPending ? (
        <SurfacePanel variant="operational" title="Operator" label="Identificare" busy>
          <LoadingFloor variant="operational" label="Se citește atelierul" />
        </SurfacePanel>
      ) : !currentSession ? (
        <SurfacePanel variant="operational" title="Operator" label="Identificare">
          {people.length === 0 ? (
            <EmptyState
              title="Nu există operatori configurați"
              description="Calificările se setează explicit în organizație. Atelierul nu creează persoane și nu atribuie meserii."
            />
          ) : (
            <>
              <SelectField
                id="operator-person"
                label="Persoană"
                value={selectedPersonId}
                options={people.map((item) => ({
                  value: item.personId,
                  label: item.displayName,
                }))}
                onChange={setPersonId}
              />
              <TextField id="operator-pin" label="PIN" value={pin} onChange={setPin} />
              {selected && !selected.pinConfigured ? (
                <>
                  <TextField
                    id="operator-pin-confirm"
                    label="Confirmă PIN"
                    value={confirmPin}
                    onChange={setConfirmPin}
                  />
                  <Button
                    variant="secondary"
                    disabled={actionState === "pending"}
                    onClick={() => void configurePin()}
                  >
                    Configurează PIN
                  </Button>
                </>
              ) : (
                <Button disabled={actionState === "pending"} onClick={() => void login()}>
                  Intră în atelier
                </Button>
              )}
            </>
          )}
          {actionError ? (
            <InlineAlert tone="error" title="Identificarea a eșuat">
              {actionError}
            </InlineAlert>
          ) : null}
          <p className="ui-note">
            Lista preselectează prima persoană ca alegere de formular. Identificarea începe
            doar după PIN. Sarcinile apar după identificare. Pornirea rămâne pe execuție,
            nu pe această listă.
          </p>
        </SurfacePanel>
      ) : (
        <SurfacePanel
          variant="flush"
          label="Sarcini"
          busy={inbox.status === "loading" && tasks.length === 0}
        >
          <div className="lane-summary">
            <span>Autentificat: {currentSession.displayName}</span>
            <span>{inbox.status === "success" ? `${readyCount} gata` : "Se citește"}</span>
            <span>{inbox.status === "success" ? `${nextCount} urmează` : "…"}</span>
          </div>
          {inbox.status !== "success" && tasks.length === 0 ? (
            <LoadingFloor
              variant="registry"
              worklistVariant="operational"
              reserveToolbar={false}
              label="Se citesc sarcinile"
              columns={["Sarcină", "Context", "Pregătire", "Acțiune"]}
            />
          ) : null}
          {inbox.status === "success" && tasks.length === 0 ? (
            <div className="ui-panel__pad">
              <EmptyState
                title={
                  jobId
                    ? "Nu există sarcini pentru această lucrare în inbox."
                    : "Nu există sarcini în inbox-ul curent."
                }
              />
              {jobId ? (
                <p>
                  <a className="text-link" href={atelierHref()}>
                    Vezi toate sarcinile
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
          {tasks.length > 0 ? (
            <Worklist
              variant="operational"
              label="Sarcini disponibile"
              columns={["Sarcină", "Context", "Pregătire", "Acțiune"]}
            >
              {tasks.map((task, index) => {
                const lane = lanes[index] ?? presentInboxLane(task);
                return (
                  <WorklistRow
                    key={task.taskId}
                    variant="operational"
                    href={executionHref(task.planId, {
                      taskId: task.taskId,
                      jobId: task.jobId ?? jobId,
                    })}
                    identity={`${task.processLabel} · ${task.scopeLabel}`}
                    identityDetail={task.inscription || task.productLabel}
                    context={task.productLabel}
                    state={
                      <StatusBadge
                        label={lane.laneLabel}
                        tone={statusTone(task.canClaimStart ? "warning" : "workflow")}
                      />
                    }
                    actionLabel={lane.actionLabel}
                  />
                );
              })}
            </Worklist>
          ) : null}
          <div className="ui-panel__pad">
            <p className="ui-note">
              Ordinea vine din planul de execuție. Utilajul apare doar când operația îl
              cere.
            </p>
          </div>
        </SurfacePanel>
      )}
    </SlicePage>
  );
}
