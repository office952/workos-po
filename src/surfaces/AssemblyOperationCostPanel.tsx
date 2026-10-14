import { useState } from "react";
import {
  decimalDraft,
  readDecimalDraft,
  type AssemblyOperationCost,
  type AssemblyOperationCostLine,
} from "../adapters/assemblyOperationCostAdapter";
import { putAssemblyOperationEstimates } from "../api/assemblyOperationCost";
import { readTransportReasons } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { formatMoney, formatQuantity } from "../presentation/format";
import "../styles/surfaces/assembly-operation-cost.css";

type Drafts = Record<string, string>;

function draftsFrom(cost: AssemblyOperationCost): Drafts {
  return Object.fromEntries(cost.estimates.map((item) => [item.processId, decimalDraft(item.personHours)]));
}

function lineBasis(line: AssemblyOperationCostLine): string | null {
  if (line.quantity !== null && line.unitLabel && line.rate !== null) {
    const basis = `${formatQuantity(line.quantity, line.unitLabel)} × ${formatMoney(line.rate, line.currency)}`;
    return line.basisLabel ? `${line.basisLabel}: ${basis}` : basis;
  }
  return line.reason;
}

function lineAmount(line: AssemblyOperationCostLine): string {
  return line.cost === null ? "Necunoscut" : formatMoney(line.cost, line.currency);
}

export function AssemblyOperationCostPanel({
  assemblyId,
  cost,
  onSaved,
}: {
  assemblyId: string;
  cost: AssemblyOperationCost;
  onSaved: (assembly: unknown) => void;
}) {
  const [source, setSource] = useState(cost);
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(cost));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (cost !== source) {
    setSource(cost);
    setDrafts(draftsFrom(cost));
  }

  async function save(): Promise<void> {
    const estimates: { processId: string; personHours: number | null }[] = [];
    for (const item of cost.estimates) {
      const parsed = readDecimalDraft(drafts[item.processId] ?? "");
      if (!parsed.ok) {
        setError(`${item.label}: introdu numărul de ore-persoană.`);
        return;
      }
      estimates.push({ processId: item.processId, personHours: parsed.value });
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await putAssemblyOperationEstimates(assemblyId, estimates);
      if (result.ok) {
        setSaved(true);
        onSaved((result.body as { assembly?: unknown } | null)?.assembly);
        return;
      }
      setError(readTransportReasons(result.body)[0] ?? "Orele estimate nu au putut fi salvate.");
    } catch {
      setError("Orele estimate nu au putut fi salvate.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SurfacePanel title="Cost intern ansamblare" label="Cost intern ansamblare">
      <div className="operation-cost">
        <p className="operation-cost__context">
          <span>{cost.sourceLabel}</span>
          <span>{cost.policyLabel}</span>
        </p>
        {cost.lines.length > 0 ? (
          <ul className="operation-cost__lines" aria-label="Operații de ansamblare">
            {cost.lines.map((line) => (
              <li
                key={line.processId}
                className="operation-cost__line"
                data-gap={line.cost === null ? "true" : "false"}
              >
                <span className="operation-cost__name">
                  <strong>{line.label}</strong>
                  <span className="operation-cost__status">{line.statusLabel}</span>
                </span>
                <span className="operation-cost__basis">{lineBasis(line)}</span>
                <span className="operation-cost__amount">{lineAmount(line)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="operation-cost__total">
          <span>{cost.completeness === "COMPLETE" ? "Cost intern estimat" : "Cost intern cunoscut (parțial)"}</span>
          <strong>{cost.knownTotal === null ? "Necunoscut" : formatMoney(cost.knownTotal, cost.currency)}</strong>
        </div>
        <div className="cluster">
          <StatusBadge
            label={cost.completenessLabel}
            tone={cost.completeness === "COMPLETE" ? "ready" : "incomplete"}
          />
          {cost.verificationLabel ? <StatusBadge label={cost.verificationLabel} tone="pending" /> : null}
        </div>
        {cost.completeness === "PARTIAL" ? (
          <InlineAlert tone="pending" title="Cost parțial">
            Operațiile fără cantitate, tarif sau politică nu sunt tratate ca zero.
          </InlineAlert>
        ) : null}
        {cost.editable && cost.estimates.length > 0 ? (
          <>
            <div className="operation-cost__estimates">
              {cost.estimates.map((item) => (
                <TextField
                  key={item.processId}
                  id={`operation-hours-${item.processId}`}
                  label={`${item.label} (ore-persoană)`}
                  value={drafts[item.processId] ?? ""}
                  inputMode="decimal"
                  disabled={pending}
                  onChange={(value) => {
                    setDrafts((current) => ({ ...current, [item.processId]: value }));
                    setSaved(false);
                  }}
                />
              ))}
            </div>
            <div className="operation-cost__actions">
              <Button variant="secondary" disabled={pending} onClick={() => void save()}>
                Salvează orele estimate
              </Button>
            </div>
          </>
        ) : null}
        {error ? (
          <InlineAlert tone="error" title="Orele nu au fost salvate">
            {error}
          </InlineAlert>
        ) : null}
        {saved && !error ? (
          <InlineAlert tone="success" title="Ore salvate">
            Estimarea este folosită la următoarea ofertă înghețată.
          </InlineAlert>
        ) : null}
        <p className="ui-note">{cost.notice}</p>
      </div>
    </SurfacePanel>
  );
}
