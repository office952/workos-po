import { useMemo, useState } from "react";
import {
  findCostEvidenceRow,
  presentCostEvidenceMutation,
} from "../adapters/resourcesAdapter";
import { readTransportErrorCode } from "../api/http";
import { patchCostEvidence } from "../api/resources";
import type { CostEvidenceRowTransport } from "../api/types";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { EmptyState } from "../components/EmptyState";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterCostEvidenceChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadResourcesAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatMoney, formatTimestamp } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import {
  ALUMINIUM_RETURN_PROFILE_RESOURCE_ID,
  REFERENCE_VOLUME_DEPTH_MM,
} from "../reference/lettersProduct";

type SaveState = "idle" | "pending" | "success" | "stale" | "error";

function rowKey(row: CostEvidenceRowTransport, index: number): string {
  return row.evidenceRowId ?? `${row.resourceId}:${row.qualifierIdentity ?? index}`;
}

function amountDraft(row: CostEvidenceRowTransport | null): string {
  return row?.amount === null || row?.amount === undefined ? "" : String(row.amount);
}

export function ResourcesAdminPage() {
  const admin = useResource(resourceKeys.resourcesAdmin(), loadResourcesAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<CostEvidenceRowTransport[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<unknown>(null);
  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  const selected = useMemo(
    () => rows.find((row, index) => rowKey(row, index) === selectedKey) ?? null,
    [rows, selectedKey],
  );

  function applyAdmin(nextRows: CostEvidenceRowTransport[], nextCanEdit: boolean) {
    setRows(nextRows);
    setCanEdit(nextCanEdit);
    const preferred =
      findCostEvidenceRow(
        nextRows,
        ALUMINIUM_RETURN_PROFILE_RESOURCE_ID,
        "volumeDepthMm",
        REFERENCE_VOLUME_DEPTH_MM,
      ) ??
      nextRows[0] ??
      null;
    const nextSelected = preferred ? rowKey(preferred, nextRows.indexOf(preferred)) : null;
    setSelectedKey(nextSelected);
    setAmount(amountDraft(preferred));
    setNote(preferred?.note ?? "");
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data.rows, admin.data.canEdit);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Administrarea resurselor nu este disponibilă.");
  }

  function selectRow(row: CostEvidenceRowTransport, index: number): void {
    setSelectedKey(rowKey(row, index));
    setAmount(amountDraft(row));
    setNote(row.note ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function save(evidenceRowId: string): Promise<void> {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setSaveState("error");
      setErrorMessage("Tariful trebuie să fie un număr.");
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const trimmedNote = note.trim();
    const result = await patchCostEvidence(
      evidenceRowId,
      trimmedNote === ""
        ? { amount: parsed }
        : { amount: parsed, note: trimmedNote },
    );
    if (result.ok) {
      const presented = presentCostEvidenceMutation(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.resourcesAdmin(), presented.admin);
      applyAdmin(presented.admin.rows, presented.admin.canEdit);
      setSaveState("success");
      return;
    }
    if (readTransportErrorCode(result.body) === "stale_cost_evidence" || result.status === 409) {
      setSaveState("stale");
      return;
    }
    setSaveState("error");
    setErrorMessage("Tariful nu a putut fi salvat. Încearcă din nou.");
  }

  const pending = saveState === "pending";
  const editEnabled = canEdit && selected?.evidenceRowId !== null && !pending;

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/resources"
      workspace="admin"
      eyebrow="Administrare"
      title="Dovezi de cost"
      lead="Tarif confirmat pe resursă și calificator. Valoarea salvată este folosită doar la calcule noi."
      meta={
        canEdit
          ? "Doar Owner poate modifica tariful."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Colecții"
            items={[{ id: "cost-evidence", label: "Dovezi de cost", selected: true }]}
          />
          <SurfacePanel variant="flush" title="Setări active" label="Resurse" busy>
            <LoadingFloor variant="admin" label="Se încarcă dovezile de cost" />
          </SurfacePanel>
          <SurfacePanel title="Tarif curent" label="Detaliu tarif" busy>
            <LoadingFloor variant="facts" label="Se citește tariful" />
          </SurfacePanel>
        </>
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" ? (
        <>
          <CollectionRail
            label="Colecții"
            items={[{ id: "cost-evidence", label: "Dovezi de cost", selected: true }]}
          />
          <SurfacePanel variant="flush" title="Setări active" label="Resurse">
            <Worklist variant="compact" label="Dovezi de cost">
              {rows.map((row, index) => {
                const key = rowKey(row, index);
                const current = key === selectedKey;
                return (
                  <WorklistRow
                    key={key}
                    variant="compact"
                    selected={current}
                    onSelect={() => selectRow(row, index)}
                    identity={row.resourceLabel}
                    identityDetail={row.qualifierLabel ?? "Fără calificator"}
                    context={
                      row.amountDisplay ??
                      (row.amount !== null && row.currency
                        ? formatMoney(row.amount, row.currency)
                        : "Indisponibil")
                    }
                  />
                );
              })}
            </Worklist>
          </SurfacePanel>
          <SurfacePanel
            variant={canEdit ? "selected" : "default"}
            title="Tarif curent"
            label="Detaliu tarif"
          >
            <div className="cluster">
              <StatusBadge
                label={canEdit ? "Editabil" : "Doar citire"}
                tone={statusTone("workflow")}
              />
            </div>
            {selected ? (
              <>
                <dl>
                  <InfoRow label="Resursă" value={selected.resourceLabel} />
                  <InfoRow
                    label="Calificator"
                    value={selected.qualifierLabel ?? "Fără calificator"}
                  />
                  <InfoRow label="Unitate" value={selected.unitLabel ?? "—"} />
                  <InfoRow label="Monedă" value={selected.currency ?? "—"} />
                  <InfoRow
                    label="Ultima modificare"
                    value={formatTimestamp(selected.lastChangedAt) ?? "—"}
                  />
                </dl>
                {canEdit && selected.evidenceRowId ? (
                  <>
                    <TextField
                      id="cost-amount"
                      label="Tarif"
                      value={amount}
                      inputMode="decimal"
                      disabled={!editEnabled}
                      onChange={setAmount}
                    />
                    <TextField
                      id="cost-note"
                      label="Notă"
                      value={note}
                      disabled={!editEnabled}
                      onChange={setNote}
                    />
                    <Button
                      disabled={!editEnabled}
                      onClick={() => {
                        if (selected.evidenceRowId) {
                          void save(selected.evidenceRowId);
                        }
                      }}
                    >
                      Salvează
                    </Button>
                  </>
                ) : (
                  <InlineAlert tone="blocked" title="Modificare indisponibilă">
                    Acest rol nu poate modifica dovada de cost.
                  </InlineAlert>
                )}
                {saveState === "pending" ? (
                  <LoadingIndicator label="Se salvează tariful" />
                ) : null}
                {saveState === "success" ? (
                  <InlineAlert tone="success" title="Tarif salvat">
                    Valoarea afișată este răspunsul salvat pe server. Calculele noi vor
                    folosi tariful actual. Înregistrările înghețate rămân neschimbate.
                  </InlineAlert>
                ) : null}
                {saveState === "stale" ? (
                  <div className="stack">
                    <InlineAlert tone="error" title="Tariful a fost modificat între timp">
                      Tariful a fost modificat între timp. Reîncarcă valoarea curentă.
                    </InlineAlert>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSaveState("idle");
                        setErrorMessage(null);
                        invalidateAfterCostEvidenceChange();
                      }}
                    >
                      Reîncarcă valoarea curentă
                    </Button>
                  </div>
                ) : null}
                {saveState === "error" && errorMessage ? (
                  <InlineAlert tone="error" title="Salvarea a eșuat">
                    {errorMessage}
                  </InlineAlert>
                ) : null}
                <p className="ui-note">
                  Istoricul nu se rescrie. Calculele noi folosesc tariful actual. Ofertele
                  înghețate rămân neschimbate. Costul intern rămâne separat de prețul
                  comercial.
                </p>
              </>
            ) : (
              <EmptyState title="Nu există dovezi de cost de afișat." />
            )}
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}
