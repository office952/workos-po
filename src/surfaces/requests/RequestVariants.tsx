import { useState } from "react";
import { presentQuoteVariant, type QuoteVariantView } from "../../adapters/quoteVariantAdapter";
import { readTransportReasons } from "../../api/http";
import { createRequestVariant, setRequestVariantLifecycle } from "../../api/quoteVariants";
import { Button } from "../../components/Button";
import { InlineAlert } from "../../components/InlineAlert";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { formatMoney } from "../../presentation/format";
import { configuratorVariantHref, quoteHref } from "../../routing/appRoute";
import { navigate } from "../../routing/navigate";
import { requestVariantsKey } from "./requestVariantsData";
import "../../styles/surfaces/quote-variant.css";

/**
 * Commercial Continuity V2 · the quote variants of a request that have no issued quote yet.
 * Issued variants are the offers of the commercial register above; nothing is listed twice.
 * Each row shows the state and the single action the server gives the signed-in person.
 */

export function variantHref(variant: QuoteVariantView, customerId: string): string {
  if (variant.quoteSnapshotId) return quoteHref(variant.productCode, variant.quoteSnapshotId);
  const context = { customerId, requestId: variant.requestId, productCode: variant.productCode };
  switch (variant.action) {
    case "CONTINUE":
    case "RESUME":
      return configuratorVariantHref(context, variant.variantId);
    case "VERIFY":
    case "SET_PRICE":
      // Whoever continues a confirmed variant sees the values first, then goes on to the price.
      return configuratorVariantHref(context, variant.variantId, "verificare");
    default:
      return configuratorVariantHref(context, variant.variantId, "pret");
  }
}

export function RequestVariants({
  requestId,
  customerId,
  canWork,
  variants,
}: {
  requestId: string;
  customerId: string;
  canWork: boolean;
  variants: readonly QuoteVariantView[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = variants.filter((variant) => variant.quoteSnapshotId === null);
  if (open.length === 0) return null;

  function refresh(): void {
    invalidateResources(requestVariantsKey(requestId));
    invalidateResources(resourceKeys.request(requestId));
  }

  async function addAlternative(variant: QuoteVariantView): Promise<void> {
    setPending(variant.variantId);
    setError(null);
    const result = await createRequestVariant(requestId, { copyFromVariantId: variant.variantId });
    setPending(null);
    const created = result.ok ? presentQuoteVariant((result.body as { variant?: unknown } | null)?.variant) : null;
    if (!created) {
      setError(readTransportReasons(result.body)[0] ?? "Alternativa nu a putut fi creată.");
      return;
    }
    refresh();
    navigate(configuratorVariantHref({ customerId, requestId, productCode: created.productCode }, created.variantId));
  }

  async function setLifecycle(variant: QuoteVariantView, lifecycle: "ACTIVE" | "WITHDRAWN"): Promise<void> {
    setPending(variant.variantId);
    setError(null);
    const result = await setRequestVariantLifecycle(requestId, variant.variantId, {
      expectedVersion: variant.version,
      lifecycle,
    });
    setPending(null);
    if (!result.ok) setError(readTransportReasons(result.body)[0] ?? "Varianta nu a putut fi actualizată.");
    refresh();
  }

  return (
    <section aria-labelledby="request-variants-title" data-testid="request-variants">
      <h2 id="request-variants-title" className="branch-detail__kicker">
        Variante de ofertă în lucru · {open.length}
      </h2>
      <ul className="request-variants">
        {open.map((variant) => {
          const withdrawn = variant.lifecycle === "WITHDRAWN";
          const busy = pending === variant.variantId;
          return (
            <li
              key={variant.variantId}
              data-variant-state={variant.state}
              className={`request-variants__row${variant.alternativeOfIndexLabel ? " request-variants__row--alternative" : ""}${withdrawn ? " request-variants__row--withdrawn" : ""}`}
            >
              <span className="request-variants__index">{variant.indexLabel}</span>
              <div className="request-variants__body">
                <p>
                  <strong>{variant.inscription ?? variant.productLabel}</strong>
                  {variant.alternativeOfIndexLabel ? ` · alternativă la ${variant.alternativeOfIndexLabel}` : ""}
                </p>
                {variant.inscription ? <p className="request-variants__meta">{variant.productLabel}</p> : null}
                <p className="request-variants__meta">
                  {variant.stateLabel}
                  {variant.confirmedByLabel ? ` · confirmată de ${variant.confirmedByLabel}` : ""}
                  {variant.state === "AWAITING_PRICE" && !variant.canSetPrice ? " · îl stabilește Proprietarul" : ""}
                  {variant.priceVisible && variant.grossPrice !== null && variant.currency
                    ? ` · ${formatMoney(variant.grossPrice, variant.currency)} cu TVA`
                    : ""}
                </p>
                {variant.approval?.staleReason ? <p className="request-variants__meta">{variant.approval.staleReason}</p> : null}
                {variant.state === "REJECTED" && variant.approval?.decisionReason ? (
                  <p className="request-variants__meta">Motiv: {variant.approval.decisionReason}</p>
                ) : null}
                {variant.notes ? <p className="request-variants__meta">Observații: {variant.notes}</p> : null}
              </div>
              <div className="request-variants__actions">
                {withdrawn ? (
                  canWork ? (
                    <Button variant="secondary" disabled={busy} onClick={() => void setLifecycle(variant, "ACTIVE")}>
                      Reia
                    </Button>
                  ) : null
                ) : (
                  <>
                    <a className={variant.needsAction ? "pilot-create" : "text-link"} href={variantHref(variant, customerId)}>
                      {variant.actionLabel}
                    </a>
                    {canWork ? (
                      <>
                        <Button variant="secondary" disabled={busy} onClick={() => void addAlternative(variant)}>
                          Adaugă o alternativă
                        </Button>
                        <Button variant="secondary" disabled={busy} onClick={() => void setLifecycle(variant, "WITHDRAWN")}>
                          Retrage
                        </Button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <InlineAlert tone="error" title="Acțiunea nu a reușit">
          {error}
        </InlineAlert>
      ) : null}
    </section>
  );
}
