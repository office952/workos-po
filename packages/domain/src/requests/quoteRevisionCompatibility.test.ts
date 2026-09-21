import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { projectCommercialPrice } from "../commercial/price.js";
import { recordQuoteAcceptance } from "../commercial/quoteAcceptance.js";
import { freezeQuoteSnapshot, type QuoteSnapshot } from "../commercial/quoteSnapshot.js";
import type { QuoteCommercialTerms } from "../commercial/quoteTerms.js";
import { emptyCustomerProfile, type Customer } from "../customers/identity.js";
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
import {
  createCommercialRequest,
  linkCommercialRequestQuote,
} from "./commercialRequest.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function customer(): Customer {
  return {
    customerId: "cus:active",
    displayName: "HUB MEDIA",
    status: "ACTIVE",
    createdAt: "2026-08-17T08:00:00.000Z",
    updatedAt: "2026-08-17T08:00:00.000Z",
    retiredAt: null,
    ...emptyCustomerProfile(),
  };
}

function frozenQuote(terms: QuoteCommercialTerms): QuoteSnapshot {
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
  const aggregate = compileAggregate(truth, frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, seededDisplayLabelCatalog(), { formulaVersionsForType: starterFormulaVersionsForType });
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template, undefined, { formulaVersionsForType: starterFormulaVersionsForType });
  const eic = compileEic(aggregate, composition);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic, DEFAULT_COMMERCIAL_POLICY, terms),
    { createdAt: "2026-08-17T00:00:00.000Z" },
  );
  if (!frozen.ok) {
    throw new Error("expected frozen quote");
  }
  return frozen.snapshot;
}

describe("quote revision compatibility", () => {
  it("links two distinct frozen snapshots to one request without rewriting the first", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Cerere litere",
      description: "Negociere pe aceeași cerere.",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    const firstTerms = {
      markupPercent: 35,
      discountPercent: 0,
      adjustmentAmount: 0,
    };
    const secondTerms = {
      markupPercent: 25,
      discountPercent: 5,
      adjustmentAmount: 0,
    };
    const firstQuote = frozenQuote(firstTerms);
    const firstHash = firstQuote.contentHash;
    const firstId = firstQuote.quoteSnapshotId;
    const firstCommercial = { ...firstQuote.commercial };
    const secondQuote = frozenQuote(secondTerms);
    const firstLink = linkCommercialRequestQuote({
      request: created.request,
      quoteSnapshotId: firstQuote.quoteSnapshotId,
      quoteCustomerId: "cus:active",
      existingLink: null,
      linkedAt: "2026-09-20T10:00:00.000Z",
    });
    const secondLink = linkCommercialRequestQuote({
      request: created.request,
      quoteSnapshotId: secondQuote.quoteSnapshotId,
      quoteCustomerId: "cus:active",
      existingLink: null,
      linkedAt: "2026-09-20T11:00:00.000Z",
    });
    expect(firstLink.ok && secondLink.ok).toBe(true);
    if (!firstLink.ok || !secondLink.ok) {
      return;
    }
    expect(firstLink.link.quoteSnapshotId).toBe(firstId);
    expect(secondLink.link.quoteSnapshotId).toBe(secondQuote.quoteSnapshotId);
    expect(firstLink.link.requestId).toBe(created.request.requestId);
    expect(secondLink.link.requestId).toBe(created.request.requestId);
    expect(firstQuote.quoteSnapshotId).not.toBe(secondQuote.quoteSnapshotId);
    expect(firstQuote.contentHash).not.toBe(secondQuote.contentHash);
    expect(firstQuote.quoteSnapshotId).toBe(firstId);
    expect(firstQuote.contentHash).toBe(firstHash);
    expect(firstQuote.commercial.markupPercent).toBe(firstCommercial.markupPercent);
    expect(firstQuote.commercial.discountPercent).toBe(firstCommercial.discountPercent);
    expect(secondQuote.commercial.markupPercent).toBe(25);
    expect(secondQuote.commercial.discountPercent).toBe(5);

    const accepted = recordQuoteAcceptance(secondQuote, {
      acceptedAt: "2026-09-20T12:00:00.000Z",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(accepted.decision.quoteSnapshotId).toBe(secondQuote.quoteSnapshotId);
    expect(accepted.decision.quoteContentHash).toBe(secondQuote.contentHash);
    expect(firstQuote.contentHash).toBe(firstHash);
    expect(firstQuote.commercial.markupPercent).toBe(35);
  });
});
