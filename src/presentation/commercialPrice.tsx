import type { CommercialPriceTransport } from "../api/types";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SectionLabel } from "../components/SectionLabel";
import { formatMoney } from "./format";

type CommercialPricePanelProps = {
  commercial: CommercialPriceTransport | null;
  internalTotal: number | null;
  internalCurrency: string | null;
  policySourceLabel?: string | null;
  policyGuidance?: string | null;
};

export function CommercialPricePanel({
  commercial,
  internalTotal,
  internalCurrency,
  policySourceLabel,
  policyGuidance,
}: CommercialPricePanelProps) {
  const currency = commercial?.currency ?? internalCurrency ?? "EUR";
  const selling =
    commercial?.grossPrice ??
    commercial?.netPrice ??
    null;

  return (
    <div className="stack" data-testid="commercial-price">
      {policySourceLabel ? (
        <p data-testid="commercial-policy-source">{policySourceLabel}</p>
      ) : null}
      {policyGuidance ? (
        <InlineAlert tone="pending" title="Politică de sistem">
          {policyGuidance}
        </InlineAlert>
      ) : null}
      {commercial?.unavailableReasons.length ? (
        <InlineAlert tone="blocked" title="Prețul clientului nu este disponibil">
          {commercial.unavailableReasons.join(" ")}
        </InlineAlert>
      ) : null}
      {selling !== null && commercial?.unavailableReasons.length === 0 ? (
        <div className="price-hero">
          {commercial?.netPrice !== null && commercial?.netPrice !== undefined ? (
            <>
              <SectionLabel>Preț net client</SectionLabel>
              <p className="price-hero__value">
                {formatMoney(commercial.netPrice, currency)}
              </p>
            </>
          ) : null}
          {commercial?.grossPrice !== null && commercial?.grossPrice !== undefined ? (
            <p className="price-hero__meta">
              Preț client cu TVA {formatMoney(commercial.grossPrice, currency)}
            </p>
          ) : null}
        </div>
      ) : null}
      {commercial && selling === null && commercial.unavailableReasons.length === 0 ? (
        <p>Prețul clientului nu a fost returnat pentru această confirmare.</p>
      ) : null}
      {internalTotal !== null ? (
        <dl>
          <InfoRow
            label="Cost intern"
            value={formatMoney(internalTotal, internalCurrency ?? currency)}
          />
        </dl>
      ) : null}
    </div>
  );
}
