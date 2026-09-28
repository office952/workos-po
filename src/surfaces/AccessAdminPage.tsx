import { useState } from "react";
import {
  presentOrganizationAccessAdmin,
  type OrganizationAccessAdminTransport,
} from "../adapters/organizationAccessAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { revokeOrganizationAccessMembership } from "../api/organizationAccess";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterOrganizationAccessChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOrganizationAccessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "error";

export function AccessAdminPage() {
  const admin = useResource(
    resourceKeys.organizationAccessAdmin(),
    loadOrganizationAccessAdmin,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<OrganizationAccessAdminTransport | null>(null);
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

  async function revokeMember(membershipId: string): Promise<void> {
    if (!model?.canEdit) {
      return;
    }
    setRevokingId(membershipId);
    setSaveState("pending");
    setErrorMessage(null);
    const result = await revokeOrganizationAccessMembership(membershipId);
    setRevokingId(null);
    if (result.ok) {
      const presented = presentOrganizationAccessAdmin(result.body);
      if (!presented) {
        setSaveState("error");
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

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/access"
      workspace="admin"
      eyebrow="Administrare"
      title="Acces organizație"
      lead="Vezi utilizatorii care se pot autentifica în organizație. Conturile de producție (oameni/PIN) rămân separate."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit: Boolean(model?.canEdit),
        whenEditable: "Doar proprietarul poate revoca accesul.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
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
            <InlineAlert tone="pending" title="Adăugare utilizatori">
              Utilizatorii noi sunt adăugați prin administrarea controlată WorkOS în această
              versiune.
            </InlineAlert>
            {!model.canEdit ? (
              <InlineAlert tone="pending" title="Doar citire">
                Poți vedea utilizatorii, dar doar proprietarul poate revoca accesul.
              </InlineAlert>
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
