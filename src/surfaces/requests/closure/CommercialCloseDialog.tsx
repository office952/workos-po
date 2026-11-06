import { useId, useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { CreationDialog } from "../../../components/CreationDialog";
import { InlineAlert } from "../../../components/InlineAlert";
import { CommercialReasonField } from "./CommercialReasonField";

export function CommercialCloseDialog({
  offerless,
  outstandingCount,
  orderedCount,
  acceptedWithoutOrderCount,
  busy,
  error,
  reason,
  onReason,
  onConfirm,
  onDismiss,
}: {
  offerless: boolean;
  outstandingCount: number;
  orderedCount: number;
  acceptedWithoutOrderCount: number;
  busy: boolean;
  error: string | null;
  reason: string;
  onReason: (value: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const id = useId();
  const [missing, setMissing] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onConfirm();
  }

  return (
    <CreationDialog
      title="Închei urmărirea comercială?"
      framed
      busy={busy}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <form className="cclose" onSubmit={submit}>
        {error ? (
          <InlineAlert tone="error" title="Încheierea nu s-a aplicat">
            {error}
          </InlineAlert>
        ) : null}
        <p>
          {offerless
            ? "Cererea nu are oferte. Urmărirea comercială se încheie cu un motiv; starea administrativă a cererii rămâne neschimbată."
            : "Se încheie doar urmărirea comercială. Nu se creează oferte noi pe această cerere."}
        </p>
        <ul className="cclose__keep">
          <li>Comenzile, lucrările și producția existente rămân neschimbate.</li>
          {orderedCount > 0 ? <li>{orderedCount === 1 ? "1 comandă existentă rămâne" : `${orderedCount} comenzi existente rămân`} valabile.</li> : null}
          {acceptedWithoutOrderCount > 0 ? (
            <li>
              {acceptedWithoutOrderCount === 1
                ? "1 ofertă acceptată fără comandă rămâne obligație de comandă."
                : `${acceptedWithoutOrderCount} oferte acceptate fără comandă rămân obligații de comandă.`}
            </li>
          ) : null}
          {outstandingCount > 0 ? (
            <li>Anularea administrativă rămâne distinctă și nu anulează comenzile.</li>
          ) : null}
        </ul>
        <CommercialReasonField
          id={`${id}-reason`}
          label="Motivul încheierii"
          value={reason}
          onChange={(value) => {
            setMissing(false);
            onReason(value);
          }}
          disabled={busy}
          required
          error={missing ? "Motivul încheierii este obligatoriu." : undefined}
          hint="Motiv separat de deciziile pe oferte."
        />
        <div className="cdos-bar">
          <div className="cdos-actions">
            <Button variant="ghost" disabled={busy} onClick={onDismiss}>
              Renunță
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              Încheie urmărirea comercială
            </Button>
          </div>
        </div>
      </form>
    </CreationDialog>
  );
}
