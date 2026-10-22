import type { ReactNode, Ref } from "react";
import type { DeskLayout } from "./useDeskLayout";

export type Density = "comfortable" | "compact";

export function DeskSearch({
  id,
  placeholder,
  value,
  layout,
  inputRef,
  onChange,
}: {
  id: string;
  placeholder: string;
  value: string;
  layout: DeskLayout;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rdesk-search">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </svg>
      <label className="u-visually-hidden" htmlFor={id}>Caută</label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="rdesk-search__clear" aria-label="Golește căutarea" onClick={() => onChange("")}>
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" /></svg>
        </button>
      ) : layout === "docked" ? (
        <kbd className="rdesk-search__key" aria-hidden="true">/</kbd>
      ) : null}
    </div>
  );
}

/** Segmented options on desktop, chips on tablet and phone. */
export function DeskOptions<T extends string>({
  label,
  layout,
  options,
  value,
  onChange,
}: {
  label: string;
  layout: DeskLayout;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={layout === "docked" ? "rdesk-segment" : "rdesk-chips"} role="group" aria-label={label}>
      <span className="rdesk-segment__label" aria-hidden="true">{label}</span>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DeskDensity({ value, onChange }: { value: Density; onChange: (value: Density) => void }) {
  return (
    <div className="rdesk-density" role="group" aria-label="Densitate rânduri">
      <button type="button" aria-pressed={value === "comfortable"} onClick={() => onChange("comfortable")}>Confort</button>
      <button type="button" aria-pressed={value === "compact"} onClick={() => onChange("compact")}>Compact</button>
    </div>
  );
}

export function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>;
}

export function DeskCaption({
  title,
  count,
  showReset,
  onReset,
  keys,
  children,
}: {
  title: string;
  count: string;
  showReset: boolean;
  onReset: () => void;
  keys: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rdesk-caption">
      <h2>{title}</h2>
      <span className="rdesk-caption__count" role="status">{count}</span>
      {showReset ? (
        <button type="button" className="rdesk-reset" onClick={onReset}>
          Resetează filtrele <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {children}
      {keys ? <span className="rdesk-caption__keys" aria-hidden="true">↑ ↓ selectează · Enter deschide · / caută</span> : null}
    </div>
  );
}

export function DeskSkeleton() {
  return (
    <div className="rdesk-skeleton" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
    </div>
  );
}
