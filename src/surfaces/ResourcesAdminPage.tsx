import { useMemo, useState, type ReactNode } from "react";
import { presentCostEvidenceMutation } from "../adapters/resourcesAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import {
  AdminChangeBar,
  AdminRegistry,
  AdminRegistryRow,
  AdminSwitchDialog,
} from "../admin/adminParts";
import { readTransportErrorCode } from "../api/http";
import { patchCostEvidence, postCostEvidence } from "../api/resources";
import type { CostEvidenceRowTransport } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { AssemblyOperationCostPolicyPanel } from "./AssemblyOperationCostPolicyPanel";
import { invalidateAfterCostEvidenceChange } from "../data/invalidation";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadResourcesAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
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
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";

type SaveState = "idle" | "pending" | "success" | "stale" | "error";

/** Refusals the cost write returns (apps/api resources/store.ts), in operator wording. */
const COST_CODES = {
  invalid_amount: "Suma trebuie să fie un număr mai mare decât zero.",
  unknown_resource: "Această resursă nu mai există în registru. Reîncarcă pagina.",
} as const;

function rowKey(row: CostEvidenceRowTransport, index: number): string {
  return row.evidenceRowId ?? `${row.resourceId}:${row.qualifierIdentity ?? index}`;
}

function amountDraft(row: CostEvidenceRowTransport | null): string {
  return row?.amount === null || row?.amount === undefined ? "" : String(row.amount);
}

function qualifierWhen(row: CostEvidenceRowTransport): { volumeDepthMm?: number } | undefined {
  if (row.qualifier?.kind !== "volumeDepthMm") {
    return undefined;
  }
  return { volumeDepthMm: row.qualifier.value };
}

type Switch = { key: string | null; amount: string; note: string; label: string };

export function ResourcesAdminPage() {
  const admin = useResource(resourceKeys.resourcesAdmin(), loadResourcesAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<CostEvidenceRowTransport[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CostRegistryFilterId>("all");
  const [source, setSource] = useState<unknown>(null);
  /** A selection change waiting for the owner's answer about the current draft. */
  const [pendingSwitch, setPendingSwitch] = useState<Switch | null>(null);
  /** Set by „Reîncarcă valoarea curentă”: the next read replaces the draft on purpose. */
  // The owner asked for the server value again (stale cost): that reload may replace the draft.
  const [reloadRequested, setReloadRequested] = useState(false);
  const loadState =
    admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";

  const selected = useMemo(
    () => rows.find((row, index) => rowKey(row, index) === selectedKey) ?? null,
    [rows, selectedKey],
  );
  const dirty = selected !== null && (amount !== amountDraft(selected) || note !== (selected.note ?? ""));

  const filteredRows = useMemo(() => filterCostRegistryRows(rows, filter, query), [filter, query, rows]);
  const selectedPinned = selected !== null && !filteredRows.some((row) => sameCostRegistryRow(row, selected));
  const visibleRows = selectedPinned && selected ? [selected, ...filteredRows] : filteredRows;

  if (admin.data && admin.data !== source) {
    const previous = rows.find((row, index) => rowKey(row, index) === selectedKey) ?? null;
    const keepDraft = dirty && !reloadRequested;
    if (reloadRequested) setReloadRequested(false);
    setSource(admin.data);
    setRows(admin.data.rows);
    setCanEdit(admin.data.canEdit);
    if (previous) {
      const nextSelected = admin.data.rows.find((row) => sameCostRegistryRow(row, previous)) ?? null;
      if (nextSelected) {
        setSelectedKey(rowKey(nextSelected, admin.data.rows.indexOf(nextSelected)));
        // A refresh never overwrites a value the owner is still typing (R1 · F3).
        if (!keepDraft) {
          setAmount(amountDraft(nextSelected));
          setNote(nextSelected.note ?? "");
        }
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

  function open(next: Switch): void {
    setSelectedKey(next.key);
    setAmount(next.amount);
    setNote(next.note);
    setSaveState("idle");
    setErrorMessage(null);
  }

  /** Every selection change goes through here: with a draft it asks first (R1 · F3). */
  function requestSelect(next: Switch): void {
    if (dirty) {
      setPendingSwitch(next);
      return;
    }
    open(next);
  }

  function selectRow(row: CostEvidenceRowTransport, index: number): void {
    const key = rowKey(row, index);
    if (key === selectedKey) return;
    requestSelect({ key, amount: amountDraft(row), note: row.note ?? "", label: row.resourceLabel });
  }

  function discardDraft(): void {
    setAmount(amountDraft(selected));
    setNote(selected?.note ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function save(row: CostEvidenceRowTransport): Promise<boolean> {
    const parsed = parseCostAmountDraft(amount);
    if (!parsed.ok) {
      setSaveState("error");
      setErrorMessage("Costul trebuie să fie un număr.");
      return false;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const trimmedNote = note.trim();
    const body = trimmedNote === "" ? { amount: parsed.amount } : { amount: parsed.amount, note: trimmedNote };
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
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      setReloadRequested(true);
      writeResource(resourceKeys.resourcesAdmin(), presented.admin);
      invalidateResources(resourceKeys.assemblyOperationCostAdmin());
      setSaveState("success");
      return true;
    }
    if (readTransportErrorCode(result.body) === "stale_cost_evidence" || result.status === 409) {
      setSaveState("stale");
      return false;
    }
    setSaveState("error");
    setErrorMessage(adminFailureContent(describeAdminFailure(result.status, result.body, COST_CODES, "Costul nu a putut fi salvat. Încearcă din nou.")));
    return false;
  }

  const guard = useUnsavedChangesGuard({
    dirty,
    subject: selected ? `Costul pentru ${selected.resourceLabel}` : "Costul",
    save: selected ? () => save(selected) : undefined,
    onDiscard: discardDraft,
  });

  const pending = saveState === "pending";
  const verification = selected ? presentCostVerification(selected) : null;
  const category = selected ? costCategoryFromKindLabel(selected.kindLabel) : "unknown";
  const editEnabled = Boolean(canEdit && selected && !pending);
  const amountLabel = selected ? costAmountEditLabel(category, selected.unitLabel, selected.currency) : "Cost";

  return (
    <AdminLayout
      current="resources"
      title={COST_PRODUCTION_NAV_LABEL}
      lead="Costurile interne pentru calculele de producție noi. Prețul de vânzare al unei oferte noi se introduce separat. Ofertele deja confirmate nu se schimbă."
      meta={presentAdminEditMeta({
        settled: loadState === "ready",
        canEdit,
        whenEditable: "Doar proprietarul poate modifica costurile de producție.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
      changeBar={
        dirty && canEdit && selected ? (
          <AdminChangeBar
            title={`1 modificare nesalvată · ${selected.resourceLabel}`}
            detail={`${amountLabel}: ${amountDraft(selected) || "lipsă"} → ${amount || "gol"}`}
            saveLabel="Salvează costul"
            pending={pending}
            onDiscard={discardDraft}
            onSave={() => {
              void save(selected);
            }}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă costurile de producție" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" ? (
        <>
          <AdminRegistry
            label="Costuri"
            list={
              <>
                <div className="adm-list-tools cost-registry-filters">
                  <FilterBar
                    searchId="cost-registry-search"
                    searchLabel="Caută după nume"
                    searchPlaceholder="Plexiglas, CNC, manoperă…"
                    searchValue={query}
                    onSearchChange={setQuery}
                    chips={[...COST_REGISTRY_FILTERS]}
                    selectedChip={filter}
                    onChipChange={(id) => setFilter(id as CostRegistryFilterId)}
                    meta={`${filteredRows.length} din ${rows.length}`}
                  />
                </div>
                {visibleRows.length === 0 ? (
                  <EmptyState title="Nicio resursă nu corespunde filtrului." />
                ) : (
                  <div role="list" aria-label="Costuri de producție">
                    {visibleRows.map((row, visibleIndex) => {
                      const index = rows.indexOf(row);
                      const key = rowKey(row, index === -1 ? visibleIndex : index);
                      const current = selected !== null && sameCostRegistryRow(row, selected);
                      return (
                        <div role="listitem" key={key}>
                          {current && selectedPinned ? (
                            <p className="adm-pinned">În editare · nu corespunde filtrului</p>
                          ) : null}
                          <AdminRegistryRow
                            title={row.resourceLabel}
                            detail={costRowDetail(row, canEdit)}
                            status={costRowAmountContext(row, canEdit)}
                            selected={current}
                            dirty={current && dirty}
                            onSelect={() => selectRow(row, index === -1 ? visibleIndex : index)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            }
            detail={
              selected && verification ? (
                <section aria-labelledby="cost-detail-title">
                  <div className="adm-detail-head">
                    <h2 id="cost-detail-title" className="adm-detail-head__title">
                      {selected.resourceLabel}
                    </h2>
                    <p className="adm-detail-head__meta">
                      {[
                        COST_REGISTRY_FILTERS.find((item) => item.id === category)?.label ?? "Cost",
                        selected.qualifierLabel,
                        selected.unitLabel ? `unitate ${selected.unitLabel}` : null,
                        canEdit && selected.lastChangedAt
                          ? `ultima modificare ${formatTimestamp(selected.lastChangedAt) ?? "—"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="adm-detail-head__status">
                      <StatusBadge label={costVerificationLabel(verification)} tone={costVerificationTone(verification)} />
                    </div>
                  </div>
                  {saveState === "stale" ? (
                    <div className="stack">
                      <InlineAlert tone="error" title="Costul a fost modificat între timp">
                        Costul a fost modificat între timp. Reîncarcă valoarea curentă.
                      </InlineAlert>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setReloadRequested(true);
                          setSaveState("idle");
                          setErrorMessage(null);
                          invalidateAfterCostEvidenceChange();
                        }}
                      >
                        Reîncarcă valoarea curentă
                      </Button>
                    </div>
                  ) : null}
                  {verification === "missing" && !canEdit ? (
                    <InlineAlert tone="pending" title="Cost lipsa">
                      Acest tarif nu există. Nu este zero.
                    </InlineAlert>
                  ) : null}
                  {canEdit ? (
                    <div className="adm-form-grid">
                      <TextField
                        id="cost-amount"
                        label={amountLabel}
                        value={amount}
                        hint={costRelationshipCopy(category) ?? undefined}
                        inputMode="decimal"
                        disabled={!editEnabled}
                        onChange={(value) => {
                          setAmount(value);
                          if (saveState === "success") setSaveState("idle");
                        }}
                      />
                      <TextField
                        id="cost-note"
                        label="Notă"
                        value={note}
                        disabled={!editEnabled}
                        onChange={(value) => {
                          setNote(value);
                          if (saveState === "success") setSaveState("idle");
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <dl>
                        <InfoRow label="Cost" value={costRowAmountContext(selected, canEdit) ?? "—"} />
                      </dl>
                      <InlineAlert tone="blocked" title="Modificare indisponibilă">
                        Acest rol nu poate modifica costurile de producție.
                      </InlineAlert>
                    </>
                  )}
                  {dirty ? <p className="adm-field__note adm-field__note--start">era {amountDraft(selected) || "lipsă"}</p> : null}
                  {canEdit ? (
                    <div className="adm-inline-actions">
                      {/* Saving an unchanged amount is how the owner confirms a cost: kept available. */}
                      <Button
                        disabled={!editEnabled}
                        onClick={() => {
                          void save(selected);
                        }}
                      >
                        Salvează
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => requestSelect({ key: null, amount: "", note: "", label: "lista fără selecție" })}
                      >
                        Golește selecția
                      </Button>
                    </div>
                  ) : null}
                  {pending ? <LoadingIndicator label="Se salvează costul" /> : null}
                  {saveState === "success" && !dirty ? (
                    <InlineAlert tone="success" title="Cost salvat">
                      Calculele interne noi folosesc această valoare. Prețul de vânzare introdus manual și ofertele
                      confirmate rămân neschimbate.
                    </InlineAlert>
                  ) : null}
                  {saveState === "error" && errorMessage ? (
                    <InlineAlert tone="error" title="Salvarea a eșuat">
                      {errorMessage}
                    </InlineAlert>
                  ) : null}
                </section>
              ) : (
                <EmptyState title="Alege un material, o manoperă sau o operație." />
              )
            }
          />
          <div className="operation-cost-admin-band">
            <AssemblyOperationCostPolicyPanel />
          </div>
        </>
      ) : null}
      {pendingSwitch && selected ? (
        <AdminSwitchDialog
          subject={selected.resourceLabel}
          target={pendingSwitch.label}
          busy={pending}
          error={saveState === "error" || saveState === "stale" ? errorMessage ?? "Costul a fost modificat între timp." : null}
          onSave={() => {
            void save(selected).then((ok) => {
              if (ok) {
                open(pendingSwitch);
                setSaveState("success");
                setPendingSwitch(null);
              }
            });
          }}
          onDiscard={() => {
            open(pendingSwitch);
            setPendingSwitch(null);
          }}
          onStay={() => setPendingSwitch(null)}
        />
      ) : null}
      {guard}
    </AdminLayout>
  );
}
