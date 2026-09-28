import type { ReactNode } from "react";

export type FieldFrameProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Keep accessible name while hiding the visible label. */
  labelVisuallyHidden?: boolean;
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
  labelVisuallyHidden = false,
  children,
}: FieldFrameProps) {
  const classes = ["field", error ? "field--invalid" : null, className]
    .filter(Boolean)
    .join(" ");
  const labelClass = labelVisuallyHidden
    ? "field__label u-visually-hidden"
    : "field__label";

  return (
    <div className={classes}>
      <label className={labelClass} htmlFor={id}>
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
