import { FieldFrame, fieldDescribedBy } from "./FieldFrame";

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function SelectField({
  id,
  label,
  value,
  hint,
  error,
  disabled,
  className,
  options,
  onChange,
}: SelectFieldProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        className="field__control"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescribedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      >
        {value === "" ? (
          <option value="" disabled>
            Selectează
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}
