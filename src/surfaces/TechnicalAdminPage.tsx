import { useState } from "react";
import {
  presentTechnicalSettingsAdmin,
  type TechnicalSettingsAdminTransport,
} from "../adapters/technicalSettingsAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { postTechnicalSettings } from "../api/technicalSettings";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterTechnicalSettingsChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadTechnicalSettingsAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "alreadyApplied" | "error";

function parseDraft(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function settingDrafts(model: TechnicalSettingsAdminTransport): Record<string, string> {
  return Object.fromEntries(model.settings.map((item) => [item.settingId, item.value]));
}

export function TechnicalAdminPage() {
  const admin = useResource(resourceKeys.technicalAdmin(), loadTechnicalSettingsAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<TechnicalSettingsAdminTransport | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(next: TechnicalSettingsAdminTransport): void {
    setModel(next);
    setDrafts(settingDrafts(next));
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Setările tehnice nu sunt disponibile.");
  }

  async function save(): Promise<void> {
    const ledPitchMm = parseDraft(drafts.ledPitchMm ?? "");
    const ledModulePowerW = parseDraft(drafts.ledModulePowerW ?? "");
    const psuReservePercent = parseDraft(drafts.psuReservePercent ?? "");
    if (ledPitchMm === null || ledModulePowerW === null || psuReservePercent === null) {
      setSaveState("error");
      setErrorMessage("Setările tehnice trebuie să fie numere.");
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postTechnicalSettings({
      ledPitchMm,
      ledModulePowerW,
      psuReservePercent,
    });
    if (result.ok) {
      const presented = presentTechnicalSettingsAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.technicalAdmin(), presented);
      applyAdmin(presented);
      invalidateAfterTechnicalSettingsChange();
      setSaveState(result.body && (result.body as { alreadyApplied?: boolean }).alreadyApplied
        ? "alreadyApplied"
        : "success");
      return;
    }
    setSaveState("error");
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (readTransportErrorCode(result.body) === "forbidden"
          ? "Nu ai dreptul să modifici setările tehnice."
          : "Setările tehnice nu au putut fi salvate."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/technical"
      workspace="admin"
      eyebrow="Administrare"
      title="Setări tehnice"
      lead="Aceste valori sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate."
      meta={
        model?.canEdit
          ? "Doar Owner poate confirma setările tehnice ale organizației."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("technical")}
          />
          <SurfacePanel title="Setările curente" label="Setări" busy>
            <LoadingFloor variant="admin" label="Se încarcă setările tehnice" />
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
            items={administrationRailItems("technical")}
          />
          <SurfacePanel
            title="Setările curente"
            label="Setări"
            status={
              <StatusBadge
                label={model.resolutionOk ? "Active" : "Blocate"}
                tone={model.resolutionOk ? "ready" : "blocked"}
              />
            }
          >
            {model.guidance ? (
              <InlineAlert
                tone={model.resolutionOk ? "pending" : "blocked"}
                title={
                  model.resolutionOk
                    ? "Calcul tehnic pentru lucrări noi"
                    : "Setările trebuie corectate"
                }
              >
                {model.guidance}
              </InlineAlert>
            ) : null}
            {saveState === "success" ? (
              <InlineAlert tone="success" title="Setările au fost salvate">
                Versiunile noi se aplică doar lucrărilor viitoare.
              </InlineAlert>
            ) : null}
            {saveState === "alreadyApplied" ? (
              <InlineAlert tone="pending" title="Valorile sunt deja salvate">
                Nu a fost creată o versiune nouă.
              </InlineAlert>
            ) : null}
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            {model.settings.map((setting) => (
              <div key={setting.settingId}>
                <TextField
                  id={setting.settingId}
                  label={`${setting.label}${setting.unit ? ` (${setting.unit})` : ""}`}
                  hint={setting.description}
                  value={drafts[setting.settingId] ?? ""}
                  inputMode="decimal"
                  disabled={!editEnabled}
                  onChange={(value) => {
                    setDrafts((current) => ({ ...current, [setting.settingId]: value }));
                  }}
                />
                <dl>
                  {setting.sourceLabel ? (
                    <InfoRow label="Sursă" value={setting.sourceLabel} />
                  ) : null}
                  {setting.version !== null ? (
                    <InfoRow label="Versiune" value={String(setting.version)} />
                  ) : null}
                  {setting.statusLabel ? (
                    <InfoRow label="Stare" value={setting.statusLabel} />
                  ) : null}
                  {setting.effectiveFrom ? (
                    <InfoRow
                      label="Efectivă de la"
                      value={formatTimestamp(setting.effectiveFrom) ?? setting.effectiveFrom}
                    />
                  ) : null}
                </dl>
              </div>
            ))}
            {model.canEdit ? (
              <Button
                disabled={pending}
                onClick={() => {
                  void save();
                }}
              >
                Salvează setările
              </Button>
            ) : (
              <p>Editarea nu este disponibilă pentru acest rol.</p>
            )}
            {pending ? <LoadingIndicator label="Se salvează setările tehnice" /> : null}
          </SurfacePanel>
          <SurfacePanel title="Istoric versiuni" label="Istoric">
            {model.history.length === 0 ? (
              <p>Nu există încă versiuni persistate.</p>
            ) : (
              <Worklist variant="compact" label="Versiuni setări tehnice">
                {[...model.history].reverse().map((row) => (
                  <WorklistRow
                    key={`${row.definitionId}:${row.version}`}
                    variant="compact"
                    identity={`${row.settingId} · versiunea ${row.version}`}
                    identityDetail={row.statusLabel || row.status}
                    context={
                      formatTimestamp(row.effectiveFrom ?? row.createdAt) ??
                      row.sourceLabel
                    }
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}
