import { useId, useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { CreationDialog } from "../../../components/CreationDialog";
import { InlineAlert } from "../../../components/InlineAlert";
import { CommercialReasonField } from "./CommercialReasonField";

export function CommercialReopenDialog({
  busy,
  error,
  reason,
  onReason,
  onConfirm,
  onDismiss,
}: {
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
      title="Redeschizi urmărirea comercială?"
      framed
      busy={busy}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <form className="cclose" onSubmit={submit}>
        {error ? (
          <InlineAlert tone="error" title="Redeschiderea nu s-a aplicat">
            {error}
          </InlineAlert>
        ) : null}
        <p>
          Cererea revine la urmărire comercială deschisă. Ofertele oprite nu se reiau automat; fiecare reluare se face separat, cu motiv.
        </p>
        <CommercialReasonField
          id={`${id}-reason`}
          label="Motivul redeschiderii"
          value={reason}
          onChange={(value) => {
            setMissing(false);
            onReason(value);
          }}
          disabled={busy}
          required
          error={missing ? "Motivul redeschiderii este obligatoriu." : undefined}
        />
        <div className="cdos-bar">
          <div className="cdos-actions">
            <Button variant="ghost" disabled={busy} onClick={onDismiss}>
              Renunță
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              Redeschide urmărirea
            </Button>
          </div>
        </div>
      </form>
    </CreationDialog>
  );
}
