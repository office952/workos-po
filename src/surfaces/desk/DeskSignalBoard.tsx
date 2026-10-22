import { useRef, type KeyboardEvent } from "react";
import { formatCount } from "./deskKeys";

export type DeskSignal = {
  id: string;
  label: string;
  /** null when the server did not send the value; shown as "—", never invented. */
  count: number | null;
  tone: "neutral" | "attention";
  pressed: boolean;
  groupStart?: boolean;
};

type Props = {
  label: string;
  signals: readonly DeskSignal[];
  ready: boolean;
  onPress: (id: string) => void;
};

/** Counters that filter: one lamp per tile, lit when it is the active filter or needs attention. */
export function DeskSignalBoard({ label, signals, ready, onPress }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div ref={rootRef} className="rdesk-board" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {signals.map((signal) => (
        <button
          key={signal.id}
          type="button"
          className="rdesk-board__tile"
          data-tone={signal.tone}
          data-lit={signal.pressed || (signal.tone === "attention" && (signal.count ?? 0) > 0) || undefined}
          data-group-start={signal.groupStart || undefined}
          aria-pressed={signal.pressed}
          onClick={() => onPress(signal.id)}
        >
          <span className="rdesk-board__lamp" aria-hidden="true" />
          <span className="rdesk-board__count">{ready ? formatCount(signal.count) : "—"}</span>
          <span className="rdesk-board__label">{signal.label}</span>
        </button>
      ))}
    </div>
  );
}
