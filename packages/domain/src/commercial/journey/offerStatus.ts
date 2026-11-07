import type { CommercialOfferDisposition, CommercialState } from "../closure/types.js";

/**
 * One operator-facing commercial status per offer. It never replaces the historical
 * stage or the recorded disposition; it only says what the offer means today.
 *
 * WorkOS does not record that an offer was sent, delivered or shown to the customer.
 * `AWAITING_CUSTOMER` is the existing transport code for an open offer with no
 * recorded decision; operator copy must not claim a customer reply is outstanding.
 */
export const OFFER_COMMERCIAL_STATUSES = [
  "AWAITING_CUSTOMER",
  "ACCEPTED_WITHOUT_ORDER",
  "ORDERED",
  "DECLINED_BY_CUSTOMER",
  "NOT_PURSUED",
  "SUPERSEDED",
  "UNDECIDED_AFTER_CLOSE",
] as const;
export type OfferCommercialStatus = (typeof OFFER_COMMERCIAL_STATUSES)[number];

/**
 * ACTIONABLE = a recorded next mutation for the organization.
 * WAITING = an open offer with no recorded commercial decision. This is not proof the
 * customer received the offer.
 * NONE = a recorded terminal outcome.
 * An undecided offer on a closed request is legacy data that closure now refuses; it stays
 * actionable so it is never hidden.
 */
export const OFFER_OBLIGATION_KINDS = ["ACTIONABLE", "WAITING", "NONE"] as const;
export type OfferObligationKind = (typeof OFFER_OBLIGATION_KINDS)[number];

export type OfferCommercialStatusFacts = {
  ordered: boolean;
  accepted: boolean;
  superseded: boolean;
  disposition: CommercialOfferDisposition | null;
  /** Null when the offer is not linked to a request. */
  commercialState: CommercialState | null;
};

export type OfferCommercialStatusView = {
  commercialStatus: OfferCommercialStatus;
  commercialStatusLabel: string;
  obligationKind: OfferObligationKind;
  /** "De urmărit": the offer still waits for the customer or for the order confirmation. */
  followUp: boolean;
  /** "Decise": refused by the customer or no longer pursued. */
  decided: boolean;
};

export function deriveOfferCommercialStatus(
  facts: OfferCommercialStatusFacts,
): OfferCommercialStatus {
  if (facts.ordered) {
    return "ORDERED";
  }
  if (facts.accepted) {
    return "ACCEPTED_WITHOUT_ORDER";
  }
  if (facts.superseded) {
    return "SUPERSEDED";
  }
  if (facts.disposition === "DECLINED_BY_CUSTOMER") {
    return "DECLINED_BY_CUSTOMER";
  }
  if (facts.disposition === "NOT_PURSUED") {
    return "NOT_PURSUED";
  }
  return facts.commercialState === "CLOSED" ? "UNDECIDED_AFTER_CLOSE" : "AWAITING_CUSTOMER";
}

export function offerCommercialStatusLabel(status: OfferCommercialStatus): string {
  switch (status) {
    case "AWAITING_CUSTOMER":
      return "Fără decizie";
    case "ACCEPTED_WITHOUT_ORDER":
      return "Acceptată · fără comandă";
    case "ORDERED":
      return "Cu comandă";
    case "DECLINED_BY_CUSTOMER":
      return "Refuzată de client";
    case "NOT_PURSUED":
      return "Nu se mai urmărește";
    case "SUPERSEDED":
      return "Înlocuită de o versiune mai nouă";
    case "UNDECIDED_AFTER_CLOSE":
      return "Fără decizie comercială";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function offerObligationKind(status: OfferCommercialStatus): OfferObligationKind {
  switch (status) {
    case "ACCEPTED_WITHOUT_ORDER":
    case "UNDECIDED_AFTER_CLOSE":
      return "ACTIONABLE";
    case "AWAITING_CUSTOMER":
      return "WAITING";
    case "ORDERED":
    case "DECLINED_BY_CUSTOMER":
    case "NOT_PURSUED":
    case "SUPERSEDED":
      return "NONE";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function projectOfferCommercialStatus(
  facts: OfferCommercialStatusFacts,
): OfferCommercialStatusView {
  const commercialStatus = deriveOfferCommercialStatus(facts);
  const obligationKind = offerObligationKind(commercialStatus);
  return {
    commercialStatus,
    commercialStatusLabel: offerCommercialStatusLabel(commercialStatus),
    obligationKind,
    followUp: obligationKind !== "NONE",
    decided:
      commercialStatus === "DECLINED_BY_CUSTOMER" || commercialStatus === "NOT_PURSUED",
  };
}
