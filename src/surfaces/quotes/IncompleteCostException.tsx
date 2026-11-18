import { useId } from "react";
import { InlineAlert } from "../../components/InlineAlert";

/**
 * AUD-PRICING-002 · the Owner's explicit acceptance of a quote whose internal cost is not complete.
 * One block for the product quote and the assembly quote. Whether it is required comes from the
 * server; the reason and the confirmation are sent with the acceptance and validated there.
 */
export function IncompleteCostException({
  reason,
  acknowledged,
  pending,
  onReasonChange,
  onAcknowledgedChange,
}: {
  reason: string;
  acknowledged: boolean;
  pending: boolean;
  onReasonChange: (value: string) => void;
  onAcknowledgedChange: (value: boolean) => void;
}) {
  const reasonId = useId();
  return (
    <div className="offers-confirm__exception" data-testid="incomplete-cost-exception">
      <InlineAlert tone="pending" title="Costul intern al ofertei nu este complet">
        Acceptarea este posibilă doar ca excepție confirmată de tine. Costul rămâne marcat incomplet
        în comandă și în analiza lucrării; oferta înghețată nu se modifică.
      </InlineAlert>
      <label className="offers-confirm__field" htmlFor={reasonId}>
        Motivul acceptării cu cost incomplet
        <textarea
          id={reasonId}
          value={reason}
          maxLength={500}
          rows={2}
          disabled={pending}
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </label>
      <label className="offers-confirm__check">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={pending}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
        />
        Confirm acceptarea cu cost intern incomplet
      </label>
    </div>
  );
}
