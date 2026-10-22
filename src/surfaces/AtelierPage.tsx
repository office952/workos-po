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
import { presentInboxContext, presentInboxLane, inboxLaneLabel } from "../presentation/inboxLane";
import type { InboxTaskLane } from "../api/types";
import "../styles/surfaces/atelier.css";
import { statusTone } from "../presentation/statusTone";
import { atelierHref, executionHref } from "../routing/appRoute";

type AtelierPageProps = {
  jobId?: string | null;
  returnTo?: string | null;
};

export function AtelierPage({ jobId = null, returnTo = null }: AtelierPageProps) {
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
    const all = inbox.data?.tasks ?? [];
    if (!jobId) {
      return all;
    }
    return all.filter((task) => task.jobId === jobId);
  }, [inbox.data, jobId]);
  const selectedPersonId = personId || people[0]?.personId || "";
  const selected = people.find((item) => item.personId === selectedPersonId) ?? null;
  const laneOrder: InboxTaskLane[] = [
    "in_progress_mine",
    "available_ready",
    "available_needs_provider",
    "waiting_dependencies",
    "blocked_material",
  ];
  const laneGroups = laneOrder
    .map((lane) => ({
      lane,
      label: inboxLaneLabel(lane),
      tasks: tasks.filter((task) => task.lane === lane),
    }))
    .filter((group) => group.tasks.length > 0);
  const inProgressCount = tasks.filter((task) => task.lane === "in_progress_mine").length;
  const readyCount = tasks.filter((task) => task.lane === "available_ready").length;
  const needsProviderCount = tasks.filter((task) => task.lane === "available_needs_provider").length;
  const waitingCount = tasks.filter((task) => task.lane === "waiting_dependencies").length;
  const blockedCount = tasks.filter((task) => task.lane === "blocked_material").length;
  const displayOrderNote = inbox.data?.displayOrderNote ?? null;
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
          ? "Identifică operatorul. Lista arată starea acestei lucrări; pornirea rămâne pe execuție."
          : "Identifică operatorul. Lista arată starea fiecărei sarcini; pornirea rămâne pe execuție."
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
            <div className="atelier-identify">
              <div className="atelier-identify__form">
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
              <TextField
                id="operator-pin"
                label="PIN"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={setPin}
              />
              {selected && !selected.pinConfigured ? (
                <>
                  <TextField
                    id="operator-pin-confirm"
                    label="Confirmă PIN"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
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
          {actionError ? (
            <InlineAlert tone="error" title="Identificarea a eșuat">
              {actionError}
            </InlineAlert>
          ) : null}
              </div>
              <aside className="atelier-identify__aside">
                <p className="atelier-identify__kicker">Identificare</p>
                <p>PIN-ul confirmă persoana. Lista nu pornește lucrul.</p>
                <p>După identificare deschizi execuția pentru sarcina aleasă.</p>
                {returnTo ? (
                  <p>
                    <a className="text-link" href={returnTo}>
                      Revino la operație
                    </a>
                  </p>
                ) : null}
              </aside>
            </div>
          )}
        </SurfacePanel>
      ) : (
        <SurfacePanel
          variant="flush"
          label="Sarcini"
          busy={inbox.status === "loading" && tasks.length === 0}
        >
          <div className="lane-summary atelier-status">
            <p className="atelier-operator">
              <span className="atelier-operator__kicker">Operator</span>
              <strong>Autentificat: {currentSession.displayName}</strong>
            </p>
            {returnTo ? (
              <a className="text-link" href={returnTo}>
                Revino la operație
              </a>
            ) : null}
            {inbox.status === "success" ? (
              <>
                <span>{inProgressCount} în lucru de tine</span>
                <span>{readyCount} pot fi pornite</span>
                {needsProviderCount > 0 ? (
                  <span>{needsProviderCount} necesită alocare</span>
                ) : null}
                {waitingCount > 0 ? <span>{waitingCount} așteaptă dependențe</span> : null}
                {blockedCount > 0 ? <span>{blockedCount} material blocant</span> : null}
              </>
            ) : (
              <span>Se citește</span>
            )}
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
          <div className="atelier-queue">
            {laneGroups.map((group) => (
              <section key={group.lane} className="atelier-lane" data-lane={group.lane} aria-labelledby={`atelier-lane-${group.lane}`}>
              <h2 className="atelier-lane__title" id={`atelier-lane-${group.lane}`}>{group.label}</h2>
              <Worklist
                variant="operational"
                label={group.label}
                columns={["Sarcină", "Lucrare", "Stare", "Acțiune"]}
              >
                {group.tasks.map((task) => {
                  const lane = presentInboxLane(task);
                  return (
                    <WorklistRow
                      key={task.taskId}
                      variant="operational"
                      href={executionHref(task.planId, {
                        taskId: task.taskId,
                        jobId: task.jobId ?? jobId,
                      })}
                      identity={`${task.seqLabel ? `${task.seqLabel} ` : ""}${task.processLabel} · ${task.scopeLabel}`}
                      identityDetail={lane.reason}
                      context={presentInboxContext(task)}
                      state={<StatusBadge label={lane.laneLabel} tone={statusTone(lane.tone)} />}
                      actionLabel={lane.actionLabel}
                    />
                  );
                })}
              </Worklist>
              </section>
            ))}
          </div>
          <div className="ui-panel__pad">
            <p className="ui-note">
              Deschide execuția duce la sarcină. Nu pornește lucrul.
              {displayOrderNote ? ` ${displayOrderNote}` : ""}
            </p>
          </div>
        </SurfacePanel>
      )}
    </SlicePage>
  );
}
