import { useState, type ReactNode } from "react";
import { AdminLayout } from "../admin/AdminLayout";
import {
  AdminChangeBar,
  AdminPolicyOptions,
  AdminReadOnlyNote,
  AdminSection,
} from "../admin/adminParts";
import { adminFailureContent, describeAdminException } from "../admin/serverMessages";
import {
  OPERATIONAL_SERVICE_MODE_OPTIONS,
  presentOperationalServices,
} from "../adapters/operationalServicesAdapter";
import { patchOperationalService } from "../api/operationalServices";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOperationalServicesAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";

const MODE_DESCRIPTIONS: Record<string, string> = {
  SERVICE_DISABLED: "Montajul nu se oferă la lucrările noi.",
  INTERNAL: "Montajul îl face echipa proprie.",
  SUBCONTRACTED: "Montajul îl face un partener extern.",
  BOTH: "Echipa proprie și parteneri externi.",
};

export function OperationalServicesAdminPage() {
  const resource = useResource(resourceKeys.operationalServicesAdmin(), () =>
    loadOperationalServicesAdmin(),
  );
  const model = resource.data;
  const installation = model?.capabilities.find((item) => item.capabilityId === "SITE_INSTALLATION");
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<ReactNode>(null);
  const currentMode = installation?.offerMode ?? "SERVICE_DISABLED";
  const selectedMode = draftMode ?? currentMode;
  const canEdit = Boolean(model?.canWrite && installation?.selectable);
  const dirty = canEdit && draftMode !== null && draftMode !== currentMode;
  const pending = saveState === "pending";

  function discard(): void {
    setDraftMode(null);
    setSaveState("idle");
    setSaveError(null);
  }

  async function save(): Promise<boolean> {
    if (!installation) {
      return false;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentOperationalServices(
        await patchOperationalService(installation.capabilityId, selectedMode || "SERVICE_DISABLED"),
      );
      if (!presented) {
        // R1 · F8: an unreadable answer is not a success; the choice stays to retry or check.
        setSaveState("error");
        setSaveError("Serverul a răspuns, dar răspunsul nu poate fi citit. Alegerea ta a rămas; reîncarcă pagina pentru a vedea modul activ.");
        return false;
      }
      writeResource(resourceKeys.operationalServicesAdmin(), presented);
      setDraftMode(null);
      setSaveState("success");
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(
        adminFailureContent(
          describeAdminException(error, {}, "Modul de montaj nu a putut fi salvat. Alegerea ta a rămas."),
        ),
      );
      return false;
    }
  }

  const guard = useUnsavedChangesGuard({
    dirty,
    subject: "Modul de montaj la locație",
    save,
    onDiscard: discard,
  });

  const selectedLabel =
    OPERATIONAL_SERVICE_MODE_OPTIONS.find((item) => item.value === selectedMode)?.label ?? selectedMode;

  return (
    <AdminLayout
      current="services"
      title="Servicii operaționale"
      lead="Modul în care organizația oferă montajul la locație pentru lucrările noi. Lucrările deja create își păstrează modul."
      meta={
        model
          ? canEdit
            ? "Doar proprietarul poate schimba modul serviciilor."
            : "Editarea nu este disponibilă pentru acest rol."
          : undefined
      }
      changeBar={
        dirty ? (
          <AdminChangeBar
            title="Modificare nesalvată · Montaj la locație"
            detail={`Mod: ${installation?.offerModeLabel ?? "Neconfigurat"} → ${selectedLabel}`}
            saveLabel="Salvează modul"
            pending={pending}
            onDiscard={discard}
            onSave={() => {
              void save();
            }}
          />
        ) : null
      }
    >
      {!model && resource.status !== "error" ? (
        <LoadingFloor variant="admin" label="Se încarcă serviciile" />
      ) : null}
      {/* R1 · F9: when the read fails there is no empty form, only the reason. */}
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Serviciile nu au putut fi citite">
          Configurația de servicii nu este disponibilă. Reîncarcă pagina; nimic nu a fost schimbat.
        </InlineAlert>
      ) : null}
      {model && !installation ? (
        <EmptyState
          title="Montajul la locație nu este disponibil"
          description="Organizația nu are încă serviciul de montaj configurat."
        />
      ) : null}
      {model && installation ? (
        <>
          {saveState === "success" && !dirty ? (
            <InlineAlert tone="success" title="Modul a fost salvat">
              Lucrările noi folosesc modul {installation.offerModeLabel}.
            </InlineAlert>
          ) : null}
          {saveError ? (
            <InlineAlert tone="error" title="Salvarea a eșuat">
              {saveError}
            </InlineAlert>
          ) : null}
          <AdminSection
            title="Montaj la locație"
            description={`Mod curent: ${installation.offerModeLabel}`}
          >
            {canEdit ? (
              <AdminPolicyOptions
                name="site-install-offer-mode"
                legend="Mod serviciu"
                value={selectedMode}
                activeValue={installation.offerMode}
                disabled={pending}
                options={OPERATIONAL_SERVICE_MODE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                  description: MODE_DESCRIPTIONS[item.value],
                }))}
                onChange={(value) => {
                  setSaveState("idle");
                  setSaveError(null);
                  setDraftMode(value);
                }}
              />
            ) : (
              <AdminReadOnlyNote>Modul de serviciu este doar pentru citire.</AdminReadOnlyNote>
            )}
          </AdminSection>
        </>
      ) : null}
      {guard}
    </AdminLayout>
  );
}
