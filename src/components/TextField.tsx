import { FieldFrame, fieldDescribedBy } from "./FieldFrame";

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  inputMode?: "text" | "decimal";
  className?: string;
  onChange: (value: string) => void;
};

export function TextField({
  id,
  label,
  value,
  hint,
  error,
  disabled,
  inputMode = "text",
  className,
  onChange,
}: TextFieldProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className="field__control"
        value={value}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescribedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}
