import { useState, type ReactNode } from "react";
import {
  presentTechnicalSettingsAdmin,
  type TechnicalSettingsAdminTransport,
} from "../adapters/technicalSettingsAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { changeCountLabel } from "../admin/adminText";
import {
  AdminBullets,
  AdminChangeBar,
  AdminColumns,
  AdminContextBlock,
  AdminField,
  AdminReviewDialog,
  AdminSection,
  AdminSupportDetails,
  AdminVersionList,
} from "../admin/adminParts";
import { postTechnicalSettings } from "../api/technicalSettings";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterTechnicalSettingsChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadTechnicalSettingsAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";
import { administrationReturnFromSearch } from "../routing/administrationReturn";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";

type SaveState = "idle" | "pending" | "success" | "alreadyApplied" | "error";

const SAVE_EFFECTS = [
  "Salvarea creează versiuni noi ale setărilor modificate.",
  "Valorile noi se folosesc la calculul tehnic al lucrărilor noi.",
  "Lucrările înghețate rămân neschimbate.",
] as const;

function parseDraft(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

function settingDrafts(model: TechnicalSettingsAdminTransport): Record<string, string> {
  return Object.fromEntries(model.settings.map((setting) => [setting.settingId, setting.value]));
}

/**
 * Keeps every draft that differs from the old baseline; takes the server value for the rest. A save
 * or a refresh therefore never erases a setting the owner is still editing (R1 · F5).
 */
function mergeDrafts(
  previous: TechnicalSettingsAdminTransport | null,
  drafts: Record<string, string>,
  next: TechnicalSettingsAdminTransport,
  resetIds: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const base = previous ? settingDrafts(previous) : {};
  return Object.fromEntries(
    next.settings.map((setting) => {
      const draft = drafts[setting.settingId];
      const kept = !resetIds.has(setting.settingId) && draft !== undefined && draft !== base[setting.settingId];
      return [setting.settingId, kept ? draft : setting.value];
    }),
  );
}

export function TechnicalAdminPage() {
  const admin = useResource(resourceKeys.technicalAdmin(), loadTechnicalSettingsAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<TechnicalSettingsAdminTransport | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const componentId = new URLSearchParams(window.location.search).get("component");
  const administrationReturn = administrationReturnFromSearch(window.location.search);

  const loadState =
    admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setDrafts(mergeDrafts(model, drafts, admin.data));
    setModel(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Setările tehnice nu sunt disponibile.");
  }

  const visible = model?.settings.filter((item) => !componentId || item.typeId === componentId) ?? [];
  const changed = visible.filter((setting) => (drafts[setting.settingId] ?? setting.value) !== setting.value);
  const dirty = changed.length > 0;
  const labels = new Map(model?.settings.map((setting) => [setting.settingId, setting]) ?? []);
  const visibleHistory =
    model?.history.filter((row) => visible.some((item) => item.settingId === row.settingId)) ?? [];

  function discard(): void {
    if (model) {
      setDrafts((current) => ({
        ...current,
        ...Object.fromEntries(visible.map((setting) => [setting.settingId, setting.value])),
      }));
    }
    setSaveState("idle");
    setErrorMessage(null);
    setReviewing(false);
  }

  async function save(): Promise<boolean> {
    if (!model) return false;
    const settings: Array<{ settingId: string; value: number }> = [];
    for (const setting of visible) {
      const value = parseDraft(drafts[setting.settingId] ?? "");
      if (value === null) {
        setSaveState("error");
        setErrorMessage("Setările tehnice trebuie să fie numere.");
        return false;
      }
      settings.push({ settingId: setting.settingId, value });
    }
    if (settings.length === 0) {
      setSaveState("error");
      setErrorMessage("Setările tehnice trebuie să fie numere.");
      return false;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postTechnicalSettings({ settings });
    if (result.ok) {
      const presented = presentTechnicalSettingsAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      writeResource(resourceKeys.technicalAdmin(), presented);
      setSource(presented);
      setDrafts(mergeDrafts(model, drafts, presented, new Set(settings.map((item) => item.settingId))));
      setModel(presented);
      invalidateAfterTechnicalSettingsChange();
      setSaveState(
        result.body && (result.body as { alreadyApplied?: boolean }).alreadyApplied ? "alreadyApplied" : "success",
      );
      setReviewing(false);
      return true;
    }
    setSaveState("error");
    setErrorMessage(
      adminFailureContent(describeAdminFailure(result.status, result.body, { forbidden: "Nu ai dreptul să modifici setările tehnice." }, "Setările tehnice nu au putut fi salvate.")),
    );
    return false;
  }

  /** The one way to save: the change bar and the leave question both open the same review. */
  function openReview(): void {
    setSaveState("idle");
    setErrorMessage(null);
    setReviewing(true);
  }

  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Setările tehnice",
    requestSave: openReview,
    saveFlowOpen: reviewing || saveState === "pending",
    onDiscard: discard,
  });

  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);
  const parseError = saveState === "error" && errorMessage === "Setările tehnice trebuie să fie numere.";

  return (
    <AdminLayout
      current="technical"
      title="Setări tehnice"
      lead="Valori tehnice pentru calculul lucrărilor noi. Nu înlocuiesc costul de achiziție al materialelor. Lucrările înghețate rămân neschimbate."
      returnLink={componentId ? administrationReturn : undefined}
      meta={
        loadState === "ready" && model ? (
          <>
            <span>{model.resolutionOk ? "Active" : "Blocate"}</span>
            <span>
              {presentAdminEditMeta({
                settled: true,
                canEdit,
                whenEditable: "Doar proprietarul poate confirma setările tehnice ale organizației.",
                whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
              })}
            </span>
          </>
        ) : undefined
      }
      changeBar={
        dirty && canEdit ? (
          <AdminChangeBar
            title={changeCountLabel(changed.length)}
            detail={changed
              .map((setting) => `${setting.label} ${setting.value} → ${drafts[setting.settingId]} ${setting.unit}`.trim())
              .join(" · ")}
            pending={pending}
            onDiscard={discard}
            onSave={openReview}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă setările tehnice" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <AdminColumns
          main={
            <>
              {componentId && !model.settings.some((item) => item.typeId === componentId) ? (
                <p className="adm-section__description">Această componentă nu are setări editabile în versiunea curentă.</p>
              ) : null}
              {model.guidance ? (
                <InlineAlert
                  tone={model.resolutionOk ? "pending" : "blocked"}
                  title={model.resolutionOk ? "Calcul tehnic pentru lucrări noi" : "Setările trebuie corectate"}
                >
                  {model.guidance}
                </InlineAlert>
              ) : null}
              {saveState === "success" && !dirty ? (
                <InlineAlert tone="success" title="Setările au fost salvate">
                  Versiunile noi se aplică doar lucrărilor viitoare.
                </InlineAlert>
              ) : null}
              {saveState === "alreadyApplied" && !dirty ? (
                <InlineAlert tone="pending" title="Valorile sunt deja salvate">
                  Nu a fost creată o versiune nouă.
                </InlineAlert>
              ) : null}
              {saveState === "error" && errorMessage && !reviewing ? (
                <InlineAlert tone="error" title="Salvarea a eșuat">
                  {errorMessage} Modificările tale sunt păstrate.
                </InlineAlert>
              ) : null}
              {visible.length > 0 ? (
                <AdminSection title="Setări pentru lucrări noi">
                  {visible.map((setting) => (
                    <AdminField
                      key={setting.settingId}
                      id={setting.settingId}
                      label={setting.label}
                      help={
                        <>
                          {setting.description}
                          {setting.version !== null ? (
                            <span className="adm-field__provenance">
                              {" "}
                              {[setting.sourceLabel, `versiunea ${setting.version}`, setting.statusLabel, setting.effectiveFrom ? `din ${formatTimestamp(setting.effectiveFrom) ?? setting.effectiveFrom}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : setting.sourceLabel ? (
                            <span className="adm-field__provenance"> {setting.sourceLabel}</span>
                          ) : null}
                        </>
                      }
                      unit={setting.unit}
                      inputMode="decimal"
                      value={drafts[setting.settingId] ?? setting.value}
                      baseline={setting.value}
                      readOnly={!canEdit}
                      disabled={pending}
                      error={
                        parseError && parseDraft(drafts[setting.settingId] ?? "") === null
                          ? "Trebuie să fie un număr."
                          : null
                      }
                      onChange={(value) => setDrafts((current) => ({ ...current, [setting.settingId]: value }))}
                    />
                  ))}
                </AdminSection>
              ) : null}
              <AdminSupportDetails>
                {visible.map((setting) => (
                  <p key={setting.settingId}>
                    {setting.label}: {setting.settingId}
                  </p>
                ))}
              </AdminSupportDetails>
            </>
          }
          aside={
            <>
              <AdminContextBlock title={dirty ? "La salvare" : "Cum se folosesc"}>
                <AdminBullets items={SAVE_EFFECTS} />
              </AdminContextBlock>
              <AdminVersionList
                rows={[...visibleHistory].reverse().map((row) => ({
                  key: `${row.definitionId}:${row.version}`,
                  version: `v${row.version}`,
                  active: row.status === "ACTIVE",
                  when: formatTimestamp(row.effectiveFrom ?? row.createdAt) ?? row.sourceLabel,
                  detail: [labels.get(row.settingId)?.label, row.status === "ACTIVE" ? null : row.statusLabel || row.status]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                emptyText="Nu există încă versiuni persistate."
              />
            </>
          }
        />
      ) : null}
      {reviewing && model ? (
        <AdminReviewDialog
          subtitle="Setări tehnice · se creează versiuni noi pentru valorile modificate"
          rows={changed.map((setting) => ({
            label: setting.label,
            from: `${setting.value} ${setting.unit}`.trim(),
            to: `${drafts[setting.settingId]} ${setting.unit}`.trim(),
          }))}
          unchanged={visible.length > changed.length ? "Celelalte setări rămân neschimbate." : null}
          effects={SAVE_EFFECTS}
          confirmLabel="Salvează setările"
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            void save();
          }}
          onCancel={() => setReviewing(false)}
        />
      ) : null}
      {guard}
    </AdminLayout>
  );
}
