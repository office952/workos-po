import { useEffect, useRef, type KeyboardEvent } from "react";
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
  /**
   * board: counter tiles (desktop, tablet). chips: one scrollable row of filter chips (phone);
   * the active chip is always brought into view, after a change and when the context returns.
   */
  variant?: "board" | "chips";
};

/** Counters that filter: one lamp per tile, lit when it is the active filter or needs attention. */
export function DeskSignalBoard({ label, signals, ready, onPress, variant = "board" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pressedId = signals.find((signal) => signal.pressed)?.id ?? null;

  // Scrolls the row only (the page does not move). Counts and web fonts change the chip widths
  // after a restored filter, so the check runs again on the next frame and once fonts are ready.
  useEffect(() => {
    const row = rootRef.current;
    if (variant !== "chips" || !pressedId || !row) return;
    let active = true;
    const reveal = () => {
      const chip = row.querySelector<HTMLElement>(`[data-signal-id="${CSS.escape(pressedId)}"]`);
      if (!active || !chip) return;
      const bounds = row.getBoundingClientRect();
      const rect = chip.getBoundingClientRect();
      if (rect.left < bounds.left) row.scrollLeft -= bounds.left - rect.left;
      else if (rect.right > bounds.right) row.scrollLeft += rect.right - bounds.right;
    };
    reveal();
    const frame = window.requestAnimationFrame(reveal);
    void document.fonts?.ready.then(reveal);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [variant, pressedId, ready]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className={variant === "chips" ? "rdesk-filterchips" : "rdesk-board"}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {signals.map((signal) => (
        <button
          key={signal.id}
          type="button"
          className={variant === "chips" ? "rdesk-filterchips__chip" : "rdesk-board__tile"}
          data-signal-id={signal.id}
          data-tone={signal.tone}
          data-lit={signal.pressed || (signal.tone === "attention" && (signal.count ?? 0) > 0) || undefined}
          data-group-start={signal.groupStart || undefined}
          aria-pressed={signal.pressed}
          onClick={() => onPress(signal.id)}
        >
          {variant === "chips" ? null : <span className="rdesk-board__lamp" aria-hidden="true" />}
          <span className={variant === "chips" ? "rdesk-filterchips__count" : "rdesk-board__count"}>{ready ? formatCount(signal.count) : "—"}</span>
          <span className={variant === "chips" ? "rdesk-filterchips__label" : "rdesk-board__label"}>{signal.label}</span>
          {variant === "chips" && signal.pressed ? <span className="rdesk-filterchips__mark" aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>
  );
}
