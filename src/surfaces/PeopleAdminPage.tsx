import { useState } from "react";
import {
  presentPeopleAdmin,
  type PeopleAdminPerson,
  type PeopleAdminTransport,
} from "../adapters/peopleAdapter";
import { readTransportErrorCode } from "../api/http";
import {
  assignPersonSkill,
  configurePersonOperatorPin,
  createPerson,
  retirePersonSkill,
  updatePerson,
} from "../api/people";
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
import { invalidateAfterPeopleAdminChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadPeopleAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { statusTone } from "../presentation/statusTone";
import { adminPersonHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";

type SaveState = "idle" | "pending" | "success" | "error";

type PeopleAdminPageProps = {
  personId?: string | null;
};

function pinStatusLabel(configured: boolean): string {
  return configured ? "PIN configurat" : "PIN neconfigurat";
}

function readCreatedPersonId(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || !("person" in body)) {
    return undefined;
  }
  const person = (body as { person?: { personId?: unknown } }).person;
  return typeof person?.personId === "string" ? person.personId : undefined;
}

function skillSummary(person: PeopleAdminPerson): string {
  if (person.skills.length === 0) {
    return "Fără calificări";
  }
  return person.skills.map((item) => item.displayLabel).join(", ");
}

function mutationMessage(code: string | null, fallback: string): string {
  switch (code) {
    case "forbidden":
      return "Nu ai dreptul să modifici oamenii operaționali.";
    case "invalid_name":
    case "invalid_payload":
      return "Numele nu este acceptat.";
    case "has_active_task":
      return "Persoana are o sarcină în lucru și nu poate fi retrasă.";
    case "retired_person":
      return "Persoana retrasă nu mai primește calificări.";
    case "retired_skill":
      return "Calificarea nu mai poate fi atribuită.";
    case "already_assigned":
      return "Calificarea este deja atribuită.";
    case "invalid_pin":
    case "pin_mismatch":
      return "PIN-ul și confirmarea trebuie să coincidă.";
    default:
      return fallback;
  }
}

export function PeopleAdminPage({ personId = null }: PeopleAdminPageProps) {
  const admin = useResource(resourceKeys.peopleAdmin(), loadPeopleAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<PeopleAdminTransport | null>(null);
  const [selectedId, setSelectedId] = useState(personId ?? "");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [availability, setAvailability] = useState<"AVAILABLE" | "TEMPORARILY_UNAVAILABLE">(
    "AVAILABLE",
  );
  const [unavailableReason, setUnavailableReason] = useState("");
  const [unavailableUntil, setUnavailableUntil] = useState("");
  const [skillId, setSkillId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(next: PeopleAdminTransport, preferredId = selectedId): void {
    setModel(next);
    const preferred = next.people.find((item) => item.personId === preferredId) ?? next.people[0];
    const current = preferred ?? null;
    setSelectedId(current?.personId ?? "");
    setDisplayName(current?.displayName ?? "");
    setRoleLabel(current?.roleLabel ?? "");
    setAvailability(current?.availability ?? "AVAILABLE");
    setUnavailableReason(current?.unavailableReason ?? "");
    setUnavailableUntil(current?.unavailableUntil ?? "");
    const assignable = next.skills.filter(
      (skill) =>
        skill.status === "ACTIVE" &&
        !current?.skills.some((item) => item.skillId === skill.skillId),
    );
    setSkillId(assignable[0]?.skillId ?? "");
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data, personId ?? selectedId);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Oamenii operaționali nu sunt disponibili.");
  }

  function selectPerson(nextId: string): void {
    if (!model) {
      return;
    }
    applyAdmin(model, nextId);
    navigate(adminPersonHref(nextId));
  }

  async function applyResult(
    result: Awaited<ReturnType<typeof createPerson>>,
    fallback: string,
    preferredId?: string,
  ): Promise<boolean> {
    if (result.ok) {
      const presented = presentPeopleAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return false;
      }
      writeResource(resourceKeys.peopleAdmin(), presented);
      applyAdmin(presented, preferredId);
      invalidateAfterPeopleAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return true;
    }
    setSaveState("error");
    setErrorMessage(mutationMessage(readTransportErrorCode(result.body), fallback));
    return false;
  }

  async function create(): Promise<void> {
    if (createName.trim() === "") {
      return;
    }
    setSaveState("pending");
    const result = await createPerson({
      displayName: createName.trim(),
      roleLabel: createRole.trim() === "" ? null : createRole.trim(),
    });
    const createdId = readCreatedPersonId(result.body);
    const ok = await applyResult(result, "Persoana nu a putut fi adăugată.", createdId);
    if (ok) {
      setCreateName("");
      setCreateRole("");
      if (createdId) {
        navigate(adminPersonHref(createdId));
      }
    }
  }

  async function saveProfile(): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updatePerson(selectedId, {
        displayName: displayName.trim(),
        roleLabel: roleLabel.trim() === "" ? null : roleLabel.trim(),
        availability,
        unavailableReason:
          availability === "TEMPORARILY_UNAVAILABLE" ? unavailableReason.trim() || null : null,
        unavailableUntil:
          availability === "TEMPORARILY_UNAVAILABLE" ? unavailableUntil.trim() || null : null,
      }),
      "Datele persoanei nu au putut fi salvate.",
      selectedId,
    );
  }

  async function retire(): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await updatePerson(selectedId, { status: "RETIRED" }),
      "Persoana nu a putut fi retrasă.",
      selectedId,
    );
  }

  async function assignSkill(): Promise<void> {
    if (!selectedId || skillId === "") {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await assignPersonSkill(selectedId, skillId),
      "Calificarea nu a putut fi atribuită.",
      selectedId,
    );
  }

  async function retireSkill(id: string): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSaveState("pending");
    await applyResult(
      await retirePersonSkill(selectedId, id),
      "Calificarea nu a putut fi retrasă.",
      selectedId,
    );
  }

  async function savePin(): Promise<void> {
    if (!selectedId || pin.trim() === "") {
      return;
    }
    if (pin !== confirmPin) {
      setSaveState("error");
      setErrorMessage("PIN-ul și confirmarea trebuie să coincidă.");
      return;
    }
    setSaveState("pending");
    const result = await configurePersonOperatorPin(selectedId, pin, confirmPin);
    setPin("");
    setConfirmPin("");
    if (result.ok) {
      const listed = await loadPeopleAdmin();
      writeResource(resourceKeys.peopleAdmin(), listed);
      applyAdmin(listed, selectedId);
      invalidateAfterPeopleAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return;
    }
    setSaveState("error");
    setErrorMessage(
      mutationMessage(readTransportErrorCode(result.body), "PIN-ul nu a putut fi configurat."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;
  const selected = model?.people.find((item) => item.personId === selectedId) ?? null;
  const assignableSkills =
    model?.skills.filter(
      (skill) =>
        skill.status === "ACTIVE" &&
        !selected?.skills.some((item) => item.skillId === skill.skillId),
    ) ?? [];
  const selectedActive = selected?.status === "ACTIVE";

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/people"
      workspace="admin"
      eyebrow="Administrare"
      title="Oameni"
      lead="Configurează persoanele care pot lucra în producție. Contul de autentificare rămâne separat."
      meta={
        model?.canEdit
          ? "Doar Owner poate adăuga, modifica sau retrage oamenii operaționali."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail label="Administrare" items={administrationRailItems("people")} />
          <SurfacePanel title="Oameni operaționali" label="Oameni" busy>
            <LoadingFloor variant="admin" label="Se încarcă oamenii operaționali" />
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
          <CollectionRail label="Administrare" items={administrationRailItems("people")} />
          {saveState === "success" ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată">
              Atelierul citește aceeași listă de persoane.
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage ? (
            <InlineAlert tone="error" title="Modificarea a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          <SurfacePanel title="Oameni operaționali" label="Listă">
            {model.people.length === 0 ? (
              <EmptyState
                title="Nu există oameni operaționali"
                description="Adaugă prima persoană care poate lucra în producție. Atelierul nu creează persoane."
              />
            ) : (
              <Worklist variant="compact" label="Oameni operaționali">
                {model.people.map((person) => (
                  <WorklistRow
                    key={person.personId}
                    variant="compact"
                    selected={person.personId === selectedId}
                    onSelect={() => selectPerson(person.personId)}
                    identity={person.displayName}
                    identityDetail={`${person.roleLabel ?? "Fără rol"} · ${person.statusLabel} · ${person.availabilityLabel}`}
                    context={`${skillSummary(person)} · ${pinStatusLabel(person.operatorPinConfigured)}`}
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>
          {model.canEdit ? (
            <SurfacePanel title="Persoană nouă" label="Adăugare">
              <TextField
                id="people-create-name"
                label="Nume"
                value={createName}
                disabled={!editEnabled}
                onChange={setCreateName}
              />
              <TextField
                id="people-create-role"
                label="Rol"
                value={createRole}
                hint="Opțional. Nu este un cont de autentificare."
                disabled={!editEnabled}
                onChange={setCreateRole}
              />
              <Button
                disabled={!editEnabled || createName.trim() === ""}
                onClick={() => {
                  void create();
                }}
              >
                Adaugă persoana
              </Button>
            </SurfacePanel>
          ) : (
            <p>Editarea nu este disponibilă pentru acest rol.</p>
          )}
          {selected ? (
            <SurfacePanel
              title={selected.displayName}
              label="Detaliu"
              status={
                <StatusBadge
                  label={selected.statusLabel}
                  tone={selected.status === "RETIRED" ? statusTone("warning") : statusTone("success")}
                />
              }
            >
              <TextField
                id="people-name"
                label="Nume"
                value={displayName}
                disabled={!editEnabled || !selectedActive}
                onChange={setDisplayName}
              />
              <TextField
                id="people-role"
                label="Rol"
                value={roleLabel}
                disabled={!editEnabled || !selectedActive}
                onChange={setRoleLabel}
              />
              <SelectField
                id="people-availability"
                label="Disponibilitate"
                value={availability}
                disabled={!editEnabled || !selectedActive}
                options={[
                  { value: "AVAILABLE", label: "Disponibil" },
                  { value: "TEMPORARILY_UNAVAILABLE", label: "Indisponibil temporar" },
                ]}
                onChange={(value) => {
                  setAvailability(
                    value === "TEMPORARILY_UNAVAILABLE"
                      ? "TEMPORARILY_UNAVAILABLE"
                      : "AVAILABLE",
                  );
                }}
              />
              {availability === "TEMPORARILY_UNAVAILABLE" ? (
                <>
                  <TextField
                    id="people-unavailable-reason"
                    label="Motiv"
                    value={unavailableReason}
                    disabled={!editEnabled || !selectedActive}
                    onChange={setUnavailableReason}
                  />
                  <TextField
                    id="people-unavailable-until"
                    label="Până la"
                    value={unavailableUntil}
                    hint="Opțional."
                    disabled={!editEnabled || !selectedActive}
                    onChange={setUnavailableUntil}
                  />
                </>
              ) : null}
              <p>
                {selected.availabilityLabel}. {pinStatusLabel(selected.operatorPinConfigured)}.
              </p>
              {model.canEdit && selectedActive ? (
                <>
                  <Button
                    disabled={!editEnabled}
                    onClick={() => {
                      void saveProfile();
                    }}
                  >
                    Salvează persoana
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!editEnabled}
                    onClick={() => {
                      void retire();
                    }}
                  >
                    Retrage persoana
                  </Button>
                </>
              ) : null}
              <p className="section-label">Calificări de producție</p>
              {selected.skills.length === 0 ? (
                <p>Nu are calificări atribuite.</p>
              ) : (
                selected.skills.map((skill) => (
                  <div key={skill.skillId} className="stack">
                    <p>{skill.displayLabel}</p>
                    {model.canEdit && selectedActive ? (
                      <Button
                        variant="ghost"
                        disabled={!editEnabled}
                        onClick={() => {
                          void retireSkill(skill.skillId);
                        }}
                      >
                        Retrage calificarea
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
              {model.canEdit && selectedActive && assignableSkills.length > 0 ? (
                <>
                  <SelectField
                    id="people-skill"
                    label="Calificare"
                    value={skillId}
                    disabled={!editEnabled}
                    options={assignableSkills.map((skill) => ({
                      value: skill.skillId,
                      label: skill.displayLabel,
                    }))}
                    onChange={setSkillId}
                  />
                  <Button
                    variant="secondary"
                    disabled={!editEnabled || skillId === ""}
                    onClick={() => {
                      void assignSkill();
                    }}
                  >
                    Atribuie calificarea
                  </Button>
                </>
              ) : null}
              {model.canEdit && selectedActive ? (
                <>
                  <p className="section-label">{pinStatusLabel(selected.operatorPinConfigured)}</p>
                  <TextField
                    id="people-pin"
                    label="PIN"
                    type="password"
                    value={pin}
                    disabled={!editEnabled}
                    onChange={setPin}
                  />
                  <TextField
                    id="people-pin-confirm"
                    label="Confirmă PIN"
                    type="password"
                    value={confirmPin}
                    disabled={!editEnabled}
                    onChange={setConfirmPin}
                  />
                  <Button
                    variant="secondary"
                    disabled={!editEnabled || pin.trim() === ""}
                    onClick={() => {
                      void savePin();
                    }}
                  >
                    {selected.operatorPinConfigured ? "Schimbă PIN" : "Configurează PIN"}
                  </Button>
                </>
              ) : (
                <p>{pinStatusLabel(selected.operatorPinConfigured)}</p>
              )}
              {pending ? <LoadingIndicator label="Se salvează oamenii operaționali" /> : null}
            </SurfacePanel>
          ) : null}
        </>
      ) : null}
    </SlicePage>
  );
}
