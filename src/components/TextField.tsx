import { FieldFrame, fieldDescribedBy } from "./FieldFrame";

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
  type?: "text" | "password";
  className?: string;
  placeholder?: string;
  labelVisuallyHidden?: boolean;
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
  type = "text",
  className,
  placeholder,
  labelVisuallyHidden = false,
  onChange,
}: TextFieldProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={className}
      labelVisuallyHidden={labelVisuallyHidden}
    >
      <input
        id={id}
        className="field__control"
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescribedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}
