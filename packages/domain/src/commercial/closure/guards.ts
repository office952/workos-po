import { resolveOfferCommercialStatus } from "./resolution.js";
import type { CommercialActor, CommercialOfferFacts, CommercialState } from "./types.js";

export type CommercialGuardRefusal = {
  error: string;
  reasons: readonly string[];
};

export function newQuoteWhileClosedRefusal(
  commercialState: CommercialState,
): CommercialGuardRefusal | null {
  if (commercialState !== "CLOSED") {
    return null;
  }
  return {
    error: "commercial_request_closed",
    reasons: ["Cererea cu urmărirea comercială încheiată nu poate primi o ofertă nouă."],
  };
}

export function acceptQuoteCommercialRefusal(
  offer: CommercialOfferFacts | null,
): CommercialGuardRefusal | null {
  if (!offer) {
    return null;
  }
  if (offer.currentDisposition && !offer.accepted && !offer.ordered) {
    return {
      error: "offer_not_resumable",
      reasons: [
        "Oferta are o decizie comercială. Reia-o explicit înainte de acceptare.",
      ],
    };
  }
  return null;
}

export function administrativeCancellationRefusal(input: {
  nextStatus: string;
  hasOrders: boolean;
}): CommercialGuardRefusal | null {
  if (input.nextStatus !== "CANCELLED" || !input.hasOrders) {
    return null;
  }
  return {
    error: "order_obligation_blocks_cancellation",
    reasons: [
      "Cererea are comenzi existente. Anularea administrativă nu le poate contrazice; folosește încheierea comercială.",
    ],
  };
}

export function ownerOnlyCommercialMutationRefusal(
  actor: CommercialActor,
): CommercialGuardRefusal | null {
  if (actor.role === "owner") {
    return null;
  }
  return {
    error: "forbidden",
    reasons: ["Doar proprietarul poate încheia, redeschide sau decide ofertele."],
  };
}

export function requestHasOrderObligations(offers: readonly CommercialOfferFacts[]): boolean {
  return offers.some((offer) => offer.ordered);
}

export function offerMayReceiveDisposition(offer: CommercialOfferFacts): boolean {
  return resolveOfferCommercialStatus(offer).decisionRequired || Boolean(offer.currentDisposition);
}
