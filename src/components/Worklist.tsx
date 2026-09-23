import type { ReactNode } from "react";

export type WorklistVariant = "registry" | "operations" | "commercial" | "operational" | "compact";

type WorklistProps = {
  label: string;
  variant?: WorklistVariant;
  columns?: readonly string[];
  busy?: boolean;
  children: ReactNode;
};

export function Worklist({
  label,
  variant = "commercial",
  columns,
  busy = false,
  children,
}: WorklistProps) {
  return (
    <div
      className={`worklist worklist--${variant}`}
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {columns && columns.length > 0 ? (
        <div className="worklist__head" aria-hidden="true">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      ) : null}
      <div className="worklist__body">{children}</div>
    </div>
  );
}
