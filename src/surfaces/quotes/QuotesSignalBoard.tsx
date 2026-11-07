import { useId, useRef, useState, type KeyboardEvent } from "react";
import { formatCount, type RegistryFilters, type SignalTile } from "./quoteRegistryModel";

type Props = {
  tiles: readonly SignalTile[];
  ready: boolean;
  filters: RegistryFilters;
  onChange: (next: RegistryFilters) => void;
};

/** Counters that filter, then "Ce înseamnă?" (WorkOS-N 1226:19654): one sentence per filter. */
export function QuotesSignalBoard({ tiles, ready, filters, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [explained, setExplained] = useState(false);
  const explanationId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>(".offers-board__tile") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div className="offers-board-wrap">
      <div ref={rootRef} className="offers-board" role="group" aria-label="Filtre registru oferte" onKeyDown={onKeyDown}>
        {tiles.map((tile, index) => (
          <button
            key={tile.id}
            type="button"
            className="offers-board__tile"
            data-tone={tile.tone}
            data-lit={tile.pressed || undefined}
            data-group-start={index === 1 || undefined}
            aria-pressed={tile.pressed}
            title={tile.scope ? `${tile.label}: ${tile.scope}` : undefined}
            onClick={() => onChange(tile.apply(filters))}
          >
            <span className="offers-board__lamp" aria-hidden="true" />
            <span className="offers-board__count">{ready ? formatCount(tile.count) : "—"}</span>
            <span className="offers-board__label">{tile.label}</span>
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
