import type { QualityAttemptTransport, ReworkEpisodeTransport } from "../api/types";

export type QualityHistoryEntry =
  | {
      kind: "attempt";
      attempt: QualityAttemptTransport;
    }
  | {
      kind: "correction";
      episode: ReworkEpisodeTransport;
    };

type OrderedEvent = {
  entry: QualityHistoryEntry;
  timeMs: number | null;
  sourceIndex: number;
};

/**
 * Presentation order only. Original attempt and episode records stay unchanged.
 * Known timestamps sort ascending. Equal timestamps keep source order.
 * Missing or unparseable timestamps stay after timed events, in source order.
 */
export function presentQualityHistory(
  attempts: readonly QualityAttemptTransport[],
  episodes: readonly ReworkEpisodeTransport[],
): QualityHistoryEntry[] {
  const events: OrderedEvent[] = [];
  attempts.forEach((attempt, index) => {
    events.push({
      entry: { kind: "attempt", attempt },
      timeMs: parseTimestamp(attempt.recordedAt),
      sourceIndex: index,
    });
  });
  const closedEpisodes = episodes.filter((episode) => episode.status === "CLOSED");
  closedEpisodes.forEach((episode, index) => {
    events.push({
      entry: { kind: "correction", episode },
      timeMs: parseTimestamp(episode.closedAt),
      sourceIndex: attempts.length + index,
    });
  });
  return events
    .sort((left, right) => compareQualityHistory(left, right))
    .map((event) => event.entry);
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  const timeMs = Date.parse(value);
  return Number.isNaN(timeMs) ? null : timeMs;
}

function compareQualityHistory(left: OrderedEvent, right: OrderedEvent): number {
  if (left.timeMs !== null && right.timeMs !== null) {
    if (left.timeMs !== right.timeMs) {
      return left.timeMs - right.timeMs;
    }
    return left.sourceIndex - right.sourceIndex;
  }
  if (left.timeMs !== null) {
    return -1;
  }
  if (right.timeMs !== null) {
    return 1;
  }
  return left.sourceIndex - right.sourceIndex;
}
