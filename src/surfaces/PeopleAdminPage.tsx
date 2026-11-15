import { useState, type ReactNode } from "react";
import {
  presentPeopleAdmin,
  type PeopleAdminPerson,
  type PeopleAdminTransport,
} from "../adapters/peopleAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import {
  AdminChangeBar,
  AdminConfirmDialog,
  AdminConsequence,
  AdminDangerButton,
  AdminRegistry,
  AdminRegistryRow,
  AdminSwitchDialog,
} from "../admin/adminParts";
import { readTransportErrorCode } from "../api/http";
import {
  assignPersonSkill,
  configurePersonOperatorPin,
  createPerson,
  retirePersonSkill,
  updatePerson,
} from "../api/people";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { invalidateAfterPeopleAdminChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadPeopleAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { statusTone } from "../presentation/statusTone";
import { adminPersonHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";

type SaveState = "idle" | "pending" | "success" | "error";
type Availability = "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";

type PeopleAdminPageProps = {
  personId?: string | null;
};

type Profile = {
  displayName: string;
  roleLabel: string;
  availability: Availability;
  unavailableReason: string;
  unavailableUntil: string;
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
  return person.skills.map((item) => item.displayLabel).join(" · ");
}

function profileOf(person: PeopleAdminPerson | null): Profile {
  return {
    displayName: person?.displayName ?? "",
    roleLabel: person?.roleLabel ?? "",
    availability: person?.availability ?? "AVAILABLE",
    unavailableReason: person?.unavailableReason ?? "",
    unavailableUntil: person?.unavailableUntil ?? "",
  };
}

function sameProfile(left: Profile, right: Profile): boolean {
  return (
    left.displayName === right.displayName &&
    left.roleLabel === right.roleLabel &&
    left.availability === right.availability &&
    (left.availability === "AVAILABLE" ||
      (left.unavailableReason === right.unavailableReason && left.unavailableUntil === right.unavailableUntil))
  );
}

function mutationFailure(status: number, body: unknown, fallback: string): ReactNode {
  const known = mutationMessage(readTransportErrorCode(body), "");
  return adminFailureContent(known ? { text: known, diagnostic: null } : describeAdminFailure(status, body, {}, fallback));
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
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<PeopleAdminTransport | null>(null);
  const [selectedId, setSelectedId] = useState(personId ?? "");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState("");
  const [profile, setProfile] = useState<Profile>(profileOf(null));
  const [skillId, setSkillId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [confirmingRetire, setConfirmingRetire] = useState(false);
  const [retireError, setRetireError] = useState<ReactNode>(null);

  const loadState = admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";
  const selected = model?.people.find((item) => item.personId === selectedId) ?? null;
  const profileDirty = selected !== null && !sameProfile(profile, profileOf(selected));
  const pinDirty = pin !== "" || confirmPin !== "";
  const dirty = profileDirty || pinDirty;

  /**
   * Shows `preferredId`. With `keepDraft` (another mutation on the same person, a refresh) the
   * profile being edited is kept: only a choice of the owner replaces it (R1 · F1).
   */
  function applyAdmin(next: PeopleAdminTransport, preferredId = selectedId, keepDraft = false): void {
    setModel(next);
    const preferred = next.people.find((item) => item.personId === preferredId) ?? next.people[0];
    const current = preferred ?? null;
    const samePerson = current?.personId === selectedId;
    setSelectedId(current?.personId ?? "");
    if (!(keepDraft && samePerson && profileDirty)) {
      setProfile(profileOf(current));
    }
    const assignable = next.skills.filter(
      (skill) => skill.status === "ACTIVE" && !current?.skills.some((item) => item.skillId === skill.skillId),
    );
    setSkillId(assignable[0]?.skillId ?? "");
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data, personId ?? selectedId, true);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Oamenii operaționali nu sunt disponibili.");
  }

  function openPerson(nextId: string): void {
    if (!model) return;
    applyAdmin(model, nextId);
    setPin("");
    setConfirmPin("");
    setSaveState("idle");
    setErrorMessage(null);
    // The owner already answered for the draft: no second question from the route guard.
    navigate(adminPersonHref(nextId), "push", { bypassGuard: true });
  }

  function selectPerson(nextId: string): void {
    if (!model || nextId === selectedId) return;
    if (dirty) {
      setPendingSwitch(nextId);
      return;
    }
    openPerson(nextId);
  }

  function discard(): void {
    setProfile(profileOf(selected));
    setPin("");
    setConfirmPin("");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function applyResult(
    result: Awaited<ReturnType<typeof createPerson>>,
    fallback: string,
    preferredId?: string,
    keepDraft = true,
  ): Promise<boolean> {
    if (result.ok) {
      const presented = presentPeopleAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      setSource(presented);
      writeResource(resourceKeys.peopleAdmin(), presented);
      applyAdmin(presented, preferredId, keepDraft);
      invalidateAfterPeopleAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return true;
    }
    setSaveState("error");
    setErrorMessage(mutationFailure(result.status, result.body, fallback));
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
    const ok = await applyResult(result, "Persoana nu a putut fi adăugată.", createdId, false);
    if (ok) {
      setCreateName("");
      setCreateRole("");
      setCreating(false);
      if (createdId) {
        navigate(adminPersonHref(createdId), "push", { bypassGuard: true });
      }
    }
  }

  async function saveProfile(): Promise<boolean> {
    if (!selectedId) {
      return false;
    }
    setSaveState("pending");
    return applyResult(
      await updatePerson(selectedId, {
        displayName: profile.displayName.trim(),
        roleLabel: profile.roleLabel.trim() === "" ? null : profile.roleLabel.trim(),
        availability: profile.availability,
        unavailableReason:
          profile.availability === "TEMPORARILY_UNAVAILABLE" ? profile.unavailableReason.trim() || null : null,
        unavailableUntil:
          profile.availability === "TEMPORARILY_UNAVAILABLE" ? profile.unavailableUntil.trim() || null : null,
      }),
      "Datele persoanei nu au putut fi salvate.",
      selectedId,
      false,
    );
  }

  async function retire(): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSaveState("pending");
    setRetireError(null);
    const result = await updatePerson(selectedId, { status: "RETIRED" });
    if (!result.ok) {
      // The server's reason (for example an active task) stays in the dialog.
      setSaveState("idle");
      setRetireError(mutationFailure(result.status, result.body, "Persoana nu a putut fi retrasă."));
      return;
    }
    const ok = await applyResult(result, "Persoana nu a putut fi retrasă.", selectedId, false);
    if (ok) setConfirmingRetire(false);
  }

  async function assignSkill(): Promise<void> {
    if (!selectedId || skillId === "") {
      return;
    }
    setSaveState("pending");
    await applyResult(await assignPersonSkill(selectedId, skillId), "Calificarea nu a putut fi atribuită.", selectedId);
  }

  async function retireSkill(id: string): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSaveState("pending");
    await applyResult(await retirePersonSkill(selectedId, id), "Calificarea nu a putut fi retrasă.", selectedId);
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
      setSource(listed);
      writeResource(resourceKeys.peopleAdmin(), listed);
      applyAdmin(listed, selectedId, true);
      invalidateAfterPeopleAdminChange();
      setSaveState("success");
      setErrorMessage(null);
      return;
    }
    setSaveState("error");
    setErrorMessage(mutationFailure(result.status, result.body, "PIN-ul nu a putut fi configurat."));
  }

  const guard = useUnsavedChangesGuard({
    dirty,
    subject: selected ? `Datele persoanei ${selected.displayName}` : "Datele persoanei",
    // „Salvează și continuă” only for the profile; a typed PIN is never saved implicitly.
    save: profileDirty && !pinDirty ? saveProfile : undefined,
    onDiscard: discard,
  });

  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);
  const editEnabled = canEdit && !pending;
  const assignableSkills =
    model?.skills.filter(
      (skill) => skill.status === "ACTIVE" && !selected?.skills.some((item) => item.skillId === skill.skillId),
    ) ?? [];
  const selectedActive = selected?.status === "ACTIVE";
  const switchTarget = model?.people.find((item) => item.personId === pendingSwitch) ?? null;
  const fieldsEnabled = editEnabled && selectedActive;

  return (
    <AdminLayout
      current="people"
      title="Oameni"
      lead="Persoanele care pot lucra în producție. Contul de autentificare rămâne separat. Tarifele de manoperă se setează la Costuri de producție."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit,
        whenEditable: "Doar proprietarul poate adăuga, modifica sau retrage oamenii operaționali.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
      action={
        canEdit && loadState === "ready" ? (
          <Button variant="secondary" disabled={pending} onClick={() => setCreating(true)}>
            Persoană nouă
          </Button>
        ) : null
      }
      changeBar={
        profileDirty && canEdit && selected ? (
          <AdminChangeBar
            title={`Modificări nesalvate · ${selected.displayName}`}
            detail={[
              profile.displayName !== selected.displayName ? `Nume: ${selected.displayName} → ${profile.displayName}` : null,
              profile.roleLabel !== (selected.roleLabel ?? "") ? `Rol: ${selected.roleLabel ?? "—"} → ${profile.roleLabel || "—"}` : null,
              profile.availability !== selected.availability
                ? `Disponibilitate: ${selected.availabilityLabel} → ${profile.availability === "AVAILABLE" ? "Disponibil" : "Indisponibil temporar"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Detaliile indisponibilității"}
            saveLabel="Salvează persoana"
            pending={pending}
            onDiscard={discard}
            onSave={() => {
              void saveProfile();
            }}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă oamenii operaționali" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          {saveState === "success" && !dirty ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată">
              Atelierul citește aceeași listă de persoane.
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage ? (
            <InlineAlert tone="error" title="Modificarea a eșuat">
              {errorMessage} Valorile tale au rămas în formular.
            </InlineAlert>
          ) : null}
          {model.people.length === 0 ? (
            <EmptyState
              title="Nu există oameni operaționali"
              description="Adaugă prima persoană care poate lucra în producție. Nu este obligatoriu pentru clienți și oferte. Atelierul nu creează persoane."
            />
          ) : (
            <AdminRegistry
              label="Oameni operaționali"
              list={model.people.map((person) => (
                <AdminRegistryRow
                  key={person.personId}
                  title={person.displayName}
                  detail={`${person.roleLabel ?? "Fără rol"} · ${skillSummary(person)}`}
                  status={person.status === "RETIRED" ? person.statusLabel : person.availabilityLabel}
                  muted={person.status === "RETIRED"}
                  selected={person.personId === selectedId}
                  dirty={person.personId === selectedId && dirty}
                  onSelect={() => selectPerson(person.personId)}
                />
              ))}
              detail={
                selected ? (
                  <section aria-labelledby="person-detail-title">
                    <div className="adm-detail-head">
                      <h2 id="person-detail-title" className="adm-detail-head__title">
                        {selected.displayName}
                      </h2>
                      <p className="adm-detail-head__meta">
                        {selected.availabilityLabel} · {pinStatusLabel(selected.operatorPinConfigured)}
                      </p>
                      <div className="adm-detail-head__status">
                        <StatusBadge
                          label={selected.statusLabel}
                          tone={selected.status === "RETIRED" ? statusTone("warning") : statusTone("success")}
                        />
                      </div>
                    </div>
                    <div className="adm-form-grid">
                      <TextField
                        id="people-name"
                        label="Nume"
                        value={profile.displayName}
                        disabled={!fieldsEnabled}
                        onChange={(value) => setProfile({ ...profile, displayName: value })}
                      />
                      <TextField
                        id="people-role"
                        label="Rol"
                        value={profile.roleLabel}
                        hint="Opțional. Nu este un cont de autentificare."
                        disabled={!fieldsEnabled}
                        onChange={(value) => setProfile({ ...profile, roleLabel: value })}
                      />
                      <SelectField
                        id="people-availability"
                        label="Disponibilitate"
                        value={profile.availability}
                        disabled={!fieldsEnabled}
                        options={[
                          { value: "AVAILABLE", label: "Disponibil" },
                          { value: "TEMPORARILY_UNAVAILABLE", label: "Indisponibil temporar" },
                        ]}
                        onChange={(value) =>
                          setProfile({
                            ...profile,
                            availability: value === "TEMPORARILY_UNAVAILABLE" ? "TEMPORARILY_UNAVAILABLE" : "AVAILABLE",
                          })
                        }
                      />
                      {profile.availability === "TEMPORARILY_UNAVAILABLE" ? (
                        <>
                          <TextField
                            id="people-unavailable-reason"
                            label="Motiv"
                            value={profile.unavailableReason}
                            disabled={!fieldsEnabled}
                            onChange={(value) => setProfile({ ...profile, unavailableReason: value })}
                          />
                          <TextField
                            id="people-unavailable-until"
                            label="Până la"
                            value={profile.unavailableUntil}
                            hint="Opțional."
                            disabled={!fieldsEnabled}
                            onChange={(value) => setProfile({ ...profile, unavailableUntil: value })}
                          />
                        </>
                      ) : null}
                    </div>
                    {profileDirty ? (
                      <p className="adm-field__note adm-field__note--start">modificat · nesalvat</p>
                    ) : null}

                    <div className="adm-subsection">
                      <h3 className="adm-subsection__title">Calificări de producție</h3>
                      {selected.skills.length === 0 ? (
                        <p className="adm-section__description">Nu are calificări atribuite.</p>
                      ) : (
                        <ul className="adm-tags">
                          {selected.skills.map((skill) => (
                            <li key={skill.skillId} className="adm-tag">
                              <span>{skill.displayLabel}</span>
                              {canEdit && selectedActive ? (
                                <Button
                                  variant="ghost"
                                  disabled={!editEnabled}
                                  aria-label={`Retrage calificarea ${skill.displayLabel}`}
                                  onClick={() => {
                                    void retireSkill(skill.skillId);
                                  }}
                                >
                                  Retrage calificarea
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {canEdit && selectedActive && assignableSkills.length > 0 ? (
                        <div className="adm-inline-actions">
                          <SelectField
                            id="people-skill"
                            label="Calificare"
                            value={skillId}
                            disabled={!editEnabled}
                            options={assignableSkills.map((skill) => ({ value: skill.skillId, label: skill.displayLabel }))}
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
                        </div>
                      ) : null}
                    </div>

                    <div className="adm-subsection">
                      <h3 className="adm-subsection__title">PIN pentru atelier</h3>
                      {canEdit && selectedActive ? (
                        <>
                          <p className="adm-section__description">{pinStatusLabel(selected.operatorPinConfigured)}</p>
                          <div className="adm-form-grid">
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
                          </div>
                          <div className="adm-inline-actions">
                            <Button
                              variant="secondary"
                              disabled={!editEnabled || pin.trim() === ""}
                              onClick={() => {
                                void savePin();
                              }}
                            >
                              {selected.operatorPinConfigured ? "Schimbă PIN" : "Configurează PIN"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="adm-section__description">{pinStatusLabel(selected.operatorPinConfigured)}</p>
                      )}
                    </div>
                    {pending ? <LoadingIndicator label="Se salvează oamenii operaționali" /> : null}

                    {canEdit && selectedActive ? (
                      <AdminConsequence
                        title="Retragere din producție"
                        description="Persoana retrasă nu mai primește calificări. Contul de autentificare nu este afectat."
                      >
                        <AdminDangerButton
                          disabled={!editEnabled}
                          onClick={() => {
                            setRetireError(null);
                            setConfirmingRetire(true);
                          }}
                        >
                          Retrage persoana
                        </AdminDangerButton>
                      </AdminConsequence>
                    ) : null}
                  </section>
                ) : null
              }
            />
          )}
        </>
      ) : null}
      {creating ? (
        <CreationDialog title="Persoană nouă" busy={pending} onDismiss={() => setCreating(false)}>
          <div className="adm-dialog">
            <TextField id="people-create-name" label="Nume" value={createName} disabled={pending} onChange={setCreateName} />
            <TextField
              id="people-create-role"
              label="Rol"
              value={createRole}
              hint="Opțional. Nu este un cont de autentificare."
              disabled={pending}
              onChange={setCreateRole}
            />
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Modificarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            <div className="adm-dialog__actions">
              <Button variant="secondary" disabled={pending} onClick={() => setCreating(false)}>
                Anulează
              </Button>
              <Button
                disabled={pending || createName.trim() === ""}
                onClick={() => {
                  void create();
                }}
              >
                Adaugă persoana
              </Button>
            </div>
          </div>
        </CreationDialog>
      ) : null}
      {pendingSwitch && selected ? (
        <AdminSwitchDialog
          subject={selected.displayName}
          target={switchTarget?.displayName ?? "persoana aleasă"}
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onSave={
            profileDirty && !pinDirty
              ? () => {
                  const target = pendingSwitch;
                  void saveProfile().then((ok) => {
                    if (ok) {
                      setPendingSwitch(null);
                      openPerson(target);
                    }
                  });
                }
              : undefined
          }
          onDiscard={() => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            openPerson(target);
          }}
          onStay={() => setPendingSwitch(null)}
        />
      ) : null}
      {confirmingRetire && selected ? (
        <AdminConfirmDialog
          title={`Retragi pe ${selected.displayName} din producție?`}
          confirmLabel="Retrage persoana"
          danger
          busy={pending}
          error={retireError}
          onConfirm={() => {
            void retire();
          }}
          onCancel={() => setConfirmingRetire(false)}
        >
          <p>Persoana retrasă nu mai primește calificări. Contul de autentificare nu este afectat.</p>
          <p>Dacă persoana are o sarcină în lucru, retragerea este refuzată și afișăm motivul.</p>
        </AdminConfirmDialog>
      ) : null}
      {guard}
    </AdminLayout>
  );
}
