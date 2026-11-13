import { useMemo, useState } from "react";
import { presentCostEvidenceMutation } from "../adapters/resourcesAdapter";
import { readTransportErrorCode } from "../api/http";
import { patchCostEvidence, postCostEvidence } from "../api/resources";
import type { CostEvidenceRowTransport } from "../api/types";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { AssemblyOperationCostPolicyPanel } from "./AssemblyOperationCostPolicyPanel";
import { invalidateAfterCostEvidenceChange } from "../data/invalidation";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadResourcesAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import {
  COST_PRODUCTION_NAV_LABEL,
  COST_REGISTRY_FILTERS,
  costAmountEditLabel,
  costCategoryFromKindLabel,
  costRelationshipCopy,
  costRowAmountContext,
  costRowDetail,
  costVerificationLabel,
  costVerificationTone,
  filterCostRegistryRows,
  parseCostAmountDraft,
  presentCostVerification,
  sameCostRegistryRow,
  type CostRegistryFilterId,
} from "../presentation/costUsability";
import { formatTimestamp } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";

type SaveState = "idle" | "pending" | "success" | "stale" | "error";

function rowKey(row: CostEvidenceRowTransport, index: number): string {
  return row.evidenceRowId ?? `${row.resourceId}:${row.qualifierIdentity ?? index}`;
}

function amountDraft(row: CostEvidenceRowTransport | null): string {
  return row?.amount === null || row?.amount === undefined ? "" : String(row.amount);
}

function qualifierWhen(
  row: CostEvidenceRowTransport,
): { volumeDepthMm?: number } | undefined {
  if (row.qualifier?.kind !== "volumeDepthMm") {
    return undefined;
  }
  return { volumeDepthMm: row.qualifier.value };
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CostRegistryFilterId>("all");
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

  const visibleRows = useMemo(() => {
    const filtered = filterCostRegistryRows(rows, filter, query);
    if (!selected) {
      return filtered;
    }
    if (filtered.some((row) => sameCostRegistryRow(row, selected))) {
      return filtered;
    }
    return [selected, ...filtered];
  }, [filter, query, rows, selected]);

  if (admin.data && admin.data !== source) {
    const previous =
      rows.find((row, index) => rowKey(row, index) === selectedKey) ?? null;
    setSource(admin.data);
    setRows(admin.data.rows);
    setCanEdit(admin.data.canEdit);
    if (previous) {
      const nextSelected =
        admin.data.rows.find((row) => sameCostRegistryRow(row, previous)) ?? null;
      if (nextSelected) {
        setSelectedKey(
          rowKey(nextSelected, admin.data.rows.indexOf(nextSelected)),
        );
        setAmount(amountDraft(nextSelected));
        setNote(nextSelected.note ?? "");
      } else {
        setSelectedKey(null);
        setAmount("");
        setNote("");
      }
    }
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Costurile de producție nu sunt disponibile.");
  }

  function selectRow(row: CostEvidenceRowTransport, index: number): void {
    setSelectedKey(rowKey(row, index));
    setAmount(amountDraft(row));
    setNote(row.note ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  function clearSelection(): void {
    setSelectedKey(null);
    setAmount("");
    setNote("");
    setSaveState("idle");
    setErrorMessage(null);
  }

  function discardDraft(): void {
    setAmount(amountDraft(selected));
    setNote(selected?.note ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function save(row: CostEvidenceRowTransport): Promise<void> {
    const parsed = parseCostAmountDraft(amount);
    if (!parsed.ok) {
      setSaveState("error");
      setErrorMessage("Costul trebuie să fie un număr.");
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const trimmedNote = note.trim();
    const body =
      trimmedNote === ""
        ? { amount: parsed.amount }
        : { amount: parsed.amount, note: trimmedNote };
    const when = qualifierWhen(row);
    const result = row.evidenceRowId
      ? await patchCostEvidence(row.evidenceRowId, body)
      : await postCostEvidence({
          resourceId: row.resourceId,
          ...body,
          ...(when ? { when } : {}),
        });
    if (result.ok) {
      const presented = presentCostEvidenceMutation(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.resourcesAdmin(), presented.admin);
      invalidateResources(resourceKeys.assemblyOperationCostAdmin());
      setSaveState("success");
      return;
    }
    if (readTransportErrorCode(result.body) === "stale_cost_evidence" || result.status === 409) {
      setSaveState("stale");
      return;
    }
    setSaveState("error");
    setErrorMessage("Costul nu a putut fi salvat. Încearcă din nou.");
  }

  const pending = saveState === "pending";
  const dirty =
    selected !== null &&
    (amount !== amountDraft(selected) || note !== (selected.note ?? ""));
  const verification = selected ? presentCostVerification(selected) : null;
  const category = selected ? costCategoryFromKindLabel(selected.kindLabel) : "unknown";
  const editEnabled = Boolean(canEdit && selected && !pending);
  const amountLabel = selected
    ? costAmountEditLabel(category, selected.unitLabel, selected.currency)
    : "Cost";

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/resources"
      workspace="admin"
      eyebrow="Administrare"
      title={COST_PRODUCTION_NAV_LABEL}
      lead="Setezi costurile interne pentru calculele de producție noi. Prețul de vânzare al unei oferte noi se introduce separat. Ofertele deja confirmate nu se schimbă."
      meta={presentAdminEditMeta({
        settled: loadState === "ready",
        canEdit,
        whenEditable: "Doar proprietarul poate modifica costurile de producție.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("resources")}
          />
          <SurfacePanel variant="flush" title="Costuri" label="Costuri" busy>
            <LoadingFloor variant="admin" label="Se încarcă costurile de producție" />
          </SurfacePanel>
          <SurfacePanel title="Cost selectat" label="Detaliu cost" busy>
            <LoadingFloor variant="facts" label="Se citește costul" />
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
            label="Administrare"
            items={administrationRailItems("resources")}
          />
          <SurfacePanel
            variant="flush"
            title="Costuri"
            label="Costuri"
            action={
              selected ? (
                <Button variant="ghost" onClick={clearSelection}>
                  Golește selecția
                </Button>
              ) : null
            }
          >
            <div className="cost-registry-filters">
              <FilterBar
                searchId="cost-registry-search"
                searchLabel="Caută după nume"
                searchPlaceholder="Plexiglas, CNC, manoperă…"
                searchValue={query}
                onSearchChange={setQuery}
                chips={[...COST_REGISTRY_FILTERS]}
                selectedChip={filter}
                onChipChange={(id) => setFilter(id as CostRegistryFilterId)}
                meta={`${visibleRows.length} din ${rows.length}`}
              />
            </div>
            {visibleRows.length === 0 ? (
              <EmptyState title="Nicio resursă nu corespunde filtrului." />
            ) : (
              <Worklist variant="compact" label="Costuri de producție">
                {visibleRows.map((row, visibleIndex) => {
                  const index = rows.indexOf(row);
                  const key = rowKey(row, index === -1 ? visibleIndex : index);
                  const current = selected !== null && sameCostRegistryRow(row, selected);
                  return (
                    <WorklistRow
                      key={key}
                      variant="compact"
                      selected={current}
                      onSelect={() => selectRow(row, index === -1 ? visibleIndex : index)}
                      identity={row.resourceLabel}
                      identityDetail={costRowDetail(row, canEdit)}
                      context={costRowAmountContext(row, canEdit)}
                    />
                  );
                })}
              </Worklist>
            )}
          </SurfacePanel>
          <SurfacePanel
            variant={selected ? "selected" : "default"}
            title={selected?.resourceLabel ?? "Cost selectat"}
            label="Detaliu cost"
            status={
              selected && verification ? (
                <StatusBadge
                  label={costVerificationLabel(verification)}
                  tone={costVerificationTone(verification)}
                />
              ) : (
                <StatusBadge
                  label={canEdit ? "Editabil" : "Doar citire"}
                  tone={statusTone("workflow")}
                />
              )
            }
          >
            {selected && verification ? (
              <>
                <dl>
                  <InfoRow
                    label="Categorie"
                    value={
                      COST_REGISTRY_FILTERS.find((item) => item.id === category)?.label ??
                      "Cost"
                    }
                  />
                  {selected.qualifierLabel ? (
                    <InfoRow label="Pentru" value={selected.qualifierLabel} />
                  ) : null}
                  <InfoRow label="Unitate" value={selected.unitLabel ?? "—"} />
                  {canEdit ? (
                    <InfoRow
                      label="Ultima modificare"
                      value={formatTimestamp(selected.lastChangedAt) ?? "—"}
                    />
                  ) : null}
                </dl>
                {verification === "missing" && !canEdit ? (
                  <InlineAlert tone="pending" title="Cost lipsa">
                    Acest tarif nu există. Nu este zero.
                  </InlineAlert>
                ) : null}
                {canEdit ? (
                  <>
                    <TextField
                      id="cost-amount"
                      label={amountLabel}
                      value={amount}
                      hint={costRelationshipCopy(category) ?? undefined}
                      inputMode="decimal"
                      disabled={!editEnabled}
                      onChange={(value) => {
                        setAmount(value);
                        if (saveState === "success") {
                          setSaveState("idle");
                        }
                      }}
                    />
                    <TextField
                      id="cost-note"
                      label="Notă"
                      value={note}
                      disabled={!editEnabled}
                      onChange={(value) => {
                        setNote(value);
                        if (saveState === "success") {
                          setSaveState("idle");
                        }
                      }}
                    />
                    <div className="cluster">
                      <Button
                        disabled={!editEnabled}
                        onClick={() => {
                          void save(selected);
                        }}
                      >
                        Salvează
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!editEnabled || !dirty}
                        onClick={discardDraft}
                      >
                        Renunță
                      </Button>
                    </div>
                  </>
                ) : (
                  <InlineAlert tone="blocked" title="Modificare indisponibilă">
                    Acest rol nu poate modifica costurile de producție.
                  </InlineAlert>
                )}
                {saveState === "pending" ? (
                  <LoadingIndicator label="Se salvează costul" />
                ) : null}
                {saveState === "success" ? (
                  <InlineAlert tone="success" title="Cost salvat">
                    Calculele interne noi folosesc această valoare. Prețul de vânzare
                    introdus manual și ofertele confirmate rămân neschimbate.
                  </InlineAlert>
                ) : null}
                {saveState === "stale" ? (
                  <div className="stack">
                    <InlineAlert tone="error" title="Costul a fost modificat între timp">
                      Costul a fost modificat între timp. Reîncarcă valoarea curentă.
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
              </>
            ) : (
              <EmptyState title="Alege un material, o manoperă sau o operație." />
            )}
          </SurfacePanel>
          <div className="operation-cost-admin-band">
            <AssemblyOperationCostPolicyPanel />
          </div>
        </>
      ) : null}
    </SlicePage>
  );
}
