import { useState } from "react";
import {
  presentAssemblyOperationCostAdmin,
  readDecimalDraft,
  type AssemblyOperationCostAdmin,
  type OperationCostRate,
} from "../adapters/assemblyOperationCostAdapter";
import {
  fetchAssemblyOperationCostAdmin,
  postAssemblyOperationCostPolicy,
  postInitialCostEvidence,
} from "../api/assemblyOperationCost";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { patchCostEvidence } from "../api/resources";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { SelectField } from "../components/SelectField";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateAfterCostEvidenceChange } from "../data/invalidation";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { formatMoney, formatTimestamp } from "../presentation/format";
import type { PresentationTone } from "../presentation/foundationProof";
import "../styles/surfaces/assembly-operation-cost.css";

const WORKSHOP_LABOR_RESOURCE_ID = "LAB-WORKSHOP-LABOR";

type Notice = { tone: "success" | "error"; title: string; text: string } | null;

async function loadAssemblyOperationCostAdmin(): Promise<AssemblyOperationCostAdmin> {
  const presented = presentAssemblyOperationCostAdmin(await fetchAssemblyOperationCostAdmin());
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

function rateTone(rate: OperationCostRate): PresentationTone {
  switch (rate.status) {
    case "CONFIRMED":
      return "ready";
    case "UNCONFIRMED":
      return "pending";
    case "MISSING":
      return "incomplete";
    default: {
      const _exhaustive: never = rate.status;
      return _exhaustive;
    }
  }
}

function rateValue(rate: OperationCostRate): string {
  if (rate.amount !== null && rate.currency) {
    return formatMoney(rate.amount, rate.currency);
  }
  return rate.status === "MISSING" ? "Nu există tarif" : "Vizibil doar proprietarului";
}

export function AssemblyOperationCostPolicyPanel() {
  const loaded = useResource(resourceKeys.assemblyOperationCostAdmin(), loadAssemblyOperationCostAdmin);
  const admin = loaded.data ?? null;
  const [source, setSource] = useState<AssemblyOperationCostAdmin | null>(null);
  const [inspection, setInspection] = useState("");
  const [packaging, setPackaging] = useState("");
  const [laborAmount, setLaborAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  if (admin && admin !== source) {
    setSource(admin);
    setInspection(admin.finalInspectionMode);
    setPackaging(admin.finalPackagingMode);
    const labor = admin.rates.find((rate) => rate.resourceId === WORKSHOP_LABOR_RESOURCE_ID);
    setLaborAmount(labor?.amount === null || labor?.amount === undefined ? "" : String(labor.amount).replace(".", ","));
  }

  function accept(body: unknown): void {
    const presented = presentAssemblyOperationCostAdmin(body);
    if (presented) {
      writeResource(resourceKeys.assemblyOperationCostAdmin(), presented);
    }
  }

  async function savePolicy(current: AssemblyOperationCostAdmin): Promise<void> {
    setPending(true);
    setNotice(null);
    setStale(false);
    try {
      const result = await postAssemblyOperationCostPolicy({
        expectedVersion: current.version,
        finalInspectionMode: inspection,
        finalPackagingMode: packaging,
      });
      if (result.ok) {
        accept(result.body);
        setNotice({ tone: "success", title: "Politică salvată", text: current.futureOnlyNotice });
        return;
      }
      if (readTransportErrorCode(result.body) === "stale_policy_version") {
        setStale(true);
        return;
      }
      setNotice({ tone: "error", title: "Politica nu a fost salvată", text: "Verifică valorile și încearcă din nou." });
    } catch {
      setNotice({ tone: "error", title: "Politica nu a fost salvată", text: "Încearcă din nou." });
    } finally {
      setPending(false);
    }
  }

  async function saveLaborRate(labor: OperationCostRate): Promise<void> {
    const parsed = readDecimalDraft(laborAmount);
    if (!parsed.ok || parsed.value === null) {
      setNotice({ tone: "error", title: "Tariful nu a fost salvat", text: "Tariful trebuie să fie un număr." });
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = labor.evidenceRowId
        ? await patchCostEvidence(labor.evidenceRowId, { amount: parsed.value })
        : await postInitialCostEvidence({
            resourceId: WORKSHOP_LABOR_RESOURCE_ID,
            amount: parsed.value,
            note: "Tarif manoperă atelier",
          });
      if (result.ok) {
        invalidateAfterCostEvidenceChange();
        setNotice({ tone: "success", title: "Tarif salvat", text: "Tariful se folosește doar la ofertele înghețate de acum înainte." });
        return;
      }
      setNotice({
        tone: "error",
        title: "Tariful nu a fost salvat",
        text: readTransportReasons(result.body)[0] ?? "Tariful a fost modificat între timp sau valoarea nu este validă. Reîncarcă pagina.",
      });
    } catch {
      setNotice({ tone: "error", title: "Tariful nu a fost salvat", text: "Încearcă din nou." });
    } finally {
      setPending(false);
    }
  }

  if (!admin) {
    return (
      <SurfacePanel title="Cost intern ansamblare" label="Politică ansamblare" busy={loaded.status !== "error"}>
        {loaded.status === "error" ? (
          <InlineAlert tone="error" title="Politica nu este disponibilă">
            Politica de cost pentru ansamblare nu a putut fi citită.
          </InlineAlert>
        ) : (
          <LoadingFloor variant="facts" label="Se citește politica de ansamblare" />
        )}
      </SurfacePanel>
    );
  }

  const labor = admin.rates.find((rate) => rate.resourceId === WORKSHOP_LABOR_RESOURCE_ID) ?? null;
  const policyChanged = inspection !== admin.finalInspectionMode || packaging !== admin.finalPackagingMode;

  return (
    <SurfacePanel title="Cost intern ansamblare" label="Politică ansamblare">
      <div className="operation-cost">
        <dl>
          <InfoRow
            label="Politica organizației"
            value={admin.version === null ? "Neconfigurată" : `Versiunea ${admin.version}`}
          />
          {admin.updatedAt ? <InfoRow label="Ultima modificare" value={formatTimestamp(admin.updatedAt) ?? "—"} /> : null}
        </dl>
        <div className="operation-cost__policy-fields">
          <SelectField
            id="assembly-final-inspection"
            label="Verificare finală"
            value={inspection}
            options={admin.inspectionOptions}
            disabled={!admin.canEdit || pending}
            onChange={setInspection}
          />
          <SelectField
            id="assembly-final-packaging"
            label="Ambalare finală"
            value={packaging}
            options={admin.packagingOptions}
            disabled={!admin.canEdit || pending}
            onChange={setPackaging}
          />
        </div>
        {admin.canEdit ? (
          <div className="operation-cost__actions">
            <Button disabled={pending || !policyChanged} onClick={() => void savePolicy(admin)}>
              Salvează politica
            </Button>
          </div>
        ) : null}
        {stale ? (
          <div className="stack">
            <InlineAlert tone="error" title="Politica a fost modificată între timp">
              Reîncarcă politica curentă și reverifică valorile.
            </InlineAlert>
            <Button
              variant="secondary"
              onClick={() => {
                setStale(false);
                invalidateResources(resourceKeys.assemblyOperationCostAdmin());
              }}
            >
              Reîncarcă politica curentă
            </Button>
          </div>
        ) : null}
        {admin.rates.map((rate) => (
          <div key={rate.resourceId} className="operation-cost__rate">
            <div className="cluster">
              <strong>{rate.label}</strong>
              <StatusBadge label={rate.statusLabel} tone={rateTone(rate)} />
            </div>
            <dl>
              <InfoRow label="Tarif curent" value={rateValue(rate)} />
            </dl>
            {admin.canEdit && labor && rate.resourceId === WORKSHOP_LABOR_RESOURCE_ID ? (
              <>
                <TextField
                  id="workshop-labor-rate"
                  label="Tarif manoperă atelier (EUR / oră-persoană)"
                  value={laborAmount}
                  inputMode="decimal"
                  disabled={pending}
                  onChange={setLaborAmount}
                />
                <div className="operation-cost__actions">
                  <Button variant="secondary" disabled={pending} onClick={() => void saveLaborRate(labor)}>
                    {labor.evidenceRowId ? "Înlocuiește tariful" : "Creează tariful inițial"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ))}
        {notice ? (
          <InlineAlert tone={notice.tone} title={notice.title}>
            {notice.text}
          </InlineAlert>
        ) : null}
        {admin.history.length > 0 ? (
          <>
            <p className="section-label">Istoric politică</p>
            <ul className="operation-cost__history">
              {admin.history.map((entry) => (
                <li key={entry.version}>
                  Versiunea {entry.version} · {formatTimestamp(entry.updatedAt) ?? "—"} · Verificare:{" "}
                  {entry.finalInspectionLabel} · Ambalare: {entry.finalPackagingLabel}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="ui-note">{admin.futureOnlyNotice}</p>
      </div>
    </SurfacePanel>
  );
}
