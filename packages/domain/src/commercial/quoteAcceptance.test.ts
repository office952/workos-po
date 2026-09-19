import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { DEFAULT_COMMERCIAL_POLICY, type CommercialPolicy } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import { recordQuoteAcceptance } from "./quoteAcceptance.js";
import { freezeQuoteSnapshot, type QuoteSnapshot } from "./quoteSnapshot.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function frozenGoldenQuote(): QuoteSnapshot {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: readyValues,
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  const eic = compileEic(aggregate, composition);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt: "2026-08-17T00:00:00.000Z" },
  );
  if (!frozen.ok) {
    throw new Error("expected frozen quote");
  }
  return frozen.snapshot;
}

describe("quote acceptance decision", () => {
  it("records acceptance against the persisted golden quote without mutating it", () => {
    const snapshot = frozenGoldenQuote();
    const first = recordQuoteAcceptance(snapshot, {
      acceptedAt: "2026-08-17T01:00:00.000Z",
    });
    const second = recordQuoteAcceptance(snapshot, {
      acceptedAt: "2026-08-17T12:00:00.000Z",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(snapshot.status).toBe("FROZEN");
    expect(first.decision.acceptanceId).toBe(`qad:${snapshot.quoteSnapshotId}`);
    expect(first.decision.quoteSnapshotId).toBe(snapshot.quoteSnapshotId);
    expect(first.decision.quoteContentHash).toBe(snapshot.contentHash);
    expect(first.decision.acceptedAt).toBe("2026-08-17T01:00:00.000Z");
    expect(second.decision.acceptanceId).toBe(first.decision.acceptanceId);
    expect(first.decision.quoteContentHash).toHaveLength(64);
    expect(snapshot.commercial.grossPrice).toBe(624.82);
    expect(snapshot.eic.total).toBe(382.5);
    expect(JSON.stringify(first.decision)).not.toMatch(
      /ExecutionPlan|OrderSnapshot|customerId|FACE|VOLUME/i,
    );
  });

  it("does not reprice when the current commercial policy changes", () => {
    const snapshot = frozenGoldenQuote();
    const accepted = recordQuoteAcceptance(snapshot);
    const laterPolicy: CommercialPolicy = {
      ...DEFAULT_COMMERCIAL_POLICY,
      version: 2,
      markupPercent: 70,
      vatPercent: 19,
    };
    const live = projectCommercialPrice(
      { ...snapshot.eic, completeness: "COMPLETE" },
      laterPolicy,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(live.grossPrice).not.toBe(snapshot.commercial.grossPrice);
    expect(snapshot.commercial.grossPrice).toBe(624.82);
    expect(accepted.decision.quoteContentHash).toBe(snapshot.contentHash);
  });

  it("does not recompile or reprice when a later cost total is imagined", () => {
    const snapshot = frozenGoldenQuote();
    const accepted = recordQuoteAcceptance(snapshot);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(snapshot.eic.total).toBe(382.5);
    expect(accepted.decision.quoteContentHash).toBe(snapshot.contentHash);
  });

  it("blocks an incompatible or incomplete snapshot", () => {
    const snapshot = frozenGoldenQuote();
    expect(
      recordQuoteAcceptance({
        ...snapshot,
        eic: { ...snapshot.eic, completeness: "PARTIAL" },
      }),
    ).toMatchObject({ ok: false, error: "quote_not_acceptable" });
    expect(
      recordQuoteAcceptance({
        ...snapshot,
        schemaVersion: 2 as typeof snapshot.schemaVersion,
      }),
    ).toMatchObject({ ok: false, error: "service_quote_not_acceptable" });
    expect(
      recordQuoteAcceptance({
        ...snapshot,
        contentHash: "",
      }),
    ).toMatchObject({ ok: false, error: "incompatible_quote" });
  });
});
