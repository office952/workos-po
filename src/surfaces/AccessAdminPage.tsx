import { useState, type ReactNode } from "react";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { AdminConfirmDialog, AdminReadOnlyNote, AdminSection } from "../admin/adminParts";
import {
  presentOrganizationAccessAdmin,
  type OrganizationAccessAdminTransport,
} from "../adapters/organizationAccessAdapter";
import { revokeOrganizationAccessMembership } from "../api/organizationAccess";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterOrganizationAccessChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOrganizationAccessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "error";

/** Refusals the revoke endpoint returns (cloud/organizationAccessRoutes.ts), in operator wording. */
const ACCESS_CODES = {
  last_owner_removal: "Este ultimul proprietar al organizației. Accesul lui nu poate fi revocat.",
  membership_missing: "Accesul nu mai există. Lista a fost probabil schimbată între timp; reîncarcă pagina.",
  forbidden: "Nu ai dreptul să gestionezi accesul. Doar proprietarul organizației îl poate revoca.",
} as const;

type Member = OrganizationAccessAdminTransport["members"][number];

export function AccessAdminPage() {
  const admin = useResource(
    resourceKeys.organizationAccessAdmin(),
    loadOrganizationAccessAdmin,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<OrganizationAccessAdminTransport | null>(null);
  // Revoking always asks first (R1 · F7); the server's refusal stays inside the question.
  const [confirming, setConfirming] = useState<Member | null>(null);
  const [revokedEmail, setRevokedEmail] = useState<string | null>(null);

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
    setSource(next);
    setModel(next);
    writeResource(resourceKeys.organizationAccessAdmin(), next);
    invalidateAfterOrganizationAccessChange();
  }

  async function revokeMember(member: Member): Promise<void> {
    if (!model?.canEdit) {
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await revokeOrganizationAccessMembership(member.membershipId);
    if (result.ok) {
      const presented = presentOrganizationAccessAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Accesul a fost revocat, dar răspunsul nu poate fi prezentat. Reîncarcă pagina.");
        return;
      }
      applyAdmin(presented);
      setSaveState("success");
      setRevokedEmail(member.email);
      setConfirming(null);
      return;
    }
    setSaveState("error");
    setErrorMessage(adminFailureContent(describeAdminFailure(result.status, result.body, ACCESS_CODES, "Accesul nu a putut fi revocat.")));
  }

  const pending = saveState === "pending";
  const active = model?.members.filter((member) => member.status === "ACTIVE") ?? [];
  const inactive = model?.members.filter((member) => member.status !== "ACTIVE") ?? [];

  function memberRow(member: Member) {
    return (
      <li key={member.membershipId} className="adm-member" data-muted={member.status !== "ACTIVE" || undefined}>
        <span className="adm-member__identity">
          <strong>{member.email}</strong>
          <span>
            {member.roleLabel} · de la {formatTimestamp(member.createdAt)}
          </span>
        </span>
        <span className="adm-chip">{member.statusLabel}</span>
        {model?.canEdit && member.status === "ACTIVE" ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setSaveState("idle");
              setErrorMessage(null);
              setConfirming(member);
            }}
          >
            Revocă
          </Button>
        ) : null}
      </li>
    );
  }

  return (
    <AdminLayout
      current="access"
      title="Acces organizație"
      lead="Cine se poate autentifica în organizație. Conturile de producție (oameni și PIN) rămân separate, la Oameni."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit: Boolean(model?.canEdit),
        whenEditable: "Doar proprietarul poate revoca accesul.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
    >
      {loadState === "loading" ? (
        <LoadingFloor variant="admin" label="Se încarcă accesul organizației" />
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          {saveState === "success" ? (
            <InlineAlert tone="success" title="Acces actualizat">
              {revokedEmail
                ? `${revokedEmail} nu se mai poate autentifica în organizație.`
                : "Lista de utilizatori a fost actualizată."}
            </InlineAlert>
          ) : null}
          {saveState === "error" && errorMessage && !confirming ? (
            <InlineAlert tone="error" title="Operația a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          {!model.canEdit ? (
            <AdminReadOnlyNote>
              Poți vedea utilizatorii, dar doar proprietarul poate revoca accesul.
            </AdminReadOnlyNote>
          ) : null}
          <AdminSection
            title="Utilizatori cu acces"
            description="Utilizatorii noi sunt adăugați prin administrarea controlată WorkOS în această versiune."
          >
            {active.length === 0 ? (
              <p>Niciun utilizator activ.</p>
            ) : (
              <ul className="adm-members" aria-label="Utilizatori">
                {active.map(memberRow)}
              </ul>
            )}
          </AdminSection>
          {inactive.length > 0 ? (
            <AdminSection title="Acces revocat" description="Rămân în listă pentru istoric.">
              <ul className="adm-members" aria-label="Acces revocat">
                {inactive.map(memberRow)}
              </ul>
            </AdminSection>
          ) : null}
        </>
      ) : null}
      {confirming ? (
        <AdminConfirmDialog
          title={`Revoci accesul pentru ${confirming.email}?`}
          confirmLabel="Revocă accesul"
          danger
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            void revokeMember(confirming);
          }}
          onCancel={() => {
            setConfirming(null);
            setSaveState("idle");
            setErrorMessage(null);
          }}
        >
          <p>Nu se va mai putea autentifica în organizație.</p>
          <p>Lucrările, ofertele și istoricul la care a participat rămân neschimbate.</p>
        </AdminConfirmDialog>
      ) : null}
    </AdminLayout>
  );
}
