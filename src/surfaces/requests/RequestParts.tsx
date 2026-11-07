import { useRef, type KeyboardEvent } from "react";
import type { RequestListItemTransport, RequestOverviewSummaryTransport } from "../../api/types";
import { formatShortDay } from "../../presentation/format";
import { formatCount } from "../desk/deskKeys";
import type { DeskLayout } from "../desk/useDeskLayout";
import { TRAYS } from "./requestRegistryModel";

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
        <small>stare administrativă</small>
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

/** The server's offer summary of the request: "4 oferte · 1 cu comandă · 1 refuzată". */
export function OffersSummary({ item }: { item: Pick<RequestListItemTransport, "journey"> }) {
  const label = item.journey?.offerSummary.summaryLabel || "—";
  return (
    <span className="rtray-offers" data-empty={!item.journey || item.journey.offerSummary.count === 0 || undefined}>
      {label}
    </span>
  );
}

/** Commercial phase of the request, with the administrative note only when it adds something. */
export function CommercialPhase({ item }: { item: Pick<RequestListItemTransport, "journey"> }) {
  const journey = item.journey;
  if (!journey) return <span className="rdesk-state">—</span>;
  const day = journey.phase === "CLOSED" || journey.phase === "REOPENED" ? formatShortDay(journey.phaseAt) : null;
  return (
    <span className="rdesk-state-stack">
      <span className="rtray-phase" data-phase={journey.phase}>
        {day ? `${journey.phaseLabel} · ${day}` : journey.phaseLabel}
      </span>
      {journey.administrativeNote ? <span className="rdesk-commercial-closed">{journey.administrativeNote}</span> : null}
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
