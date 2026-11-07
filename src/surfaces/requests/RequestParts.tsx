import type { RequestListItemTransport, RequestOverviewSummaryTransport } from "../../api/types";
import { formatShortDay } from "../../presentation/format";
import { TRAYS } from "./requestRegistryModel";

/**
 * Administrative status: a secondary filter beside the commercial ones, counted by the server
 * summary. Without a summary the options show "—" instead of counting a list.
 */
export function RequestStatusFilter({
  summary,
  ready,
  status,
  onStatus,
}: {
  summary: RequestOverviewSummaryTransport | null;
  ready: boolean;
  status: string | null;
  onStatus: (status: string | null) => void;
}) {
  return (
    <label className="rtray-status" data-active={status !== null || undefined}>
      <span>Stare administrativă</span>
      <select value={status ?? ""} onChange={(event) => onStatus(event.target.value || null)}>
        <option value="">Toate</option>
        {TRAYS.map((tray) => {
          const count = ready ? (summary?.[tray.summary] ?? null) : null;
          return (
            <option key={tray.status} value={tray.status}>
              {`${tray.label} · ${count ?? "—"}`}
            </option>
          );
        })}
      </select>
    </label>
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
