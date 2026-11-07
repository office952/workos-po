import type { OfferCommercialStatusTransport } from "../api/types";

/**
 * Presentation of the server's per-offer commercial status: dot shape, row step and tone.
 * The status itself always comes from the server; an absent or unknown status fails closed
 * to "unclear" and never gets rebuilt from stage, acceptance or order here.
 */
export type OfferDotState =
  | "ordered"
  | "accepted"
  | "awaiting"
  | "decided"
  | "superseded"
  | "undecided"
  | "no-offer"
  | "unclear";

export type OfferStepTone = "attention" | "action" | "muted";

export type OfferStatusView = {
  dot: OfferDotState;
  label: string;
  obligation: "ACTIONABLE" | "WAITING" | "NONE";
  /** Short label of the row link; the target is chosen by the caller (offer or job sheet). */
  stepLabel: string;
  stepTone: OfferStepTone;
  /** The row link goes to the job sheet instead of the offer. */
  stepToJob: boolean;
};

function obligationOf(value: string | null): OfferStatusView["obligation"] {
  return value === "ACTIONABLE" || value === "WAITING" ? value : "NONE";
}

export function presentOfferStatus(offer: OfferCommercialStatusTransport): OfferStatusView {
  const label = offer.commercialStatusLabel?.trim() || "Stare necunoscută";
  const obligation = obligationOf(offer.obligationKind);
  switch (offer.commercialStatus) {
    case "ORDERED":
      return { dot: "ordered", label, obligation, stepLabel: "Fișa lucrării", stepTone: "action", stepToJob: true };
    case "ACCEPTED_WITHOUT_ORDER":
      return { dot: "accepted", label, obligation, stepLabel: "Confirmarea comenzii", stepTone: "attention", stepToJob: false };
    case "AWAITING_CUSTOMER":
      return { dot: "awaiting", label, obligation, stepLabel: "Deschide oferta", stepTone: "action", stepToJob: false };
    case "DECLINED_BY_CUSTOMER":
    case "NOT_PURSUED":
      return { dot: "decided", label, obligation, stepLabel: "Vezi decizia", stepTone: "muted", stepToJob: false };
    case "SUPERSEDED":
      return { dot: "superseded", label, obligation, stepLabel: "Vezi versiunea", stepTone: "muted", stepToJob: false };
    case "UNDECIDED_AFTER_CLOSE":
      return { dot: "undecided", label, obligation, stepLabel: "Deschide oferta", stepTone: "attention", stepToJob: false };
    default:
      return { dot: "unclear", label, obligation, stepLabel: "Deschide oferta", stepTone: "action", stepToJob: false };
  }
}
