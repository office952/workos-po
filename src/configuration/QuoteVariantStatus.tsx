import { useEffect, useRef, useState } from "react";
import { decidePriceApproval } from "../api/commercialFinancial";
import { readTransportReasons } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { formatMoney, formatTimestamp } from "../presentation/format";
import type { QuoteVariantWork } from "./useQuoteVariant";

/**
 * Commercial Continuity V2 · what the Configurator shows about the saved quote variant: whether
 * it is saved, the choice when someone else saved first, and the Owner's decision on a price
 * request. State and actions come from the server through `useQuoteVariant`.
 */

function clock(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

/** One line: who the variant is and whether what is on screen is saved. */
export function QuoteVariantSaveLine({
  work,
  pendingChanges,
  onRetry,
}: {
  work: QuoteVariantWork;
  pendingChanges: boolean;
  onRetry: () => void;
}) {
  const { variant, saveState, savedAt, failure } = work;
  if (!variant) return null;
  const label =
    saveState === "saving"
      ? "Se salvează…"
      : saveState === "failed"
        ? "Nesalvat"
        : saveState === "conflict"
          ? "Nesalvat · altcineva a modificat varianta"
          : pendingChanges
            ? "Se salvează…"
            : savedAt
              ? `Salvat la ${clock(savedAt)}`
              : "Salvat";
  return (
    <div className="variant-save-line" data-testid="variant-save-line" data-save-state={saveState}>
      <p className="variant-save-line__identity">
        <strong>Varianta {variant.indexLabel}</strong>
        {variant.alternativeOfIndexLabel ? ` · alternativă la ${variant.alternativeOfIndexLabel}` : ""}
        <span className="variant-save-line__state"> · {variant.stateLabel}</span>
      </p>
      <p
        className={`variant-save-line__save${saveState === "failed" || saveState === "conflict" ? " variant-save-line__save--attention" : ""}`}
        role={saveState === "failed" || saveState === "conflict" ? "alert" : "status"}
      >
        {saveState === "failed" || saveState === "conflict" ? <span aria-hidden="true">⚠ </span> : null}
        {label}
        {saveState === "failed" ? (
          <>
            {failure ? ` · ${failure} ` : " "}
            <Button variant="secondary" onClick={onRetry}>
              Reîncearcă
            </Button>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Someone else saved first: the person chooses, nothing is merged or overwritten silently. */
export function QuoteVariantConflictBanner({
  work,
  busy,
  onSeeTheirs,
  onKeepMine,
}: {
  work: QuoteVariantWork;
  busy: boolean;
  onSeeTheirs: () => void;
  onKeepMine: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const conflict = work.conflict;
  useEffect(() => {
    if (conflict) ref.current?.focus();
  }, [conflict]);
  if (!conflict) return null;
  return (
    <div ref={ref} tabIndex={-1} className="variant-conflict" data-testid="variant-conflict">
      <InlineAlert tone="blocked" title={`${conflict.updatedByLabel} a modificat această variantă${conflict.updatedAt ? ` la ${clock(conflict.updatedAt)}` : ""}`}>
        <p>Valorile tale nu au fost salvate și sunt încă în pagină.</p>
        <div className="variant-conflict__actions">
          <Button variant="secondary" disabled={busy} onClick={onSeeTheirs}>
            Vezi versiunea salvată
          </Button>
          <Button disabled={busy} onClick={onKeepMine}>
            Păstrează-le pe ale mele ca alternativă
          </Button>
        </div>
      </InlineAlert>
    </div>
  );
}

/** The Owner decides the price request inside the variant, with the configuration one step away. */
export function QuoteVariantOwnerDecision({
  work,
  onDecided,
  onSeeValues,
}: {
  work: QuoteVariantWork;
  onDecided: () => void;
  onSeeValues: () => void;
}) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variant = work.variant;
  const approval = variant?.approval ?? null;
  if (!variant || variant.action !== "DECIDE_APPROVAL" || !approval?.approvalId) return null;
  const approvalId = approval.approvalId;

  async function decide(decision: "APPROVED" | "REJECTED"): Promise<void> {
    setPending(true);
    setError(null);
    const result = await decidePriceApproval(approvalId, decision, decision === "REJECTED" ? reason.trim() : null);
    setPending(false);
    if (!result.ok) {
      setError(readTransportReasons(result.body).join(" ") || "Decizia nu a putut fi salvată.");
      return;
    }
    setRejecting(false);
    setReason("");
    onDecided();
  }

  return (
    <section className="variant-decision" aria-label="Cerere de aprobare a prețului" data-testid="variant-owner-decision">
      <h3>Cerere de aprobare</h3>
      <p>
        {approval.requestedByLabel ?? "Comercialul"}
        {approval.requestedAt ? ` · ${formatTimestamp(approval.requestedAt)}` : ""}
      </p>
      {approval.requestNote ? <p className="variant-decision__note">„{approval.requestNote}”</p> : null}
      {/* What is being approved, as the server evaluated it: never a figure computed here. */}
      {variant.netPrice !== null ? (
        <p data-testid="variant-decision-price">
          Produs, net: <strong>{formatMoney(variant.netPrice, variant.currency ?? "EUR")}</strong>
          {variant.installationNetPrice !== null
            ? ` · Montaj, net: ${formatMoney(variant.installationNetPrice, variant.currency ?? "EUR")}`
            : ""}
          {variant.grossPrice !== null ? ` · Total cu TVA: ${formatMoney(variant.grossPrice, variant.currency ?? "EUR")}` : ""}
        </p>
      ) : null}
      <p>
        Configurația: confirmată{variant.confirmedByLabel ? ` de ${variant.confirmedByLabel}` : ""}.{" "}
        <button type="button" className="text-link" onClick={onSeeValues}>
          Vezi valorile
        </button>
      </p>
      {rejecting ? (
        <div className="variant-decision__reject">
          <label htmlFor="variant-reject-reason">Motivul respingerii (obligatoriu)</label>
          <textarea
            id="variant-reject-reason"
            rows={2}
            maxLength={500}
            value={reason}
            disabled={pending}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="variant-conflict__actions">
            <Button variant="secondary" disabled={pending} onClick={() => setRejecting(false)}>
              Renunță
            </Button>
            <Button variant="secondary" disabled={pending || reason.trim().length === 0} onClick={() => void decide("REJECTED")}>
              Respinge
            </Button>
          </div>
        </div>
      ) : (
        <div className="variant-conflict__actions">
          <Button disabled={pending} onClick={() => void decide("APPROVED")}>
            Aprobă această variantă
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
            Respinge…
          </Button>
        </div>
      )}
      {error ? (
        <InlineAlert tone="error" title="Decizia nu a fost salvată">
          {error}
        </InlineAlert>
      ) : null}
    </section>
  );
}
