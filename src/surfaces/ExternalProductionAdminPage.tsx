import { useState } from "react";
import {
  EXTERNAL_PRODUCTION_MODE_OPTIONS,
  presentExternalProduction,
  type ExternalProductionProviderRow,
} from "../adapters/externalProductionAdapter";
import {
  createExternalProductionProvider,
  fetchExternalProduction,
  saveExternalProductionMode,
  updateExternalProductionProvider,
} from "../api/externalProduction";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadExternalProductionAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";

const EFFECT: Record<"DISABLED" | "ENABLED", string> = {
  DISABLED:
    "Lucrările noi nu pot fi marcate pentru execuție externă. Execuția internă rămâne neschimbată. O sarcină deja marcată rămâne externă și poate fi dusă până la capăt.",
  ENABLED:
    "Proprietarul poate marca explicit o sarcină planificată pentru execuție externă. Nimic nu devine extern automat.",
};

export function ExternalProductionAdminPage() {
  const resource = useResource(resourceKeys.externalProductionAdmin(), () =>
    loadExternalProductionAdmin(),
  );
  const model = resource.data;
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedMode = draftMode ?? model?.mode ?? "DISABLED";
  const nextMode = selectedMode === "ENABLED" ? "ENABLED" : "DISABLED";

  async function refresh(): Promise<boolean> {
    const presented = presentExternalProduction(await fetchExternalProduction());
    if (!presented) {
      return false;
    }
    writeResource(resourceKeys.externalProductionAdmin(), presented);
    return true;
  }

  async function saveMode(): Promise<void> {
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentExternalProduction(await saveExternalProductionMode(nextMode));
      if (!presented) {
        setSaveState("error");
        setSaveError("Modul de execuție externă nu a putut fi citit după salvare.");
        return;
      }
      writeResource(resourceKeys.externalProductionAdmin(), presented);
      setDraftMode(null);
      setConfirming(false);
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Modul de execuție externă nu a putut fi salvat.");
    }
  }

  async function createProvider(): Promise<void> {
    setSaveState("pending");
    setSaveError(null);
    try {
      await createExternalProductionProvider(providerName);
      const ok = await refresh();
      if (!ok) {
        setSaveState("error");
        setSaveError("Furnizorul a fost creat, dar lista nu a putut fi citită.");
        return;
      }
      setProviderName("");
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Furnizorul extern nu a putut fi creat.");
    }
  }

  async function renameProvider(provider: ExternalProductionProviderRow): Promise<void> {
    const name = renameDrafts[provider.providerId] ?? provider.name;
    setSaveState("pending");
    setSaveError(null);
    try {
      await updateExternalProductionProvider(provider.providerId, { name });
      const ok = await refresh();
      if (!ok) {
        setSaveState("error");
        setSaveError("Furnizorul a fost redenumit, dar lista nu a putut fi citită.");
        return;
      }
      setRenameDrafts((current) => {
        const next = { ...current };
        delete next[provider.providerId];
        return next;
      });
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Numele furnizorului nu a putut fi salvat.");
    }
  }

  async function setProviderActive(
    provider: ExternalProductionProviderRow,
    active: boolean,
  ): Promise<void> {
    setSaveState("pending");
    setSaveError(null);
    try {
      await updateExternalProductionProvider(provider.providerId, { active });
      const ok = await refresh();
      if (!ok) {
        setSaveState("error");
        setSaveError("Starea furnizorului nu a putut fi citită după salvare.");
        return;
      }
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Starea furnizorului nu a putut fi schimbată.");
    }
  }

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/external-production"
      layout="ADMIN_MASTER_DETAIL"
      eyebrow="Administrare"
      title="Execuție externă"
      lead="Organizația alege dacă o sarcină planificată poate fi predată unui furnizor de producție din afara atelierului. Nu este serviciu de montaj și nu este o zonă de lucru."
    >
      <CollectionRail label="Administrare" items={administrationRailItems("external-production")} />
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Modul nu a putut fi citit">
          Politica de execuție externă nu este disponibilă.
        </InlineAlert>
      ) : null}
      <SurfacePanel
        title="Predare către furnizor"
        label="Predare către furnizor"
        busy={!model && resource.status !== "error"}
      >
        {model ? (
          <div className="stack">
            <dl className="fact-grid">
              <InfoRow label="Mod curent" value={model.modeLabel} />
              <InfoRow label="Efect" value={EFFECT[model.mode]} />
            </dl>
            <p className="ui-note">
              Oprirea nu blochează revenirea unei sarcini deja la furnizor. Numele afișat după
              predare rămâne cel de la momentul predării.
            </p>
            {model.canWrite ? (
              <>
                <SelectField
                  id="external-production-mode"
                  label="Mod"
                  value={selectedMode}
                  options={EXTERNAL_PRODUCTION_MODE_OPTIONS.map((item) => ({
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
                    Salvarea aplică modul „{nextMode === "ENABLED" ? "Activ" : "Oprit"}” pentru
                    lucrările acestei organizații.
                  </InlineAlert>
                ) : null}
                <div className="cluster">
                  {confirming ? (
                    <>
                      <Button disabled={saveState === "pending"} onClick={() => void saveMode()}>
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
          </div>
        ) : null}
      </SurfacePanel>
      <SurfacePanel title="Furnizori externi" label="Furnizori externi" busy={!model && resource.status !== "error"}>
        {model ? (
          <div className="stack" data-testid="external-provider-registry">
            {model.providers.length === 0 ? <p>Nu există furnizori externi.</p> : null}
            {model.providers.map((provider) => (
              <div key={provider.providerId} className="stack">
                <InfoRow label="Nume" value={provider.name} />
                <InfoRow label="Stare" value={provider.active ? "Activ" : "Oprit"} />
                {model.canWrite ? (
                  <div className="cluster">
                    <TextField
                      id={`external-provider-name-${provider.providerId}`}
                      label="Nume furnizor"
                      value={renameDrafts[provider.providerId] ?? provider.name}
                      disabled={saveState === "pending"}
                      onChange={(value) =>
                        setRenameDrafts((current) => ({
                          ...current,
                          [provider.providerId]: value,
                        }))
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={saveState === "pending"}
                      onClick={() => void renameProvider(provider)}
                    >
                      Salvează numele
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={saveState === "pending"}
                      onClick={() => void setProviderActive(provider, !provider.active)}
                    >
                      {provider.active ? "Oprește furnizorul" : "Activează furnizorul"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {model.canWrite ? (
              <div className="cluster">
                <TextField
                  id="external-provider-create"
                  label="Furnizor nou"
                  value={providerName}
                  disabled={saveState === "pending"}
                  onChange={setProviderName}
                />
                <Button
                  disabled={saveState === "pending" || providerName.trim().length === 0}
                  onClick={() => void createProvider()}
                >
                  Adaugă furnizor
                </Button>
              </div>
            ) : null}
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
