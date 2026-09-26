import { useState } from "react";
import {
  MATERIAL_READINESS_MODE_OPTIONS,
  presentMaterialReadiness,
} from "../adapters/materialReadinessAdapter";
import { saveMaterialReadiness } from "../api/materialReadiness";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadMaterialReadinessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";

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
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedMode = draftMode ?? model?.mode ?? "DISABLED";
  const nextMode = selectedMode === "REQUIRED" ? "REQUIRED" : "DISABLED";

  async function save(): Promise<void> {
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentMaterialReadiness(await saveMaterialReadiness(nextMode));
      if (!presented) {
        setSaveState("error");
        setSaveError("Modul de materiale nu a putut fi citit după salvare.");
        return;
      }
      writeResource(resourceKeys.materialReadinessAdmin(), presented);
      setDraftMode(null);
      setConfirming(false);
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Modul de materiale nu a putut fi salvat.");
    }
  }

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/material-readiness"
      workspace="admin"
      eyebrow="Administrare"
      title="Materiale pentru execuție"
      lead="Organizația alege dacă pornirea unei sarcini cere confirmarea materialelor planificate. Nu este stoc și nu este un serviciu comercial."
    >
      <CollectionRail label="Administrare" items={administrationRailItems("materials")} />
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Modul nu a putut fi citit">
          Politica de materiale nu este disponibilă.
        </InlineAlert>
      ) : null}
      <SurfacePanel
        title="Confirmare înainte de pornire"
        label="Confirmare înainte de pornire"
        busy={!model && resource.status !== "error"}
      >
        {model ? (
          <div className="stack">
            <dl className="fact-grid">
              <InfoRow label="Mod curent" value={model.modeLabel} />
              <InfoRow label="Efect" value={EFFECT[model.mode]} />
            </dl>
            {model.canWrite ? (
              <>
                <SelectField
                  id="material-readiness-mode"
                  label="Mod"
                  value={selectedMode}
                  options={MATERIAL_READINESS_MODE_OPTIONS.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  onChange={(value) => {
                    setDraftMode(value);
                    setConfirming(false);
                  }}
                />
                <p className="ui-note">{EFFECT[nextMode]}</p>
                {confirming ? (
                  <InlineAlert tone="pending" title="Confirmă schimbarea">
                    Salvarea aplică modul „{nextMode === "REQUIRED" ? "Obligatoriu" : "Oprit"}” pentru
                    lucrările acestei organizații. Confirmările deja înregistrate rămân.
                  </InlineAlert>
                ) : null}
                <div className="cluster">
                  {confirming ? (
                    <>
                      <Button disabled={saveState === "pending"} onClick={() => void save()}>
                        Confirmă
                      </Button>
                      <Button
                        disabled={saveState === "pending"}
                        onClick={() => setConfirming(false)}
                      >
                        Renunță
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={saveState === "pending" || nextMode === model.mode}
                      onClick={() => setConfirming(true)}
                    >
                      Salvează
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="ui-note">Doar proprietarul organizației poate schimba modul.</p>
            )}
            {saveError ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {saveError}
              </InlineAlert>
            ) : null}
          </div>
        ) : null}
      </SurfacePanel>
    </SlicePage>
  );
}
