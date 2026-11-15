import { useState, type ReactNode } from "react";
import { AdminLayout } from "../admin/AdminLayout";
import {
  AdminChangeBar,
  AdminConfirmDialog,
  AdminPolicyOptions,
  AdminReadOnlyNote,
  AdminSection,
} from "../admin/adminParts";
import { adminFailureContent, describeAdminException } from "../admin/serverMessages";
import {
  MATERIAL_READINESS_MODE_OPTIONS,
  presentMaterialReadiness,
} from "../adapters/materialReadinessAdapter";
import { saveMaterialReadiness } from "../api/materialReadiness";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadMaterialReadinessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";

const EFFECT: Record<"DISABLED" | "REQUIRED", string> = {
  DISABLED:
    "Pornirea sarcinilor nu cere confirmarea materialelor. Sarcinile deja începute rămân începute. Soldul de stoc nu este disponibilitate de producție.",
  REQUIRED:
    "O sarcină planificată cu material neconfirmat, indisponibil sau necunoscut nu poate fi pornită. Sarcinile deja începute și cele închise nu sunt întoarse. Soldul de stoc nu decide pornirea.",
};

export function MaterialReadinessAdminPage() {
  const resource = useResource(resourceKeys.materialReadinessAdmin(), () =>
    loadMaterialReadinessAdmin(),
  );
  const model = resource.data;
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<ReactNode>(null);
  const selectedMode = draftMode ?? model?.mode ?? "DISABLED";
  const nextMode = selectedMode === "REQUIRED" ? "REQUIRED" : "DISABLED";
  const pending = saveState === "pending";
  const dirty = Boolean(model?.canWrite) && draftMode !== null && nextMode !== model?.mode;
  const nextLabel = nextMode === "REQUIRED" ? "Obligatoriu" : "Oprit";

  function discard(): void {
    setDraftMode(null);
    setConfirming(false);
    setSaveState("idle");
    setSaveError(null);
  }

  async function save(): Promise<boolean> {
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentMaterialReadiness(await saveMaterialReadiness(nextMode));
      if (!presented) {
        setSaveState("error");
        setSaveError("Modul de materiale nu a putut fi citit după salvare. Reîncarcă pagina.");
        return false;
      }
      writeResource(resourceKeys.materialReadinessAdmin(), presented);
      setDraftMode(null);
      setConfirming(false);
      setSaveState("success");
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(adminFailureContent(describeAdminException(error, {}, "Modul de materiale nu a putut fi salvat.")));
      return false;
    }
  }

  /** The one way to save: the change bar and the leave question both open the same confirmation. */
  function openConfirm(): void {
    setSaveError(null);
    setConfirming(true);
  }

  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Modul de materiale",
    requestSave: openConfirm,
    saveFlowOpen: confirming || saveState === "pending",
    onDiscard: discard,
  });

  return (
    <AdminLayout
      current="materials"
      title="Materiale pentru execuție"
      lead="Organizația alege dacă pornirea unei sarcini cere confirmarea materialelor planificate. Nu este costul de achiziție al materialelor și nu este stoc."
      meta={
        model
          ? model.canWrite
            ? "Doar proprietarul poate schimba modul."
            : "Editarea nu este disponibilă pentru acest rol."
          : undefined
      }
      changeBar={
        dirty && model ? (
          <AdminChangeBar
            title="Modificare nesalvată · Confirmare înainte de pornire"
            detail={`Mod: ${model.modeLabel} → ${nextLabel}`}
            pending={pending}
            onDiscard={discard}
            onSave={openConfirm}
          />
        ) : null
      }
    >
      {!model && resource.status !== "error" ? (
        <LoadingFloor variant="admin" label="Se încarcă modul de materiale" />
      ) : null}
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Modul nu a putut fi citit">
          Politica de materiale nu este disponibilă. Reîncarcă pagina; nimic nu a fost schimbat.
        </InlineAlert>
      ) : null}
      {model ? (
        <>
          {saveState === "success" ? (
            <InlineAlert tone="success" title="Modul a fost salvat">
              Modul de materiale este acum {model.modeLabel}.
            </InlineAlert>
          ) : null}
          {saveError && !confirming ? (
            <InlineAlert tone="error" title="Salvarea a eșuat">
              {saveError}
            </InlineAlert>
          ) : null}
          <AdminSection
            title="Confirmare înainte de pornire"
            description={`Mod curent: ${model.modeLabel}. ${EFFECT[model.mode]}`}
          >
            {model.canWrite ? (
              <AdminPolicyOptions
                name="material-readiness-mode"
                legend="Mod"
                value={nextMode}
                activeValue={model.mode}
                disabled={pending}
                options={MATERIAL_READINESS_MODE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                  description: EFFECT[item.value === "REQUIRED" ? "REQUIRED" : "DISABLED"],
                }))}
                onChange={(value) => {
                  setSaveState("idle");
                  setDraftMode(value);
                }}
              />
            ) : (
              <AdminReadOnlyNote>Doar proprietarul organizației poate schimba modul.</AdminReadOnlyNote>
            )}
          </AdminSection>
        </>
      ) : null}
      {confirming && model ? (
        <AdminConfirmDialog
          title={nextMode === "REQUIRED" ? "Ceri confirmarea materialelor?" : "Oprești confirmarea materialelor?"}
          subtitle={`${model.modeLabel} → ${nextLabel}`}
          confirmLabel="Confirmă"
          busy={pending}
          error={saveState === "error" ? saveError : null}
          onConfirm={() => {
            void save();
          }}
          onCancel={() => {
            setConfirming(false);
            setSaveState("idle");
            setSaveError(null);
          }}
        >
          <p>{EFFECT[nextMode]}</p>
          <p>Se aplică lucrărilor acestei organizații. Confirmările deja înregistrate rămân.</p>
        </AdminConfirmDialog>
      ) : null}
      {guard}
    </AdminLayout>
  );
}
