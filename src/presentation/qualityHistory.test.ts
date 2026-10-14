import { describe, expect, it } from "vitest";
import type { QualityAttemptTransport, ReworkEpisodeTransport } from "../api/types";
import { presentQualityHistory } from "./qualityHistory";

function attempt(
  attemptSeq: number,
  result: "PASS" | "FAIL",
  recordedAt: string,
): QualityAttemptTransport {
  return { attemptSeq, result, note: null, recordedAt };
}

function episode(
  episodeSeq: number,
  status: "OPEN" | "CLOSED",
  closedAt: string | null,
): ReworkEpisodeTransport {
  return { episodeSeq, status, correctionNote: null, closedAt };
}

function labels(
  attempts: readonly QualityAttemptTransport[],
  episodes: readonly ReworkEpisodeTransport[],
): string[] {
  return presentQualityHistory(attempts, episodes).map((entry) => {
    switch (entry.kind) {
      case "attempt":
        return entry.attempt.result === "PASS" ? "Acceptat" : "Respins";
      case "correction":
        return "Corecție închisă";
      default: {
        const _exhaustive: never = entry;
        return _exhaustive;
      }
    }
  });
}

describe("presentQualityHistory", () => {
  it("interleaves attempts and closed corrections by timestamp", () => {
    const attempts = [
      attempt(1, "FAIL", "2026-10-15T08:00:00.000Z"),
      attempt(2, "PASS", "2026-10-15T10:00:00.000Z"),
    ];
    const episodes = [
      episode(1, "CLOSED", "2026-10-15T09:00:00.000Z"),
    ];

    expect(labels(attempts, episodes)).toEqual([
      "Respins",
      "Corecție închisă",
      "Acceptat",
    ]);
    expect(attempts.map((item) => item.attemptSeq)).toEqual([1, 2]);
    expect(episodes[0]?.status).toBe("CLOSED");
  });

  it("keeps source order when timestamps match", () => {
    const same = "2026-10-15T09:00:00.000Z";
    expect(
      labels(
        [attempt(1, "FAIL", same), attempt(2, "PASS", same)],
        [episode(1, "CLOSED", same)],
      ),
    ).toEqual(["Respins", "Acceptat", "Corecție închisă"]);
  });

  it("places missing timestamps after known times without inventing a clock time", () => {
    expect(
      labels(
        [
          attempt(1, "FAIL", "2026-10-15T08:00:00.000Z"),
          attempt(2, "PASS", "not-a-timestamp"),
        ],
        [episode(1, "CLOSED", null), episode(2, "OPEN", null)],
      ),
    ).toEqual(["Respins", "Acceptat", "Corecție închisă"]);
  });

  it("keeps untimed events in source order", () => {
    expect(
      labels(
        [attempt(1, "FAIL", ""), attempt(2, "PASS", "   ")],
        [episode(4, "CLOSED", null)],
      ),
    ).toEqual(["Respins", "Acceptat", "Corecție închisă"]);
  });
});
