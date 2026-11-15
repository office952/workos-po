import { useState, type ReactNode } from "react";
import {
  presentWorkcentersAdmin,
  type WorkcenterAdminMachine,
  type WorkcenterAdminWorkcenter,
  type WorkcentersAdminTransport,
} from "../adapters/workcentersAdapter";
import { readTransportErrorCode } from "../api/http";
import {
  createMachine,
  createWorkcenter,
  updateMachine,
  updateWorkcenter,
} from "../api/workcenters";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import {
  AdminChangeBar,
  AdminConfirmDialog,
  AdminRegistry,
  AdminRegistryRow,
  AdminSection,
  AdminSwitchDialog,
} from "../admin/adminParts";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterWorkcentersAdminChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadWorkcentersAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { statusTone } from "../presentation/statusTone";
import { adminMachineHref, adminWorkcenterHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";

type SaveState = "idle" | "pending" | "success" | "protected" | "error";

/**
 * Which drafts a server answer may replace. A zone and its machine are separate objects with separate
 * saves: saving one never overwrites the other one's unsaved values (R3 safety fix · P1-01).
 */
type KeepDrafts = { workcenter: boolean; machine: boolean };
const KEEP_BOTH: KeepDrafts = { workcenter: true, machine: true };
const RESET_BOTH: KeepDrafts = { workcenter: false, machine: false };
const SAVED_WORKCENTER: KeepDrafts = { workcenter: false, machine: true };
const SAVED_MACHINE: KeepDrafts = { workcenter: true, machine: false };

type WorkcentersAdminPageProps = {
  workcenterId?: string | null;
  machineId?: string | null;
};

function mutationMessage(code: string | null, fallback: string): string {
  switch (code) {
    case "forbidden":
      return "Nu ai dreptul să modifici zonele și utilajele.";
    case "invalid_label":
    case "invalid_payload":
      return "Numele nu este acceptat.";
    case "invalid_capability":
      return "Capabilitatea aleasă nu este canonică.";
    case "invalid_workcenter":
      return "Zona de lucru nu este valabilă.";
    case "provider_referenced":
      return "Această zonă sau acest utilaj a fost deja folosit în execuție, iar istoricul lucrărilor trebuie să rămână neschimbat. Capabilitățile lui și zona utilajului nu mai pot fi schimbate. Numele și descrierea se pot actualiza în continuare. Pentru o capabilitate nouă, adaugă o zonă nouă sau un utilaj nou cu acea capabilitate și activează-l.";
    case "has_open_assignment":
      return "Furnizorul este atribuit unei sarcini deschise și nu poate fi retras.";
    case "has_active_machines":
      return "Zona mai are utilaje active și nu poate fi retrasă.";
    default:
      return fallback;
  }
}

function capabilitySummary(labels: readonly string[]): string {
  return labels.length === 0 ? "Fără capabilități" : labels.join(", ");
}

function readCreatedWorkcenterId(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || !("workcenter" in body)) {
    return undefined;
  }
  const workcenter = (body as { workcenter?: { id?: unknown } }).workcenter;
  return typeof workcenter?.id === "string" ? workcenter.id : undefined;
}

function readCreatedMachineId(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || !("machine" in body)) {
    return undefined;
  }
  const machine = (body as { machine?: { id?: unknown } }).machine;
  return typeof machine?.id === "string" ? machine.id : undefined;
}

export function WorkcentersAdminPage({
  workcenterId = null,
  machineId = null,
}: WorkcentersAdminPageProps) {
  const admin = useResource(resourceKeys.workcentersAdmin(), loadWorkcentersAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<WorkcentersAdminTransport | null>(null);
  const [selectedWorkcenterId, setSelectedWorkcenterId] = useState(workcenterId ?? "");
  const [selectedMachineId, setSelectedMachineId] = useState(machineId ?? "");
  const [createWorkcenterName, setCreateWorkcenterName] = useState("");
  const [createWorkcenterDescription, setCreateWorkcenterDescription] = useState("");
  const [createMachineName, setCreateMachineName] = useState("");
  const [createMachineDescription, setCreateMachineDescription] = useState("");
  const [workcenterName, setWorkcenterName] = useState("");
  const [workcenterDescription, setWorkcenterDescription] = useState("");
  const [machineName, setMachineName] = useState("");
  const [machineDescription, setMachineDescription] = useState("");
  const [machineWorkcenterId, setMachineWorkcenterId] = useState("");
  const [workcenterCapabilityId, setWorkcenterCapabilityId] = useState("");
  const [machineCapabilityId, setMachineCapabilityId] = useState("");

  const [pendingSwitch, setPendingSwitch] = useState<{ workcenterId: string; machineId: string; label: string } | null>(
    null,
  );
  const [creating, setCreating] = useState<"workcenter" | "machine" | null>(null);
  const [partialSave, setPartialSave] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<"workcenter" | "machine" | null>(null);

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  const currentWorkcenter = model?.workcenters.find((item) => item.id === selectedWorkcenterId) ?? null;
  const currentMachine = model?.machines.find((item) => item.id === selectedMachineId) ?? null;
  const workcenterDirty =
    currentWorkcenter !== null &&
    (workcenterName !== currentWorkcenter.label || workcenterDescription !== (currentWorkcenter.description ?? ""));
  const machineDirty =
    currentMachine !== null &&
    (machineName !== currentMachine.label ||
      machineDescription !== (currentMachine.description ?? "") ||
      machineWorkcenterId !== currentMachine.workcenterId);
  const draftDirty = workcenterDirty || machineDirty;

  function applyAdmin(
    next: WorkcentersAdminTransport,
    preferredWorkcenterId = selectedWorkcenterId,
    preferredMachineId = selectedMachineId,
    keep: KeepDrafts = RESET_BOTH,
  ): void {
    // A refresh, another mutation or the other object's save keeps the values being edited (R1 · F2, P1-01).
    const keepWorkcenter = keep.workcenter && workcenterDirty && preferredWorkcenterId === selectedWorkcenterId;
    const keepMachine = keep.machine && machineDirty && preferredMachineId === selectedMachineId;
    setModel(next);
    const preferredWorkcenter =
      next.workcenters.find((item) => item.id === preferredWorkcenterId) ??
      next.workcenters[0] ??
      null;
    const workcenterMachines = next.machines.filter(
      (item) => item.workcenterId === (preferredWorkcenter?.id ?? ""),
    );
    const preferredMachine =
      workcenterMachines.find((item) => item.id === preferredMachineId) ??
      workcenterMachines[0] ??
      null;
    setSelectedWorkcenterId(preferredWorkcenter?.id ?? "");
    setSelectedMachineId(preferredMachine?.id ?? "");
    if (!keepWorkcenter) {
      setWorkcenterName(preferredWorkcenter?.label ?? "");
      setWorkcenterDescription(preferredWorkcenter?.description ?? "");
    }
    if (!keepMachine) {
      setMachineName(preferredMachine?.label ?? "");
      setMachineDescription(preferredMachine?.description ?? "");
      setMachineWorkcenterId(preferredMachine?.workcenterId ?? preferredWorkcenter?.id ?? "");
    }
    const nextWorkcenterCapability =
      next.capabilities.find(
        (item) => !preferredWorkcenter?.capabilityIds.includes(item.id),
      )?.id ?? "";
    const nextMachineCapability =
      next.capabilities.find((item) => !preferredMachine?.capabilityIds.includes(item.id))
        ?.id ?? "";
    setWorkcenterCapabilityId(nextWorkcenterCapability);
    setMachineCapabilityId(nextMachineCapability);
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data, workcenterId ?? selectedWorkcenterId, machineId ?? selectedMachineId, KEEP_BOTH);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Zonele și utilajele nu sunt disponibile.");
  }

  /** Opens a zone (machineId "") or a machine; the owner already answered for any draft. */
  function open(nextWorkcenterId: string, nextMachineId: string): void {
    if (!model) {
      return;
    }
    applyAdmin(model, nextWorkcenterId, nextMachineId);
    setPartialSave(null);
    setSaveState("idle");
    setErrorMessage(null);
    navigate(
      nextMachineId ? adminMachineHref(nextWorkcenterId, nextMachineId) : adminWorkcenterHref(nextWorkcenterId),
      "push",
      { bypassGuard: true },
    );
  }

  /** Every selection change goes through here: with a draft it asks first (R1 · F2). */
  function requestOpen(nextWorkcenterId: string, nextMachineId: string, label: string): void {
    if (!model) return;
    if (nextWorkcenterId === selectedWorkcenterId && (nextMachineId === "" || nextMachineId === selectedMachineId)) {
      return;
    }
    if (draftDirty) {
      setPendingSwitch({ workcenterId: nextWorkcenterId, machineId: nextMachineId, label });
      return;
    }
    open(nextWorkcenterId, nextMachineId);
  }

  function selectWorkcenter(nextId: string): void {
    const label = model?.workcenters.find((item) => item.id === nextId)?.label ?? "zona aleasă";
    requestOpen(nextId, "", label);
  }

  function selectMachine(nextWorkcenterId: string, nextMachineId: string): void {
    const label = model?.machines.find((item) => item.id === nextMachineId)?.label ?? "utilajul ales";
    requestOpen(nextWorkcenterId, nextMachineId, label);
  }

  function discardDraft(): void {
    setPartialSave(null);
    setWorkcenterName(currentWorkcenter?.label ?? "");
    setWorkcenterDescription(currentWorkcenter?.description ?? "");
    setMachineName(currentMachine?.label ?? "");
    setMachineDescription(currentMachine?.description ?? "");
    setMachineWorkcenterId(currentMachine?.workcenterId ?? currentWorkcenter?.id ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  /** Saves what is being edited: the zone, the machine, or both in order. */
  async function saveDraft(): Promise<boolean> {
    setPartialSave(null);
    const both = workcenterDirty && machineDirty;
    if (workcenterDirty && !(await saveWorkcenter())) return false;
    if (machineDirty && !(await saveMachine())) {
      // The zone stays saved (no artificial rollback); only the refused machine values remain a draft.
      if (both) {
        setPartialSave(
          "Zona a fost salvată. Modificările utilajului nu au fost salvate și au rămas în formular: corectează-le și salvează din nou, sau renunță la ele.",
        );
      }
      return false;
    }
    return true;
  }

  async function applyResult(
    result: Awaited<ReturnType<typeof createWorkcenter>>,
    fallback: string,
    preferredWorkcenterId?: string,
    preferredMachineId?: string,
    keep: KeepDrafts = KEEP_BOTH,
  ): Promise<boolean> {
    if (result.ok) {
      const presented = presentWorkcentersAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      setSource(presented);
      writeResource(resourceKeys.workcentersAdmin(), presented);
      applyAdmin(presented, preferredWorkcenterId, preferredMachineId, keep);
      invalidateAfterWorkcentersAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return true;
    }
    const code = readTransportErrorCode(result.body);
    setSaveState(code === "provider_referenced" ? "protected" : "error");
    const known = mutationMessage(code, "");
    setErrorMessage(
      adminFailureContent(known ? { text: known, diagnostic: null } : describeAdminFailure(result.status, result.body, {}, fallback)),
    );
    return false;
  }

  async function addWorkcenter(): Promise<void> {
    if (createWorkcenterName.trim() === "") {
      return;
    }
    setSaveState("pending");
    const result = await createWorkcenter({
      label: createWorkcenterName.trim(),
      description: createWorkcenterDescription.trim(),
    });
    const createdId = readCreatedWorkcenterId(result.body);
    const ok = await applyResult(result, "Zona nu a putut fi adăugată.", createdId, "");
    if (ok) {
      setCreating(null);
      setCreateWorkcenterName("");
      setCreateWorkcenterDescription("");
      if (createdId) {
        navigate(adminWorkcenterHref(createdId), "push", { bypassGuard: true });
      }
    }
  }

  async function saveWorkcenter(): Promise<boolean> {
    if (!selectedWorkcenterId) {
      return false;
    }
    setSaveState("pending");
    return applyResult(
      await updateWorkcenter(selectedWorkcenterId, {
        label: workcenterName.trim(),
        description: workcenterDescription.trim(),
      }),
      "Zona nu a putut fi salvată.",
      selectedWorkcenterId,
      selectedMachineId,
      SAVED_WORKCENTER,
    );
  }

  async function activateWorkcenter(): Promise<void> {
    if (!selectedWorkcenterId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateWorkcenter(selectedWorkcenterId, { lifecycle: "ACTIVE" }),
      "Zona nu a putut fi activată.",
      selectedWorkcenterId,
      selectedMachineId,
    );
  }

  async function retireSelectedWorkcenter(): Promise<boolean> {
    if (!selectedWorkcenterId) {
      return false;
    }
    setSaveState("pending");
    return applyResult(
      await updateWorkcenter(selectedWorkcenterId, { status: "RETIRED" }),
      "Zona nu a putut fi retrasă.",
      selectedWorkcenterId,
      selectedMachineId,
    );
  }

  async function assignWorkcenterCapability(): Promise<void> {
    if (!selectedWorkcenter || workcenterCapabilityId === "") {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateWorkcenter(selectedWorkcenter.id, {
        capabilityIds: [...selectedWorkcenter.capabilityIds, workcenterCapabilityId],
      }),
      "Capabilitatea nu a putut fi atribuită.",
      selectedWorkcenter.id,
      selectedMachineId,
    );
  }

  async function removeWorkcenterCapability(capabilityId: string): Promise<void> {
    if (!selectedWorkcenter) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateWorkcenter(selectedWorkcenter.id, {
        capabilityIds: selectedWorkcenter.capabilityIds.filter((item) => item !== capabilityId),
      }),
      "Capabilitatea nu a putut fi retrasă.",
      selectedWorkcenter.id,
      selectedMachineId,
    );
  }

  async function addMachine(): Promise<void> {
    if (!selectedWorkcenterId || createMachineName.trim() === "") {
      return;
    }
    setSaveState("pending");
    const result = await createMachine({
      label: createMachineName.trim(),
      description: createMachineDescription.trim(),
      workcenterId: selectedWorkcenterId,
    });
    const createdId = readCreatedMachineId(result.body);
    const ok = await applyResult(
      result,
      "Utilajul nu a putut fi adăugat.",
      selectedWorkcenterId,
      createdId,
    );
    if (ok) {
      setCreating(null);
      setCreateMachineName("");
      setCreateMachineDescription("");
      if (createdId) {
        navigate(adminMachineHref(selectedWorkcenterId, createdId), "push", { bypassGuard: true });
      }
    }
  }

  async function saveMachine(): Promise<boolean> {
    if (!selectedMachineId) {
      return false;
    }
    setSaveState("pending");
    return applyResult(
      await updateMachine(selectedMachineId, {
        label: machineName.trim(),
        description: machineDescription.trim(),
        workcenterId: machineWorkcenterId || undefined,
      }),
      "Utilajul nu a putut fi salvat.",
      selectedWorkcenterId,
      selectedMachineId,
      SAVED_MACHINE,
    );
  }

  async function activateMachine(): Promise<void> {
    if (!selectedMachineId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateMachine(selectedMachineId, { lifecycle: "ACTIVE" }),
      "Utilajul nu a putut fi activat.",
      selectedWorkcenterId,
      selectedMachineId,
    );
  }

  async function retireSelectedMachine(): Promise<boolean> {
    if (!selectedMachineId) {
      return false;
    }
    setSaveState("pending");
    return applyResult(
      await updateMachine(selectedMachineId, { status: "RETIRED" }),
      "Utilajul nu a putut fi retras.",
      selectedWorkcenterId,
      selectedMachineId,
    );
  }

  async function assignMachineCapability(): Promise<void> {
    if (!selectedMachine || machineCapabilityId === "") {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateMachine(selectedMachine.id, {
        capabilityIds: [...selectedMachine.capabilityIds, machineCapabilityId],
      }),
      "Capabilitatea nu a putut fi atribuită.",
      selectedWorkcenterId,
      selectedMachine.id,
    );
  }

  async function removeMachineCapability(capabilityId: string): Promise<void> {
    if (!selectedMachine) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateMachine(selectedMachine.id, {
        capabilityIds: selectedMachine.capabilityIds.filter((item) => item !== capabilityId),
      }),
      "Capabilitatea nu a putut fi retrasă.",
      selectedWorkcenterId,
      selectedMachine.id,
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;
  const selectedWorkcenter =
    model?.workcenters.find((item) => item.id === selectedWorkcenterId) ?? null;
  const selectedMachine =
    model?.machines.find((item) => item.id === selectedMachineId) ?? null;
  const workcenterMachines =
    model?.machines.filter((item) => item.workcenterId === selectedWorkcenterId) ?? [];
  const workcenterAssignable =
    model?.capabilities.filter(
      (item) => !selectedWorkcenter?.capabilityIds.includes(item.id),
    ) ?? [];
  const machineAssignable =
    model?.capabilities.filter((item) => !selectedMachine?.capabilityIds.includes(item.id)) ??
    [];
  const movableWorkcenters =
    model?.workcenters.filter((item) => item.lifecycle !== "RETIRED") ?? [];

  const draftSubject = machineDirty && currentMachine ? currentMachine.label : currentWorkcenter?.label ?? "zonă";
  const guard = useUnsavedChangesGuard({
    dirty: Boolean(model?.canEdit) && draftDirty,
    subject: machineDirty && currentMachine ? `Datele utilajului ${currentMachine.label}` : `Datele zonei ${draftSubject}`,
    save: saveDraft,
    onDiscard: discardDraft,
  });
  const dialogError = saveState === "error" || saveState === "protected" ? errorMessage : null;

  return (
    <AdminLayout
      current="workcenters"
      title="Zone și utilaje"
      lead="Zonele de lucru și utilajele pe care le citește și atelierul. Tariful CNC și al altor operații se setează la Costuri de producție, nu ca preț pe oră de mașină."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit: Boolean(model?.canEdit),
        whenEditable: "Doar proprietarul poate adăuga, modifica sau retrage zonele și utilajele.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
      action={
        model?.canEdit && loadState === "ready" ? (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setCreating("workcenter")}>
              Zonă nouă
            </Button>
            {selectedWorkcenter && selectedWorkcenter.lifecycle !== "RETIRED" ? (
              <Button variant="secondary" disabled={pending} onClick={() => setCreating("machine")}>
                Utilaj nou
              </Button>
            ) : null}
          </>
        ) : null
      }
      changeBar={
        draftDirty && model?.canEdit ? (
          <AdminChangeBar
            title={`Modificări nesalvate · ${draftSubject}`}
            detail={[
              workcenterDirty && currentWorkcenter && workcenterName !== currentWorkcenter.label
                ? `Zona: ${currentWorkcenter.label} → ${workcenterName}`
                : workcenterDirty
                  ? "Descrierea zonei"
                  : null,
              machineDirty && currentMachine && machineName !== currentMachine.label
                ? `Utilajul: ${currentMachine.label} → ${machineName}`
                : machineDirty
                  ? "Datele utilajului"
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            saveLabel={
              workcenterDirty && machineDirty ? "Salvează zona și utilajul" : machineDirty ? "Salvează utilajul" : "Salvează zona"
            }
            pending={pending}
            onDiscard={discardDraft}
            onSave={() => {
              void saveDraft();
            }}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă zonele și utilajele" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          {saveState === "success" && !draftDirty && creating === null ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată">
              Atelierul citește același registru de zone și utilaje.
            </InlineAlert>
          ) : null}
          {partialSave ? (
            <InlineAlert tone="pending" title="Salvare parțială">
              {partialSave}
            </InlineAlert>
          ) : null}
          {saveState === "protected" && errorMessage && !confirmRetire && !pendingSwitch ? (
            <InlineAlert tone="blocked" title="Protejat de istoricul de execuție">
              {errorMessage}
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage && !confirmRetire && !pendingSwitch && creating === null ? (
            <InlineAlert tone="error" title="Modificarea a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          {model.workcenters.length === 0 ? (
            <EmptyState
              title="Nu există zone de lucru"
              description="Adaugă prima zonă din browser dacă producția internă are nevoie. Lipsa zonelor sau a utilajelor nu blochează clienții și ofertele."
            />
          ) : (
            <AdminRegistry
              label="Zone de lucru"
              list={
                <ul className="adm-registry__items" aria-label="Zone de lucru">
                  {model.workcenters.map((workcenter) => (
                    <li key={workcenter.id}>
                      <AdminRegistryRow
                        title={workcenter.label}
                        detail={`${workcenter.lifecycleLabel} · ${capabilitySummary(workcenter.capabilityLabels)}`}
                        status={
                          workcenter.machineLabels.length === 0
                            ? "Fără utilaje"
                            : workcenter.machineLabels.length === 1
                              ? "1 utilaj"
                              : `${workcenter.machineLabels.length} utilaje`
                        }
                        muted={workcenter.lifecycle === "RETIRED"}
                        selected={workcenter.id === selectedWorkcenterId}
                        dirty={workcenter.id === selectedWorkcenterId && workcenterDirty}
                        onSelect={() => selectWorkcenter(workcenter.id)}
                      />
                      {model.machines.some((machine) => machine.workcenterId === workcenter.id) ? (
                        <ul className="adm-registry__items" aria-label={`Utilaje în ${workcenter.label}`}>
                          {model.machines
                            .filter((machine) => machine.workcenterId === workcenter.id)
                            .map((machine) => (
                              <li key={machine.id}>
                                <AdminRegistryRow
                                  indent
                                  title={machine.label}
                                  detail={capabilitySummary(machine.capabilityLabels)}
                                  status={machine.lifecycleLabel}
                                  muted={machine.lifecycle === "RETIRED"}
                                  selected={machine.id === selectedMachineId}
                                  dirty={machine.id === selectedMachineId && machineDirty}
                                  onSelect={() => selectMachine(workcenter.id, machine.id)}
                                />
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              }
              detail={
                <>
                  {selectedWorkcenter ? (
                    <WorkcenterDetail
                      workcenter={selectedWorkcenter}
                      machines={workcenterMachines}
                      selectedMachineId={selectedMachineId}
                      editEnabled={editEnabled}
                      canEdit={model.canEdit}
                      name={workcenterName}
                      description={workcenterDescription}
                      capabilityId={workcenterCapabilityId}
                      assignable={workcenterAssignable}
                      catalog={model.capabilities}
                      pending={pending}
                      onNameChange={setWorkcenterName}
                      onDescriptionChange={setWorkcenterDescription}
                      onCapabilityChange={setWorkcenterCapabilityId}
                      onSelectMachine={(id) => selectMachine(selectedWorkcenter.id, id)}
                      onActivate={() => {
                        void activateWorkcenter();
                      }}
                      onRetire={() => {
                        setSaveState("idle");
                        setErrorMessage(null);
                        setConfirmRetire("workcenter");
                      }}
                      onAssignCapability={() => {
                        void assignWorkcenterCapability();
                      }}
                      onRemoveCapability={(id) => {
                        void removeWorkcenterCapability(id);
                      }}
                    />
                  ) : null}
                  {selectedMachine ? (
                    <MachineDetail
                      machine={selectedMachine}
                      workcenters={movableWorkcenters}
                      editEnabled={editEnabled}
                      canEdit={model.canEdit}
                      name={machineName}
                      description={machineDescription}
                      workcenterId={machineWorkcenterId}
                      capabilityId={machineCapabilityId}
                      assignable={machineAssignable}
                      catalog={model.capabilities}
                      pending={pending}
                      onNameChange={setMachineName}
                      onDescriptionChange={setMachineDescription}
                      onWorkcenterChange={setMachineWorkcenterId}
                      onCapabilityChange={setMachineCapabilityId}
                      onActivate={() => {
                        void activateMachine();
                      }}
                      onRetire={() => {
                        setSaveState("idle");
                        setErrorMessage(null);
                        setConfirmRetire("machine");
                      }}
                      onAssignCapability={() => {
                        void assignMachineCapability();
                      }}
                      onRemoveCapability={(id) => {
                        void removeMachineCapability(id);
                      }}
                    />
                  ) : null}
                </>
              }
            />
          )}
          <AdminSection title="Acoperire curentă" description="Ce capabilități au deja o zonă sau un utilaj activ.">
            {model.coverage.filter((item) => item.coverage !== "NO_PROVIDER").length === 0 ? (
              <p>Nicio capabilitate nu este acoperită încă.</p>
            ) : (
              <ul className="adm-bullets">
                {model.coverage
                  .filter((item) => item.coverage !== "NO_PROVIDER")
                  .map((item) => (
                    <li key={item.label}>
                      {item.label}: {item.coverageLabel}
                      {item.providerLabels.length > 0 ? ` · ${item.providerLabels.join(", ")}` : ""}
                    </li>
                  ))}
              </ul>
            )}
          </AdminSection>
        </>
      ) : null}
      {creating === "workcenter" ? (
        <CreationDialog title="Zonă nouă" busy={pending} onDismiss={() => setCreating(null)}>
          <div className="adm-dialog">
            <TextField
              id="workcenter-create-name"
              label="Nume"
              value={createWorkcenterName}
              disabled={pending}
              onChange={setCreateWorkcenterName}
            />
            <TextField
              id="workcenter-create-description"
              label="Descriere"
              value={createWorkcenterDescription}
              hint="Opțional."
              disabled={pending}
              onChange={setCreateWorkcenterDescription}
            />
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Modificarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            <div className="adm-dialog__actions">
              <Button variant="secondary" disabled={pending} onClick={() => setCreating(null)}>
                Anulează
              </Button>
              <Button
                disabled={pending || createWorkcenterName.trim() === ""}
                onClick={() => {
                  void addWorkcenter();
                }}
              >
                Adaugă zona
              </Button>
            </div>
          </div>
        </CreationDialog>
      ) : null}
      {creating === "machine" && selectedWorkcenter ? (
        <CreationDialog
          title="Utilaj nou"
          subtitle={`În zona ${selectedWorkcenter.label}`}
          busy={pending}
          onDismiss={() => setCreating(null)}
        >
          <div className="adm-dialog">
            <TextField
              id="machine-create-name"
              label="Nume utilaj"
              value={createMachineName}
              disabled={pending}
              onChange={setCreateMachineName}
            />
            <TextField
              id="machine-create-description"
              label="Descriere utilaj"
              value={createMachineDescription}
              hint="Opțional."
              disabled={pending}
              onChange={setCreateMachineDescription}
            />
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Modificarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            <div className="adm-dialog__actions">
              <Button variant="secondary" disabled={pending} onClick={() => setCreating(null)}>
                Anulează
              </Button>
              <Button
                disabled={pending || createMachineName.trim() === ""}
                onClick={() => {
                  void addMachine();
                }}
              >
                Adaugă utilajul
              </Button>
            </div>
          </div>
        </CreationDialog>
      ) : null}
      {pendingSwitch ? (
        <AdminSwitchDialog
          subject={draftSubject}
          target={pendingSwitch.label}
          busy={pending}
          error={
            partialSave && dialogError ? (
              <>
                {partialSave} {dialogError}
              </>
            ) : (
              dialogError
            )
          }
          onSave={() => {
            const target = pendingSwitch;
            void saveDraft().then((ok) => {
              if (ok) {
                setPendingSwitch(null);
                open(target.workcenterId, target.machineId);
              }
            });
          }}
          onDiscard={() => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            open(target.workcenterId, target.machineId);
          }}
          onStay={() => {
            setPendingSwitch(null);
            setSaveState("idle");
            setErrorMessage(null);
          }}
        />
      ) : null}
      {confirmRetire === "workcenter" && selectedWorkcenter ? (
        <AdminConfirmDialog
          title={`Retragi zona ${selectedWorkcenter.label}?`}
          confirmLabel="Retrage zona"
          danger
          busy={pending}
          error={dialogError}
          onConfirm={() => {
            void retireSelectedWorkcenter().then((ok) => {
              if (ok) setConfirmRetire(null);
            });
          }}
          onCancel={() => {
            setConfirmRetire(null);
            setSaveState("idle");
            setErrorMessage(null);
          }}
        >
          <p>Zona nu mai primește lucrări noi. Istoricul lucrărilor la care a fost folosită rămâne neschimbat.</p>
          <p>Dacă zona mai are utilaje active sau sarcini deschise, retragerea este refuzată și vezi motivul aici.</p>
        </AdminConfirmDialog>
      ) : null}
      {confirmRetire === "machine" && selectedMachine ? (
        <AdminConfirmDialog
          title={`Retragi utilajul ${selectedMachine.label}?`}
          confirmLabel="Retrage utilajul"
          danger
          busy={pending}
          error={dialogError}
          onConfirm={() => {
            void retireSelectedMachine().then((ok) => {
              if (ok) setConfirmRetire(null);
            });
          }}
          onCancel={() => {
            setConfirmRetire(null);
            setSaveState("idle");
            setErrorMessage(null);
          }}
        >
          <p>Utilajul nu mai primește lucrări noi. Istoricul lucrărilor la care a fost folosit rămâne neschimbat.</p>
          <p>Dacă utilajul are o sarcină deschisă, retragerea este refuzată și vezi motivul aici.</p>
        </AdminConfirmDialog>
      ) : null}
      {guard}
    </AdminLayout>
  );
}


function WorkcenterDetail({
  workcenter,
  machines,
  selectedMachineId,
  editEnabled,
  canEdit,
  name,
  description,
  capabilityId,
  assignable,
  catalog,
  pending,
  onNameChange,
  onDescriptionChange,
  onCapabilityChange,
  onSelectMachine,
  onActivate,
  onRetire,
  onAssignCapability,
  onRemoveCapability,
}: {
  workcenter: WorkcenterAdminWorkcenter;
  machines: readonly WorkcenterAdminMachine[];
  selectedMachineId: string;
  editEnabled: boolean;
  canEdit: boolean;
  name: string;
  description: string;
  capabilityId: string;
  assignable: readonly { id: string; label: string }[];
  catalog: readonly { id: string; label: string }[];
  pending: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCapabilityChange: (value: string) => void;
  onSelectMachine: (machineId: string) => void;
  onActivate: () => void;
  onRetire: () => void;
  onAssignCapability: () => void;
  onRemoveCapability: (capabilityId: string) => void;
}) {
  const active = workcenter.lifecycle !== "RETIRED";
  return (
    <SurfacePanel
      title={workcenter.label}
      label="Detaliu zonă"
      status={
        <StatusBadge
          label={workcenter.lifecycleLabel}
          tone={
            workcenter.lifecycle === "ACTIVE"
              ? statusTone("success")
              : workcenter.lifecycle === "PLANNED"
                ? statusTone("warning")
                : statusTone("workflow")
          }
        />
      }
    >
      <TextField
        id="workcenter-name"
        label="Nume"
        value={name}
        disabled={!editEnabled || !active}
        onChange={onNameChange}
      />
      <TextField
        id="workcenter-description"
        label="Descriere"
        value={description}
        disabled={!editEnabled || !active}
        onChange={onDescriptionChange}
      />
      {canEdit && active ? (
        <>
          {workcenter.lifecycle === "PLANNED" ? (
            <Button variant="secondary" disabled={!editEnabled} onClick={onActivate}>
              Activează zona
            </Button>
          ) : null}
          <Button variant="secondary" disabled={!editEnabled} onClick={onRetire}>
            Retrage zona
          </Button>
        </>
      ) : null}
      <p className="section-label">Capabilități</p>
      {workcenter.capabilityIds.length === 0 ? (
        <p>Nu are capabilități atribuite.</p>
      ) : (
        workcenter.capabilityIds.map((id) => {
          const label = catalog.find((item) => item.id === id)?.label ?? "";
          return (
            <div key={id} className="stack">
              <p>{label}</p>
              {canEdit && active ? (
                <Button
                  variant="ghost"
                  disabled={!editEnabled}
                  onClick={() => onRemoveCapability(id)}
                >
                  Retrage capabilitatea
                </Button>
              ) : null}
            </div>
          );
        })
      )}
      {canEdit && active && assignable.length > 0 ? (
        <>
          <SelectField
            id="workcenter-capability"
            label="Capabilitate"
            value={capabilityId}
            disabled={!editEnabled}
            options={assignable.map((item) => ({ value: item.id, label: item.label }))}
            onChange={onCapabilityChange}
          />
          <Button
            variant="secondary"
            disabled={!editEnabled || capabilityId === ""}
            onClick={onAssignCapability}
          >
            Atribuie capabilitatea
          </Button>
        </>
      ) : null}
      <p className="section-label">Utilaje din zonă</p>
      {machines.length === 0 ? (
        <p>Nu există utilaje în această zonă.</p>
      ) : (
        <Worklist variant="compact" label="Utilaje">
          {machines.map((machine) => (
            <WorklistRow
              key={machine.id}
              variant="compact"
              selected={machine.id === selectedMachineId}
              onSelect={() => onSelectMachine(machine.id)}
              identity={machine.label}
              identityDetail={`${machine.lifecycleLabel} · ${capabilitySummary(machine.capabilityLabels)}`}
            />
          ))}
        </Worklist>
      )}
      {pending ? <LoadingIndicator label="Se salvează zonele și utilajele" /> : null}
    </SurfacePanel>
  );
}

function MachineDetail({
  machine,
  workcenters,
  editEnabled,
  canEdit,
  name,
  description,
  workcenterId,
  capabilityId,
  assignable,
  catalog,
  pending,
  onNameChange,
  onDescriptionChange,
  onWorkcenterChange,
  onCapabilityChange,
  onActivate,
  onRetire,
  onAssignCapability,
  onRemoveCapability,
}: {
  machine: WorkcenterAdminMachine;
  workcenters: readonly WorkcenterAdminWorkcenter[];
  editEnabled: boolean;
  canEdit: boolean;
  name: string;
  description: string;
  workcenterId: string;
  capabilityId: string;
  assignable: readonly { id: string; label: string }[];
  catalog: readonly { id: string; label: string }[];
  pending: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onWorkcenterChange: (value: string) => void;
  onCapabilityChange: (value: string) => void;
  onActivate: () => void;
  onRetire: () => void;
  onAssignCapability: () => void;
  onRemoveCapability: (capabilityId: string) => void;
}) {
  const active = machine.lifecycle !== "RETIRED";
  return (
    <SurfacePanel
      title={machine.label}
      label="Detaliu utilaj"
      status={
        <StatusBadge
          label={machine.lifecycleLabel}
          tone={
            machine.lifecycle === "ACTIVE"
              ? statusTone("success")
              : machine.lifecycle === "PLANNED"
                ? statusTone("warning")
                : statusTone("workflow")
          }
        />
      }
    >
      <TextField
        id="machine-name"
        label="Nume"
        value={name}
        disabled={!editEnabled || !active}
        onChange={onNameChange}
      />
      <TextField
        id="machine-description"
        label="Descriere"
        value={description}
        disabled={!editEnabled || !active}
        onChange={onDescriptionChange}
      />
      <SelectField
        id="machine-workcenter"
        label="Zonă"
        value={workcenterId}
        disabled={!editEnabled || !active}
        options={workcenters.map((item) => ({ value: item.id, label: item.label }))}
        onChange={onWorkcenterChange}
      />
      {canEdit && active ? (
        <>
          {machine.lifecycle === "PLANNED" ? (
            <Button variant="secondary" disabled={!editEnabled} onClick={onActivate}>
              Activează utilajul
            </Button>
          ) : null}
          <Button variant="secondary" disabled={!editEnabled} onClick={onRetire}>
            Retrage utilajul
          </Button>
        </>
      ) : null}
      <p className="section-label">Capabilități</p>
      {machine.capabilityIds.length === 0 ? (
        <p>Nu are capabilități atribuite.</p>
      ) : (
        machine.capabilityIds.map((id) => {
          const label = catalog.find((item) => item.id === id)?.label ?? "";
          return (
            <div key={id} className="stack">
              <p>{label}</p>
              {canEdit && active ? (
                <Button
                  variant="ghost"
                  disabled={!editEnabled}
                  onClick={() => onRemoveCapability(id)}
                >
                  Retrage capabilitatea
                </Button>
              ) : null}
            </div>
          );
        })
      )}
      {canEdit && active && assignable.length > 0 ? (
        <>
          <SelectField
            id="machine-capability"
            label="Capabilitate utilaj"
            value={capabilityId}
            disabled={!editEnabled}
            options={assignable.map((item) => ({ value: item.id, label: item.label }))}
            onChange={onCapabilityChange}
          />
          <Button
            variant="secondary"
            disabled={!editEnabled || capabilityId === ""}
            onClick={onAssignCapability}
          >
            Atribuie capabilitatea
          </Button>
        </>
      ) : null}
      {pending ? <LoadingIndicator label="Se salvează utilajul" /> : null}
    </SurfacePanel>
  );
}
