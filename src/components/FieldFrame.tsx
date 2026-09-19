import type { ReactNode } from "react";

export type FieldFrameProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

export function fieldDescribedBy(
  id: string,
  hint?: string,
  error?: string,
): string | undefined {
  const parts = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(
    (value): value is string => value !== null,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function FieldFrame({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldFrameProps) {
  const classes = ["field", error ? "field--invalid" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
