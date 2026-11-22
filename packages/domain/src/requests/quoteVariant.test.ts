import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFERING_POLICY,
  EMPTY_OFFERING_RULES,
  commercialOfferingView,
  evaluateOfferingPolicy,
  hasActiveOfferingRule,
  offeringControlMode,
  priceApprovalBindingHash,
  validateOfferingPolicyInput,
  type OfferingPolicy,
} from "../commercial/offeringPolicy.js";
import {
  deriveQuoteVariantAction,
  deriveQuoteVariantState,
  quoteVariantStateLabel,
  validateJournalEntryInput,
  type QuoteVariantFacts,
} from "./quoteVariant.js";
import { projectRequestCommercialJourney, requestJourneyVariantLabel } from "../commercial/journey/requestJourney.js";

const base: QuoteVariantFacts = {
  lifecycle: "ACTIVE",
  issued: false,
  productAvailable: true,
  missingCount: 0,
  confirmed: true,
  confirmationValid: true,
  pricePresent: true,
  priceForConfirmedConfiguration: true,
  priceAuthorOutcome: "APPROVAL_REQUIRED",
  approvalStatus: "NONE",
};

const owner = { canConfigure: true, canSetPrice: true, canApprove: true, outcome: "WITHIN_POLICY" as const };
const commercial = { canConfigure: true, canSetPrice: true, canApprove: false, outcome: "APPROVAL_REQUIRED" as const };
const restricted = { canConfigure: true, canSetPrice: false, canApprove: false, outcome: "NOT_PERMITTED" as const };

describe("quote variant state", () => {
  it("follows the precedence of R2 §3.2", () => {
    expect(deriveQuoteVariantState({ ...base, lifecycle: "WITHDRAWN", issued: true })).toBe("WITHDRAWN");
    expect(deriveQuoteVariantState({ ...base, issued: true, productAvailable: false })).toBe("ISSUED");
    expect(deriveQuoteVariantState({ ...base, productAvailable: false })).toBe("UNAVAILABLE");
    expect(deriveQuoteVariantState({ ...base, confirmationValid: false })).toBe("NEEDS_REVERIFY");
    expect(deriveQuoteVariantState({ ...base, confirmed: false, missingCount: 2 })).toBe("IN_PROGRESS");
    expect(deriveQuoteVariantState({ ...base, confirmed: false })).toBe("READY_TO_VERIFY");
    expect(deriveQuoteVariantState({ ...base, pricePresent: false })).toBe("AWAITING_PRICE");
    expect(deriveQuoteVariantState({ ...base, priceForConfirmedConfiguration: false })).toBe("AWAITING_PRICE");
    expect(deriveQuoteVariantState({ ...base, priceAuthorOutcome: "WITHIN_POLICY", approvalStatus: "STALE" })).toBe("PRICE_SET");
    expect(deriveQuoteVariantState({ ...base, approvalStatus: "STALE" })).toBe("APPROVAL_STALE");
    expect(deriveQuoteVariantState({ ...base, approvalStatus: "REJECTED" })).toBe("REJECTED");
    expect(deriveQuoteVariantState({ ...base, approvalStatus: "REQUESTED" })).toBe("AWAITING_APPROVAL");
    expect(deriveQuoteVariantState({ ...base, approvalStatus: "APPROVED" })).toBe("PRICE_APPROVED");
    expect(deriveQuoteVariantState(base)).toBe("PRICE_PROPOSED");
  });

  it("labels the missing count in Romanian", () => {
    expect(quoteVariantStateLabel("IN_PROGRESS", 1)).toBe("În lucru · lipsește 1 informație");
    expect(quoteVariantStateLabel("IN_PROGRESS", 3)).toBe("În lucru · lipsesc 3 informații");
    expect(quoteVariantStateLabel("PRICE_PROPOSED")).toBe("Preț propus · necesită aprobare");
  });

  it("gives each actor one action and never an authorization the server did not grant", () => {
    expect(deriveQuoteVariantAction("AWAITING_PRICE", owner)).toBe("SET_PRICE");
    expect(deriveQuoteVariantAction("AWAITING_PRICE", restricted)).toBe("OPEN");
    expect(deriveQuoteVariantAction("PRICE_PROPOSED", commercial)).toBe("REQUEST_APPROVAL");
    expect(deriveQuoteVariantAction("PRICE_PROPOSED", owner)).toBe("ISSUE");
    expect(deriveQuoteVariantAction("AWAITING_APPROVAL", commercial)).toBe("OPEN");
    expect(deriveQuoteVariantAction("AWAITING_APPROVAL", owner)).toBe("DECIDE_APPROVAL");
    expect(deriveQuoteVariantAction("PRICE_APPROVED", commercial)).toBe("ISSUE");
    expect(deriveQuoteVariantAction("PRICE_APPROVED", restricted)).toBe("OPEN");
    expect(deriveQuoteVariantAction("REJECTED", commercial)).toBe("OPEN");
    expect(deriveQuoteVariantAction("PRICE_SET", restricted)).toBe("OPEN");
    expect(
      deriveQuoteVariantAction("PRICE_SET", { canConfigure: false, canSetPrice: false, canApprove: false, outcome: null }),
    ).toBe("OPEN");
  });
});

describe("Control total", () => {
  const actor = { canSetPriceByRole: false, mayUseOfferingPolicy: true };
  const controlTotal: OfferingPolicy = {
    ...DEFAULT_OFFERING_POLICY,
    mode: "COMMERCIAL_APPROVAL_POLICY",
    rules: { ...EMPTY_OFFERING_RULES, everyOfferRequiresApproval: true },
    version: 3,
    source: "ORGANIZATION",
  };

  it("is the approval mode with the unconditional rule and counts as an active rule", () => {
    const validated = validateOfferingPolicyInput({ mode: "COMMERCIAL_APPROVAL_POLICY", rules: { everyOfferRequiresApproval: true, maximumNetValue: 500 } });
    expect(validated).toEqual({
      ok: true,
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: { ...EMPTY_OFFERING_RULES, everyOfferRequiresApproval: true },
    });
    expect(hasActiveOfferingRule(controlTotal.rules)).toBe(true);
    expect(offeringControlMode(controlTotal)).toBe("CONTROL_TOTAL");
    expect(offeringControlMode({ mode: "COMMERCIAL_APPROVAL_POLICY", rules: { ...EMPTY_OFFERING_RULES, maximumNetValue: 1 } })).toBe("CONTROL_BY_RULES");
    expect(offeringControlMode(DEFAULT_OFFERING_POLICY)).toBe("OWNER_ONLY");
    // Any other mode never carries the rule.
    expect(validateOfferingPolicyInput({ mode: "COMMERCIAL_AUTONOMOUS", rules: { everyOfferRequiresApproval: true } })).toEqual({
      ok: true,
      mode: "COMMERCIAL_AUTONOMOUS",
      rules: EMPTY_OFFERING_RULES,
    });
  });

  it("requires approval for the Comercial whatever the value or margin, and never for the Owner", () => {
    for (const netPrice of [1, 500, 1_000_000]) {
      const evaluation = evaluateOfferingPolicy({ policy: controlTotal, actor, netPrice, internalCost: 1, internalCostComplete: true });
      expect(evaluation).toMatchObject({ outcome: "APPROVAL_REQUIRED", triggeredRules: ["EVERY_OFFER"] });
      expect(commercialOfferingView(evaluation).message).toContain("fiecare ofertă este aprobată de Proprietar");
    }
    expect(
      evaluateOfferingPolicy({
        policy: controlTotal,
        actor: { canSetPriceByRole: true, mayUseOfferingPolicy: true },
        netPrice: 1,
        internalCost: null,
        internalCostComplete: false,
      }).outcome,
    ).toBe("WITHIN_POLICY");
  });

  it("keeps the binding hash of pre-variant approvals and separates variants", () => {
    const truth = { templateCode: "P", templateVersion: 1, reviewId: "r", selectedComponentIds: [], values: {}, measurements: {} };
    const subject = { kind: "PRODUCT_QUOTE" as const, organizationId: "o", requestId: "q", productCode: "P" };
    const args = { truth: truth as never, netPrice: 100, installationNetPrice: null, policyVersion: 1 };
    const legacy = priceApprovalBindingHash({ subject, ...args });
    expect(priceApprovalBindingHash({ subject: { ...subject }, ...args })).toBe(legacy);
    const first = priceApprovalBindingHash({ subject: { ...subject, variantId: "var:1" }, ...args });
    const second = priceApprovalBindingHash({ subject: { ...subject, variantId: "var:2" }, ...args });
    expect(first).not.toBe(legacy);
    expect(first).not.toBe(second);
  });
});

describe("commercial journal input", () => {
  const now = "2026-11-22T10:00:00.000Z";

  it("accepts a budget interval and defaults the VAT basis to unspecified", () => {
    const result = validateJournalEntryInput(
      { kind: "CUSTOMER_BUDGET", channel: "MEETING", amountMin: 1000, amountMax: 1800, currency: "EUR" },
      now,
    );
    expect(result).toMatchObject({ ok: true, entry: { vatBasis: "UNSPECIFIED", discussedAt: now, amountMin: 1000, amountMax: 1800 } });
  });

  it("refuses an amount on a plain discussion, a missing amount, a reversed interval and a future date", () => {
    expect(validateJournalEntryInput({ kind: "DISCUSSION", channel: "PHONE", notes: "a", amountMax: 5 }, now).ok).toBe(false);
    expect(validateJournalEntryInput({ kind: "DISCUSSION", channel: "PHONE" }, now).ok).toBe(false);
    expect(validateJournalEntryInput({ kind: "DISCUSSED_PRICE", channel: "PHONE", currency: "EUR" }, now).ok).toBe(false);
    expect(validateJournalEntryInput({ kind: "DISCUSSED_PRICE", channel: "PHONE", amountMin: 9, amountMax: 5, currency: "EUR" }, now).ok).toBe(false);
    expect(validateJournalEntryInput({ kind: "DISCUSSED_PRICE", channel: "PHONE", amountMax: 5 }, now).ok).toBe(false);
    expect(
      validateJournalEntryInput({ kind: "DISCUSSION", channel: "PHONE", notes: "a", discussedAt: "2026-12-01T00:00:00.000Z" }, now).ok,
    ).toBe(false);
  });
});

describe("request journey with saved variants", () => {
  const input = {
    status: "NEW" as const,
    requestHref: "/requests/x",
    acceptsNewProductWork: true,
    offers: [],
    assemblies: [],
    ledger: { state: "OPEN" as const, revision: 0, closedAt: null, reopenedAt: null },
  };

  it("asks for a product only while the request has no saved variant", () => {
    expect(projectRequestCommercialJourney(input).nextAction).toBe("CHOOSE_PRODUCT");
    const journey = projectRequestCommercialJourney({ ...input, openVariants: [{ variantId: "v", stage: "AWAITING_PRICE" }] });
    expect(journey).toMatchObject({ nextAction: "OPEN_REQUEST", nextActionLabel: "Așteaptă prețul" });
  });

  it("names the earliest stage that holds the request back", () => {
    expect(requestJourneyVariantLabel([{ variantId: "a", stage: "PRICED" }, { variantId: "b", stage: "IN_PROGRESS" }])).toBe("2 variante în lucru");
    expect(requestJourneyVariantLabel([{ variantId: "a", stage: "PRICED" }, { variantId: "b", stage: "AWAITING_PRICE" }])).toBe("Așteaptă prețul");
    expect(requestJourneyVariantLabel([{ variantId: "a", stage: "PRICED" }])).toBe("Preț pregătit · deschide varianta");
  });
});
