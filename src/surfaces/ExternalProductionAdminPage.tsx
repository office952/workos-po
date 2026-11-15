import { useRef, useState, type ReactNode } from "react";
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
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { TextField } from "../components/TextField";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadExternalProductionAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";

const EFFECT: Record<"DISABLED" | "ENABLED", string> = {
  DISABLED:
    "Lucrările noi nu pot fi marcate pentru execuție externă. Execuția internă rămâne neschimbată. O sarcină deja marcată rămâne externă și poate fi dusă până la capăt.",
  ENABLED:
    "Proprietarul poate marca explicit o sarcină planificată pentru execuție externă. Nimic nu devine extern automat.",
};

/** Refusals the provider endpoints return (execution/externalProductionRoutes.ts), in operator wording. */
const PROVIDER_CODES = {
  duplicate_name: "Există deja un furnizor cu acest nume. Alege alt nume.",
  not_found: "Furnizorul nu mai există. Reîncarcă pagina.",
} as const;

type Confirm =
  | { kind: "mode" }
  | { kind: "stop"; provider: ExternalProductionProviderRow }
  | { kind: "create"; name: string };

export function ExternalProductionAdminPage() {
  const resource = useResource(resourceKeys.externalProductionAdmin(), () =>
    loadExternalProductionAdmin(),
  );
  const model = resource.data;
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [providerName, setProviderName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<ReactNode>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  // One provider creation at a time: a second confirm click never sends a second request.
  const creatingRef = useRef(false);
  const selectedMode = draftMode ?? model?.mode ?? "DISABLED";
  const nextMode = selectedMode === "ENABLED" ? "ENABLED" : "DISABLED";
  const pending = saveState === "pending";
  const modeDirty = Boolean(model?.canWrite) && draftMode !== null && nextMode !== model?.mode;
  const renamesDirty = Object.entries(renameDrafts).some(([id, name]) => {
    const provider = model?.providers.find((item) => item.providerId === id);
    return provider !== undefined && name !== provider.name;
  });
  const dirty = modeDirty || renamesDirty || providerName.trim() !== "";

  function fail(message: string, error?: unknown): void {
    setSaveState("error");
    setSaveError(error === undefined ? message : adminFailureContent(describeAdminException(error, PROVIDER_CODES, message)));
  }

  function succeed(message: string): void {
    setSaveState("success");
    setSaveError(null);
    setSuccessText(message);
  }

  async function refresh(): Promise<boolean> {
    const presented = presentExternalProduction(await fetchExternalProduction());
    if (!presented) {
      return false;
    }
    writeResource(resourceKeys.externalProductionAdmin(), presented);
    return true;
  }

  async function saveMode(): Promise<boolean> {
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentExternalProduction(await saveExternalProductionMode(nextMode));
      if (!presented) {
        fail("Modul de execuție externă nu a putut fi citit după salvare. Reîncarcă pagina.");
        return false;
      }
      writeResource(resourceKeys.externalProductionAdmin(), presented);
      setDraftMode(null);
      setConfirm(null);
      succeed(`Modul de execuție externă este acum ${presented.modeLabel}.`);
      return true;
    } catch (error) {
      fail("Modul de execuție externă nu a putut fi salvat.", error);
      return false;
    }
  }

  /** Creates the provider named in the confirmation; runs only from that explicit confirmation. */
  async function createProvider(name: string): Promise<boolean> {
    if (creatingRef.current) return false;
    creatingRef.current = true;
    setSaveState("pending");
    setSaveError(null);
    try {
      await createExternalProductionProvider(name);
      const ok = await refresh();
      if (!ok) {
        fail("Serverul a confirmat crearea furnizorului, dar lista nu a putut fi citită. Reîncarcă pagina.");
        return false;
      }
      setProviderName("");
      setConfirm(null);
      succeed(`Furnizorul „${name}” a fost creat.`);
      return true;
    } catch (error) {
      fail("Furnizorul extern nu a putut fi creat. Numele a rămas în formular.", error);
      return false;
    } finally {
      creatingRef.current = false;
    }
  }

  async function renameProvider(provider: ExternalProductionProviderRow): Promise<boolean> {
    const name = renameDrafts[provider.providerId] ?? provider.name;
    setSaveState("pending");
    setSaveError(null);
    try {
      await updateExternalProductionProvider(provider.providerId, { name });
      const ok = await refresh();
      if (!ok) {
        fail("Furnizorul a fost redenumit, dar lista nu a putut fi citită.");
        return false;
      }
      setRenameDrafts((current) => {
        const next = { ...current };
        delete next[provider.providerId];
        return next;
      });
      succeed("Numele furnizorului a fost salvat.");
      return true;
    } catch (error) {
      fail("Numele furnizorului nu a putut fi salvat.", error);
      return false;
    }
  }

  async function setProviderActive(
    provider: ExternalProductionProviderRow,
    active: boolean,
  ): Promise<boolean> {
    setSaveState("pending");
    setSaveError(null);
    try {
      await updateExternalProductionProvider(provider.providerId, { active });
      const ok = await refresh();
      if (!ok) {
        fail("Starea furnizorului nu a putut fi citită după salvare.");
        return false;
      }
      setConfirm(null);
      succeed(active ? `${provider.name} este din nou activ.` : `${provider.name} a fost oprit.`);
      return true;
    } catch (error) {
      fail("Starea furnizorului nu a putut fi schimbată.", error);
      return false;
    }
  }

  /** Renames typed in the list, saved exactly as the inline „Salvează numele” buttons save them. */
  async function saveRenames(): Promise<boolean> {
    for (const provider of model?.providers ?? []) {
      const draft = renameDrafts[provider.providerId];
      if (draft !== undefined && draft !== provider.name && !(await renameProvider(provider))) return false;
    }
    return true;
  }

  /**
   * Leaving with unsaved values saves through the same flows as the page: a mode change through its
   * confirmation, renames as the inline buttons do. A new provider is never created on the way out.
   */
  function requestLeaveSave(): void {
    setSaveError(null);
    if (modeDirty) {
      setConfirm({ kind: "mode" });
      return;
    }
    if (renamesDirty) void saveRenames();
  }

  function discard(): void {
    setDraftMode(null);
    setRenameDrafts({});
    setProviderName("");
    setSaveState("idle");
    setSaveError(null);
  }

  const typedProvider = providerName.trim();
  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Modificările de la execuția externă",
    requestSave: modeDirty || renamesDirty ? requestLeaveSave : undefined,
    saveFlowOpen: confirm !== null || pending,
    onDiscard: discard,
    note: typedProvider
      ? `Furnizorul nou „${typedProvider}” nu este creat la plecare. Îl poți crea din pagină, cu „Adaugă furnizor”, după confirmare.`
      : null,
  });

  const nextLabel = nextMode === "ENABLED" ? "Activ" : "Oprit";

  return (
    <AdminLayout
      current="external-production"
      title="Execuție externă"
      lead="Organizația alege dacă o sarcină planificată poate fi predată unui furnizor de producție din afara atelierului. Nu este serviciu de montaj și nu este o zonă de lucru."
      meta={
        model
          ? model.canWrite
            ? "Doar proprietarul poate schimba modul și furnizorii."
            : "Editarea nu este disponibilă pentru acest rol."
          : undefined
      }
      changeBar={
        modeDirty && model ? (
          <AdminChangeBar
            title="Modificare nesalvată · Predare către furnizor"
            detail={`Mod: ${model.modeLabel} → ${nextLabel}`}
            saveLabel="Revizuiește și salvează"
            pending={pending}
            onDiscard={() => setDraftMode(null)}
            onSave={() => {
              setSaveError(null);
              setConfirm({ kind: "mode" });
            }}
          />
        ) : null
      }
    >
      {!model && resource.status !== "error" ? (
        <LoadingFloor variant="admin" label="Se încarcă execuția externă" />
      ) : null}
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Modul nu a putut fi citit">
          Politica de execuție externă nu este disponibilă. Reîncarcă pagina; nimic nu a fost schimbat.
        </InlineAlert>
      ) : null}
      {model ? (
        <>
          {saveState === "success" && successText ? (
            <InlineAlert tone="success" title="Modificarea a fost salvată">
              {successText}
            </InlineAlert>
          ) : null}
          {saveError && !confirm ? (
            <InlineAlert tone="error" title="Salvarea a eșuat">
              {saveError}
            </InlineAlert>
          ) : null}
          <AdminSection
            title="Predare către furnizor"
            description={`Mod curent: ${model.modeLabel}. ${EFFECT[model.mode]}`}
          >
            {model.canWrite ? (
              <AdminPolicyOptions
                name="external-production-mode"
                legend="Mod"
                value={nextMode}
                activeValue={model.mode}
                disabled={pending}
                options={EXTERNAL_PRODUCTION_MODE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                  description: EFFECT[item.value === "ENABLED" ? "ENABLED" : "DISABLED"],
                }))}
                onChange={(value) => {
                  setSaveState("idle");
                  setDraftMode(value);
                }}
              />
            ) : (
              <AdminReadOnlyNote>Doar proprietarul organizației poate schimba modul.</AdminReadOnlyNote>
            )}
            <p className="adm-section__note">
              Oprirea nu blochează revenirea unei sarcini deja la furnizor. Numele afișat după predare rămâne cel de
              la momentul predării.
            </p>
          </AdminSection>
          <AdminSection title="Furnizori externi">
            <div data-testid="external-provider-registry">
              {model.providers.length === 0 ? <p>Nu există furnizori externi.</p> : null}
              {model.providers.length > 0 ? (
                <ul className="adm-members" aria-label="Furnizori externi">
                  {model.providers.map((provider) => (
                    <li
                      key={provider.providerId}
                      className="adm-member"
                      data-muted={!provider.active || undefined}
                    >
                      {model.canWrite ? (
                        <span className="adm-member__identity adm-member__identity--edit">
                          <TextField
                            id={`external-provider-name-${provider.providerId}`}
                            label="Nume furnizor"
                            value={renameDrafts[provider.providerId] ?? provider.name}
                            disabled={pending}
                            onChange={(value) =>
                              setRenameDrafts((current) => ({
                                ...current,
                                [provider.providerId]: value,
                              }))
                            }
                          />
                        </span>
                      ) : (
                        <span className="adm-member__identity">
                          <strong>{provider.name}</strong>
                        </span>
                      )}
                      <span className="adm-chip">{provider.active ? "Activ" : "Oprit"}</span>
                      {model.canWrite ? (
                        <span className="adm-member__actions">
                          {(renameDrafts[provider.providerId] ?? provider.name) !== provider.name ? (
                            <Button disabled={pending} onClick={() => void renameProvider(provider)}>
                              Salvează numele
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              setSaveError(null);
                              if (provider.active) {
                                // R1 · F10: stopping a provider always asks first.
                                setConfirm({ kind: "stop", provider });
                              } else {
                                void setProviderActive(provider, true);
                              }
                            }}
                          >
                            {provider.active ? "Oprește furnizorul" : "Activează furnizorul"}
                          </Button>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {model.canWrite ? (
                <div className="adm-inline-create">
                  <TextField
                    id="external-provider-create"
                    label="Furnizor nou"
                    value={providerName}
                    disabled={pending}
                    onChange={setProviderName}
                  />
                  <Button
                    disabled={pending || providerName.trim().length === 0}
                    onClick={() => {
                      setSaveError(null);
                      setConfirm({ kind: "create", name: providerName.trim() });
                    }}
                  >
                    Adaugă furnizor
                  </Button>
                </div>
              ) : null}
            </div>
          </AdminSection>
        </>
      ) : null}
      {confirm?.kind === "mode" && model ? (
        <AdminConfirmDialog
          title={nextMode === "ENABLED" ? "Pornești execuția externă?" : "Oprești execuția externă?"}
          subtitle={`${model.modeLabel} → ${nextLabel}`}
          confirmLabel={nextMode === "ENABLED" ? "Pornește" : "Oprește"}
          danger={nextMode === "DISABLED"}
          busy={pending}
          error={saveState === "error" ? saveError : null}
          onConfirm={() => {
            void saveMode();
          }}
          onCancel={() => {
            setConfirm(null);
            setSaveState("idle");
            setSaveError(null);
          }}
        >
          <p>{EFFECT[nextMode]}</p>
          <p>Se aplică lucrărilor acestei organizații.</p>
        </AdminConfirmDialog>
      ) : null}
      {confirm?.kind === "stop" ? (
        <AdminConfirmDialog
          title={`Oprești furnizorul ${confirm.provider.name}?`}
          confirmLabel="Oprește furnizorul"
          danger
          busy={pending}
          error={saveState === "error" ? saveError : null}
          onConfirm={() => {
            void setProviderActive(confirm.provider, false);
          }}
          onCancel={() => {
            setConfirm(null);
            setSaveState("idle");
            setSaveError(null);
          }}
        >
          <p>Nu va mai putea primi sarcini noi.</p>
          <p>Sarcinile deja predate lui pot reveni în atelier ca până acum. Îl poți activa din nou oricând.</p>
        </AdminConfirmDialog>
      ) : null}
      {confirm?.kind === "create" ? (
        <AdminConfirmDialog
          title={`Creezi furnizorul „${confirm.name}”?`}
          confirmLabel="Creează furnizorul"
          busy={pending}
          error={saveState === "error" ? saveError : null}
          onConfirm={() => {
            void createProvider(confirm.name);
          }}
          onCancel={() => {
            setConfirm(null);
            setSaveState("idle");
            setSaveError(null);
          }}
        >
          <p>Furnizorul nou apare în lista furnizorilor externi, activ.</p>
          <p>Numele se poate schimba ulterior din listă.</p>
        </AdminConfirmDialog>
      ) : null}
      {guard}
    </AdminLayout>
  );
}
