import { useRef, type KeyboardEvent } from "react";
import type { RequestListItemTransport, RequestOverviewSummaryTransport } from "../../api/types";
import { formatCount } from "../desk/deskKeys";
import type { DeskLayout } from "../desk/useDeskLayout";
import { commercialLabel, commercialSteps, PROGRESS_SEGMENTS, TRAYS } from "./requestRegistryModel";

/**
 * Preparation trays: one filter per request status, counted by the server summary.
 * Without a summary the trays show "—" instead of counting a list.
 */
export function RequestTrays({
  summary,
  ready,
  status,
  layout,
  onStatus,
}: {
  summary: RequestOverviewSummaryTransport | null;
  ready: boolean;
  status: string | null;
  layout: DeskLayout;
  onStatus: (status: string | null) => void;
}) {
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
    <div className="rtray" data-layout={layout}>
      <p className="rtray__caption" aria-hidden="true">
        <span>Pregătire</span>
        <small>stare cerere</small>
      </p>
      <div ref={rootRef} className="rtray__trays" role="group" aria-label="Tăvi de pregătire: filtru pe starea cererii" onKeyDown={onKeyDown}>
        {TRAYS.map((tray) => {
          const count = ready ? (summary?.[tray.summary] ?? null) : null;
          return (
            <button
              key={tray.status}
              type="button"
              className="rtray__tray"
              data-filled={(count ?? 0) > 0 || undefined}
              data-apart={tray.status === "BLOCKED" || undefined}
              aria-pressed={status === tray.status}
              aria-label={`${tray.label}: ${count ?? "—"}`}
              onClick={() => onStatus(status === tray.status ? null : tray.status)}
            >
              <span className="rtray__lip" aria-hidden="true" />
              <span className="rtray__count">{formatCount(count)}</span>
              <span className="rtray__label">{tray.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Three segments for the commercial progress code; the label is the server's. */
export function CommercialProgress({ item }: { item: Pick<RequestListItemTransport, "commercialProgress" | "contextLabel"> }) {
  const steps = commercialSteps(item);
  return (
    <span className="rtray-progress">
      <span className="rtray-progress__segments" aria-hidden="true">
        {PROGRESS_SEGMENTS.map((segment, index) => (
          <span key={segment} data-on={steps !== null && index < steps ? (index === steps - 1 ? "last" : "done") : undefined} />
        ))}
      </span>
      <span className="rtray-progress__label" data-empty={!item.commercialProgress || undefined}>{commercialLabel(item)}</span>
    </span>
  );
}

export function RequestState({ item }: { item: RequestListItemTransport }) {
  return (
    <span className="rdesk-state">
      <span className="rdesk-lamp" aria-hidden="true" />
      {item.statusLabel || "—"}
    </span>
  );
}
