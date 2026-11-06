import type {
  CommercialOfferFacts,
  CommercialOfferResolution,
} from "./types.js";

export function resolveOfferCommercialStatus(
  offer: CommercialOfferFacts,
): CommercialOfferResolution {
  if (offer.ordered) {
    return {
      quoteSnapshotId: offer.quoteSnapshotId,
      source: "ORDERED",
      commerciallyResolved: true,
      outstandingOrderObligation: false,
      resumable: false,
      decisionRequired: false,
    };
  }
  if (offer.accepted) {
    return {
      quoteSnapshotId: offer.quoteSnapshotId,
      source: "ACCEPTED",
      commerciallyResolved: true,
      outstandingOrderObligation: true,
      resumable: false,
      decisionRequired: false,
    };
  }
  if (offer.superseded) {
    return {
      quoteSnapshotId: offer.quoteSnapshotId,
      source: "SUPERSEDED_LINEAGE",
      commerciallyResolved: true,
      outstandingOrderObligation: false,
      resumable: false,
      decisionRequired: false,
    };
  }
  if (offer.currentDisposition) {
    return {
      quoteSnapshotId: offer.quoteSnapshotId,
      source: "DISPOSITION",
      commerciallyResolved: true,
      outstandingOrderObligation: false,
      resumable: true,
      decisionRequired: false,
    };
  }
  return {
    quoteSnapshotId: offer.quoteSnapshotId,
    source: "UNRESOLVED",
    commerciallyResolved: false,
    outstandingOrderObligation: false,
    resumable: false,
    decisionRequired: true,
  };
}

export function unresolvedOffers(
  offers: readonly CommercialOfferFacts[],
): CommercialOfferFacts[] {
  return offers.filter((offer) => !resolveOfferCommercialStatus(offer).commerciallyResolved);
}

export function outstandingOrderObligations(
  offers: readonly CommercialOfferFacts[],
): CommercialOfferFacts[] {
  return offers.filter((offer) => resolveOfferCommercialStatus(offer).outstandingOrderObligation);
}

export function offersRequiringDecision(
  offers: readonly CommercialOfferFacts[],
): CommercialOfferFacts[] {
  return offers.filter((offer) => resolveOfferCommercialStatus(offer).decisionRequired);
}
