import type { CommercialPriceTransport } from "../api/types";
import { InlineAlert } from "../components/InlineAlert";
import { SectionLabel } from "../components/SectionLabel";
import { StatusBadge } from "../components/StatusBadge";
import { formatMoney } from "./format";

type CommercialPricePanelProps = {
  commercial: CommercialPriceTransport | null;
  internalTotal: number | null;
  internalCurrency: string | null;
  internalCompleteness?: string | null;
  policySourceLabel?: string | null;
  policyGuidance?: string | null;
  showCustomerPrice?: boolean;
  showInternalCost?: boolean;
};

function costCompletenessLabel(value: string | null | undefined): {
  label: string;
  tone: "ready" | "pending" | "incomplete";
  explanation: string | null;
} {
  if (value === "COMPLETE") {
    return { label: "Complet", tone: "ready", explanation: null };
  }
  return {
    label: "Incomplet",
    tone: "incomplete",
    explanation: null,
  };
}

function knownInternalCost(
  commercialCost: number | null | undefined,
  commercialCompleteness: string | null | undefined,
  internalTotal: number | null,
  internalCompleteness: string | null | undefined,
): number | null {
  if (
    typeof commercialCost === "number" &&
    (commercialCost > 0 || commercialCompleteness === "COMPLETE")
  ) {
    return commercialCost;
  }
  if (
    typeof internalTotal === "number" &&
    (internalTotal > 0 || internalCompleteness === "COMPLETE")
  ) {
    return internalTotal;
  }
  return null;
}

export function CommercialPricePanel({
  commercial,
  internalTotal,
  internalCurrency,
  internalCompleteness,
  policySourceLabel,
  policyGuidance,
  showCustomerPrice = true,
  showInternalCost = true,
}: CommercialPricePanelProps) {
  const currency = commercial?.currency ?? internalCurrency ?? "EUR";
  const completenessValue =
    commercial?.internalCostCompleteness ?? internalCompleteness ?? null;
  const costStatus = costCompletenessLabel(completenessValue);
  const knownCost = knownInternalCost(
    commercial?.internalCost,
    commercial?.internalCostCompleteness,
    internalTotal,
    internalCompleteness,
  );
  const showKnownCostBlock =
    showInternalCost && (knownCost !== null || completenessValue === "PARTIAL");
  const customerReady =
    showCustomerPrice &&
    commercial?.completeness === "COMPLETE" &&
    commercial.unavailableReasons.length === 0 &&
    (commercial.netPrice !== null || commercial.grossPrice !== null);

  return (
    <div className="stack" data-testid="commercial-price">
      {policySourceLabel ? (
        <p data-testid="commercial-policy-source">{policySourceLabel}</p>
      ) : null}
      {policyGuidance ? (
        <InlineAlert tone="pending" title="Valori de sistem">
          {policyGuidance}
        </InlineAlert>
      ) : null}
      {showKnownCostBlock ? (
        <div data-testid="internal-cost">
          <SectionLabel>Cost intern cunoscut</SectionLabel>
          {knownCost !== null ? (
            <p className="price-hero__value">
              {formatMoney(knownCost, commercial?.internalCostCurrency ?? currency)}
            </p>
          ) : null}
          <p>
            <StatusBadge label={costStatus.label} tone={costStatus.tone} />
          </p>
          {costStatus.explanation ? <p>{costStatus.explanation}</p> : null}
        </div>
      ) : null}
      {customerReady ? (
        <div className="price-hero" data-testid="customer-price">
          {commercial.netPrice !== null && commercial.netPrice !== undefined ? (
            <>
              <SectionLabel>Preț net client</SectionLabel>
              <p className="price-hero__value">
                {formatMoney(commercial.netPrice, currency)}
              </p>
            </>
          ) : null}
          {commercial.vatPercent !== null ? (
            <p className="price-hero__meta">
              TVA {commercial.vatPercent}%
              {commercial.vatAmount !== null
                ? ` · ${formatMoney(commercial.vatAmount, currency)}`
                : ""}
            </p>
          ) : null}
          {commercial.grossPrice !== null && commercial.grossPrice !== undefined ? (
            <p className="price-hero__meta">
              Preț total cu TVA {formatMoney(commercial.grossPrice, currency)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
