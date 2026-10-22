import { useRef, type KeyboardEvent } from "react";
import { formatCount, type RegistryFilters, type SignalTile } from "./quoteRegistryModel";

type Props = {
  tiles: readonly SignalTile[];
  ready: boolean;
  filters: RegistryFilters;
  onChange: (next: RegistryFilters) => void;
};

/** Counters that filter: one lamp per tile, lit when it is the active filter. */
export function QuotesSignalBoard({ tiles, ready, filters, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div ref={rootRef} className="offers-board" role="group" aria-label="Filtre registru oferte" onKeyDown={onKeyDown}>
      {tiles.map((tile, index) => (
        <button
          key={tile.id}
          type="button"
          className="offers-board__tile"
          data-tone={tile.tone}
          data-lit={tile.pressed || (tile.tone === "attention" && tile.count > 0) || undefined}
          data-group-start={index === 2 || undefined}
          aria-pressed={tile.pressed}
          onClick={() => onChange(tile.apply(filters))}
        >
          <span className="offers-board__lamp" aria-hidden="true" />
          <span className="offers-board__count">{ready ? formatCount(tile.count) : "—"}</span>
          <span className="offers-board__label">{tile.label}</span>
        </button>
      ))}
    </div>
  );
}
