import { useState, type FormEvent } from "react";
import {
  presentOrganizationAccessAdmin,
  type OrganizationAccessAdminTransport,
} from "../adapters/organizationAccessAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import {
  postOrganizationAccessUser,
  revokeOrganizationAccessMembership,
} from "../api/organizationAccess";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterOrganizationAccessChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOrganizationAccessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "error";

const ROLE_OPTIONS = [
  { value: "member", label: "Membru" },
  { value: "owner", label: "Owner" },
] as const;

export function AccessAdminPage() {
  const admin = useResource(
    resourceKeys.organizationAccessAdmin(),
    loadOrganizationAccessAdmin,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<OrganizationAccessAdminTransport | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setModel(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Lista de acces nu este disponibilă.");
  }

  function applyAdmin(next: OrganizationAccessAdminTransport): void {
    setModel(next);
    writeResource(resourceKeys.organizationAccessAdmin(), next);
    invalidateAfterOrganizationAccessChange();
  }

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!model?.canEdit) {
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    if (password.trim() === "") {
      setSaveState("error");
      setErrorMessage("Parola inițială este obligatorie.");
      return;
    }
    const result = await postOrganizationAccessUser({
      email: email.trim(),
      role,
      password,
    });
    if (result.ok) {
      const presented = presentOrganizationAccessAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Utilizatorul a fost adăugat, dar răspunsul nu poate fi prezentat.");
        return;
      }
      applyAdmin(presented);
      setEmail("");
      setPassword("");
      setRole("member");
      setShowForm(false);
      setSaveState("success");
      return;
    }
    setSaveState("error");
    const code = readTransportErrorCode(result.body);
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (code === "forbidden"
          ? "Nu ai dreptul să gestionezi accesul."
          : code === "access_identity_unavailable"
            ? "Adresa nu poate fi adăugată prin această operație."
            : "Utilizatorul nu a putut fi adăugat."),
    );
  }

  async function revokeMember(membershipId: string): Promise<void> {
    if (!model?.canEdit) {
      return;
    }
    setRevokingId(membershipId);
    setErrorMessage(null);
    const result = await revokeOrganizationAccessMembership(membershipId);
    setRevokingId(null);
    if (result.ok) {
      const presented = presentOrganizationAccessAdmin(result.body);
      if (!presented) {
        setErrorMessage("Accesul a fost revocat, dar răspunsul nu poate fi prezentat.");
        return;
      }
      applyAdmin(presented);
      setSaveState("success");
      return;
    }
    setSaveState("error");
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (readTransportErrorCode(result.body) === "forbidden"
          ? "Nu ai dreptul să gestionezi accesul."
          : "Accesul nu a putut fi revocat."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/access"
      workspace="admin"
      eyebrow="Administrare"
      title="Acces organizație"
      lead="Gestionează utilizatorii care se pot autentifica în organizație. Conturile de producție (oameni/PIN) rămân separate."
      meta={
        model?.canEdit
          ? "Doar Owner poate adăuga sau revoca accesul."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("access")}
          />
          <SurfacePanel title="Utilizatori" label="Acces" busy>
            <LoadingFloor variant="admin" label="Se încarcă accesul organizației" />
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
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("access")}
          />
          {saveState === "success" ? (
            <InlineAlert tone="success" title="Acces actualizat">
              Lista de utilizatori a fost actualizată.
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage ? (
            <InlineAlert tone="error" title="Operația a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          <SurfacePanel title="Utilizatori cu acces" label="Acces">
            {!model.canEdit ? (
              <InlineAlert tone="pending" title="Doar citire">
                Poți vedea utilizatorii, dar doar un Owner poate adăuga sau revoca accesul.
              </InlineAlert>
            ) : null}
            {editEnabled ? (
              <div className="cluster">
                <Button
                  onClick={() => {
                    setShowForm((current) => !current);
                    setSaveState("idle");
                    setErrorMessage(null);
                  }}
                >
                  Adaugă utilizator
                </Button>
              </div>
            ) : null}
            {showForm && editEnabled ? (
              <form className="stack" onSubmit={(event) => void createUser(event)}>
                <TextField
                  id="access-email"
                  label="Email"
                  value={email}
                  onChange={setEmail}
                />
                <SelectField
                  id="access-role"
                  label="Rol"
                  value={role}
                  options={ROLE_OPTIONS.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  onChange={(value) => {
                    setRole(value === "owner" ? "owner" : "member");
                  }}
                />
                <TextField
                  id="access-password"
                  label="Parolă inițială"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  hint="Obligatorie. Creează un utilizator nou pentru această organizație."
                />
                <div className="cluster">
                  <Button
                    type="submit"
                    disabled={pending || email.trim() === "" || password.trim() === ""}
                  >
                    Salvează utilizatorul
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setShowForm(false);
                      setPassword("");
                    }}
                  >
                    Renunță
                  </Button>
                </div>
              </form>
            ) : null}
            <Worklist variant="compact" label="Utilizatori">
              {model.members.map((member) => (
                <div key={member.membershipId} className="stack">
                  <WorklistRow
                    variant="compact"
                    identity={member.email}
                    identityDetail={`${member.roleLabel} · ${member.statusLabel} · ${formatTimestamp(member.createdAt)}`}
                  />
                  {model.canEdit && member.status === "ACTIVE" ? (
                    <div className="cluster">
                      <Button
                        disabled={revokingId === member.membershipId || pending}
                        onClick={() => {
                          void revokeMember(member.membershipId);
                        }}
                      >
                        Revocă
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </Worklist>
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}
