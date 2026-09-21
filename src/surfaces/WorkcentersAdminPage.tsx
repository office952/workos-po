import { useState } from "react";
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
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
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
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { statusTone } from "../presentation/statusTone";
import { adminMachineHref, adminWorkcenterHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";

type SaveState = "idle" | "pending" | "success" | "error";

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
      return "Istoricul de execuție păstrează acest furnizor. Capabilitățile și mutarea nu pot fi schimbate.";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(
    next: WorkcentersAdminTransport,
    preferredWorkcenterId = selectedWorkcenterId,
    preferredMachineId = selectedMachineId,
  ): void {
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
    setWorkcenterName(preferredWorkcenter?.label ?? "");
    setWorkcenterDescription(preferredWorkcenter?.description ?? "");
    setMachineName(preferredMachine?.label ?? "");
    setMachineDescription(preferredMachine?.description ?? "");
    setMachineWorkcenterId(preferredMachine?.workcenterId ?? preferredWorkcenter?.id ?? "");
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
    applyAdmin(admin.data, workcenterId ?? selectedWorkcenterId, machineId ?? selectedMachineId);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Zonele și utilajele nu sunt disponibile.");
  }

  function selectWorkcenter(nextId: string): void {
    if (!model) {
      return;
    }
    applyAdmin(model, nextId, "");
    navigate(adminWorkcenterHref(nextId));
  }

  function selectMachine(nextWorkcenterId: string, nextMachineId: string): void {
    if (!model) {
      return;
    }
    applyAdmin(model, nextWorkcenterId, nextMachineId);
    navigate(adminMachineHref(nextWorkcenterId, nextMachineId));
  }

  async function applyResult(
    result: Awaited<ReturnType<typeof createWorkcenter>>,
    fallback: string,
    preferredWorkcenterId?: string,
    preferredMachineId?: string,
  ): Promise<boolean> {
    if (result.ok) {
      const presented = presentWorkcentersAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return false;
      }
      writeResource(resourceKeys.workcentersAdmin(), presented);
      applyAdmin(presented, preferredWorkcenterId, preferredMachineId);
      invalidateAfterWorkcentersAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return true;
    }
    setSaveState("error");
    setErrorMessage(mutationMessage(readTransportErrorCode(result.body), fallback));
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
      setCreateWorkcenterName("");
      setCreateWorkcenterDescription("");
      if (createdId) {
        navigate(adminWorkcenterHref(createdId));
      }
    }
  }

  async function saveWorkcenter(): Promise<void> {
    if (!selectedWorkcenterId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateWorkcenter(selectedWorkcenterId, {
        label: workcenterName.trim(),
        description: workcenterDescription.trim(),
      }),
      "Zona nu a putut fi salvată.",
      selectedWorkcenterId,
      selectedMachineId,
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

  async function retireSelectedWorkcenter(): Promise<void> {
    if (!selectedWorkcenterId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
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
      setCreateMachineName("");
      setCreateMachineDescription("");
      if (createdId) {
        navigate(adminMachineHref(selectedWorkcenterId, createdId));
      }
    }
  }

  async function saveMachine(): Promise<void> {
    if (!selectedMachineId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updateMachine(selectedMachineId, {
        label: machineName.trim(),
        description: machineDescription.trim(),
        workcenterId: machineWorkcenterId || undefined,
      }),
      "Utilajul nu a putut fi salvat.",
      selectedWorkcenterId,
      selectedMachineId,
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

  async function retireSelectedMachine(): Promise<void> {
    if (!selectedMachineId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
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

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/workcenters"
      workspace="admin"
      eyebrow="Administrare"
      title="Zone și utilaje"
      lead="Configurează zonele de lucru și utilajele. Atelierul citește același registru."
      meta={
        model?.canEdit
          ? "Doar Owner poate adăuga, modifica sau retrage zonele și utilajele."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail label="Administrare" items={administrationRailItems("workcenters")} />
          <SurfacePanel title="Zone și utilaje" label="Zone" busy>
            <LoadingFloor variant="admin" label="Se încarcă zonele și utilajele" />
          </SurfacePanel>
        </>
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          <CollectionRail label="Administrare" items={administrationRailItems("workcenters")} />
          {saveState === "success" ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată">
              Atelierul citește același registru de zone și utilaje.
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage ? (
            <InlineAlert tone="error" title="Modificarea a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          <SurfacePanel title="Zone de lucru" label="Listă">
            {model.workcenters.length === 0 ? (
              <EmptyState
                title="Nu există zone de lucru"
                description="Adaugă prima zonă din browser. Organizația nouă pornește fără zone și fără utilaje."
              />
            ) : (
              <Worklist variant="compact" label="Zone de lucru">
                {model.workcenters.map((workcenter) => (
                  <WorklistRow
                    key={workcenter.id}
                    variant="compact"
                    selected={workcenter.id === selectedWorkcenterId}
                    onSelect={() => selectWorkcenter(workcenter.id)}
                    identity={workcenter.label}
                    identityDetail={`${workcenter.lifecycleLabel} · ${capabilitySummary(workcenter.capabilityLabels)}`}
                    context={
                      workcenter.machineLabels.length === 0
                        ? "Fără utilaje"
                        : workcenter.machineLabels.join(", ")
                    }
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>
          {model.canEdit ? (
            <SurfacePanel title="Zonă nouă" label="Adăugare">
              <TextField
                id="workcenter-create-name"
                label="Nume"
                value={createWorkcenterName}
                disabled={!editEnabled}
                onChange={setCreateWorkcenterName}
              />
              <TextField
                id="workcenter-create-description"
                label="Descriere"
                value={createWorkcenterDescription}
                hint="Opțional."
                disabled={!editEnabled}
                onChange={setCreateWorkcenterDescription}
              />
              <Button
                disabled={!editEnabled || createWorkcenterName.trim() === ""}
                onClick={() => {
                  void addWorkcenter();
                }}
              >
                Adaugă zona
              </Button>
            </SurfacePanel>
          ) : (
            <p>Editarea nu este disponibilă pentru acest rol.</p>
          )}
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
              onSave={() => {
                void saveWorkcenter();
              }}
              onActivate={() => {
                void activateWorkcenter();
              }}
              onRetire={() => {
                void retireSelectedWorkcenter();
              }}
              onAssignCapability={() => {
                void assignWorkcenterCapability();
              }}
              onRemoveCapability={(id) => {
                void removeWorkcenterCapability(id);
              }}
            />
          ) : null}
          {model.canEdit && selectedWorkcenter && selectedWorkcenter.lifecycle !== "RETIRED" ? (
            <SurfacePanel title="Utilaj nou" label="Adăugare">
              <TextField
                id="machine-create-name"
                label="Nume utilaj"
                value={createMachineName}
                disabled={!editEnabled}
                onChange={setCreateMachineName}
              />
              <TextField
                id="machine-create-description"
                label="Descriere utilaj"
                value={createMachineDescription}
                hint="Opțional."
                disabled={!editEnabled}
                onChange={setCreateMachineDescription}
              />
              <Button
                disabled={!editEnabled || createMachineName.trim() === ""}
                onClick={() => {
                  void addMachine();
                }}
              >
                Adaugă utilajul
              </Button>
            </SurfacePanel>
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
              onSave={() => {
                void saveMachine();
              }}
              onActivate={() => {
                void activateMachine();
              }}
              onRetire={() => {
                void retireSelectedMachine();
              }}
              onAssignCapability={() => {
                void assignMachineCapability();
              }}
              onRemoveCapability={(id) => {
                void removeMachineCapability(id);
              }}
            />
          ) : null}
          <SurfacePanel title="Acoperire curentă" label="Registru">
            {model.coverage.filter((item) => item.coverage !== "NO_PROVIDER").length === 0 ? (
              <p>Nicio capabilitate nu este acoperită încă.</p>
            ) : (
              model.coverage
                .filter((item) => item.coverage !== "NO_PROVIDER")
                .map((item) => (
                  <p key={item.label}>
                    {item.label}: {item.coverageLabel}
                    {item.providerLabels.length > 0 ? ` · ${item.providerLabels.join(", ")}` : ""}
                  </p>
                ))
            )}
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
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
  onSave,
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
  onSave: () => void;
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
          <Button disabled={!editEnabled} onClick={onSave}>
            Salvează zona
          </Button>
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
  onSave,
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
  onSave: () => void;
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
          <Button disabled={!editEnabled} onClick={onSave}>
            Salvează utilajul
          </Button>
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
