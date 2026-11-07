import { useId, useRef, useState, type KeyboardEvent } from "react";
import { type RegistryFilters, type SignalTile } from "./quoteRegistryModel";

type Props = {
  tiles: readonly SignalTile[];
  ready: boolean;
  filters: RegistryFilters;
  onChange: (next: RegistryFilters) => void;
};

/**
 * The commercial filters of Oferte beside the search, then "Ce înseamnă?" (WorkOS-N 1226:19654):
 * one segment per filter with its count, and one sentence per filter on demand.
 */
export function QuotesSignalBoard({ tiles, ready, filters, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [explained, setExplained] = useState(false);
  const explanationId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>(".offers-filter__option") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div className="offers-filter-wrap">
      <div ref={rootRef} className="offers-filter" role="group" aria-label="Filtre registru oferte" onKeyDown={onKeyDown}>
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className="offers-filter__option"
            data-tone={tile.tone}
            aria-pressed={tile.pressed}
            title={tile.scope ? `${tile.label}: ${tile.scope}` : undefined}
            onClick={() => onChange(tile.apply(filters))}
          >
            <span className="offers-filter__label">{tile.label}</span>
            <span className="offers-filter__count">{ready ? tile.count : "—"}</span>
          </button>
        ))}
      </div>
      <div className="offers-explain" onKeyDown={(event) => {
        if (event.key === "Escape" && explained) {
          event.stopPropagation();
          setExplained(false);
        }
      }}>
        <button
          type="button"
          className="text-link offers-explain__button"
          aria-expanded={explained}
          aria-controls={explanationId}
          onClick={() => setExplained((value) => !value)}
        >
          <span aria-hidden="true">ⓘ </span>Ce înseamnă?
        </button>
        {explained ? (
          <dl id={explanationId} className="offers-explain__panel">
            {tiles.map((tile) => (
              <div key={tile.id}>
                <dt>{tile.label}</dt>
                <dd>{tile.scope}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
