import { FieldFrame, fieldDescribedBy } from "../../../components/FieldFrame";

const REASON_MAX = 2000;

export function CommercialReasonField({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className="field__control"
        rows={3}
        maxLength={REASON_MAX}
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescribedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}
