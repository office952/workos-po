import { useId, useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { CreationDialog } from "../../../components/CreationDialog";
import { InlineAlert } from "../../../components/InlineAlert";
import { CommercialReasonField } from "./CommercialReasonField";

export function CommercialResumeDialog({
  offerLabel,
  busy,
  error,
  reason,
  onReason,
  onConfirm,
  onDismiss,
}: {
  offerLabel: string;
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
      title="Reiei oferta?"
      subtitle={offerLabel}
      framed
      busy={busy}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <form className="cclose" onSubmit={submit}>
        {error ? (
          <InlineAlert tone="error" title="Reluarea nu s-a aplicat">
            {error}
          </InlineAlert>
        ) : null}
        <p>
          Decizia anterioară rămâne în istoric. Oferta revine nerezolvată comercial; acceptarea sau o nouă decizie se fac după aceea.
        </p>
        <CommercialReasonField
          id={`${id}-reason`}
          label="Motivul reluării"
          value={reason}
          onChange={(value) => {
            setMissing(false);
            onReason(value);
          }}
          disabled={busy}
          required
          error={missing ? "Motivul reluării este obligatoriu." : undefined}
        />
        <div className="cdos-bar">
          <div className="cdos-actions">
            <Button variant="ghost" disabled={busy} onClick={onDismiss}>
              Renunță
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              Reia oferta
            </Button>
          </div>
        </div>
      </form>
    </CreationDialog>
  );
}
