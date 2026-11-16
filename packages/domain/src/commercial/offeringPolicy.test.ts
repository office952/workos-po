import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFERING_POLICY,
  approvalViewFor,
  commercialOfferingView,
  decideOfferingFreeze,
  evaluateOfferingPolicy,
  frozenOfferingRecordFor,
  isFrozenOfferingRecord,
  priceApprovalBindingHash,
  resolveOfferingPriceRight,
  validateOfferingPolicyInput,
  type OfferingPolicy,
  type PriceApprovalRecord,
} from "./offeringPolicy.js";

const owner = { canSetPriceByRole: true, mayUseOfferingPolicy: true };
const commercial = { canSetPriceByRole: false, mayUseOfferingPolicy: true };
const production = { canSetPriceByRole: false, mayUseOfferingPolicy: false };

function policy(mode: OfferingPolicy["mode"], rules: Partial<OfferingPolicy["rules"]> = {}): OfferingPolicy {
  return {
    ...DEFAULT_OFFERING_POLICY,
    mode,
    rules: { ...DEFAULT_OFFERING_POLICY.rules, ...rules },
    version: 3,
    source: "ORGANIZATION",
  };
}

describe("organization offering policy", () => {
  it("defaults to OWNER_ONLY with no rule and no invented threshold", () => {
    expect(DEFAULT_OFFERING_POLICY.mode).toBe("OWNER_ONLY");
    expect(DEFAULT_OFFERING_POLICY.rules).toEqual({
      incompleteCostRequiresApproval: false,
      minimumMarginPercent: null,
      maximumNetValue: null,
    });
    expect(resolveOfferingPriceRight(DEFAULT_OFFERING_POLICY, commercial).canSetPrice).toBe(false);
    expect(resolveOfferingPriceRight(DEFAULT_OFFERING_POLICY, owner).canSetPrice).toBe(true);
    expect(resolveOfferingPriceRight(policy("COMMERCIAL_AUTONOMOUS"), production).canSetPrice).toBe(false);
  });

  it("refuses an approval policy without an active rule (fail-closed)", () => {
    expect(validateOfferingPolicyInput({ mode: "COMMERCIAL_APPROVAL_POLICY", rules: {} })).toMatchObject({ ok: false });
    expect(
      validateOfferingPolicyInput({ mode: "COMMERCIAL_APPROVAL_POLICY", rules: { minimumMarginPercent: -1 } }),
    ).toMatchObject({ ok: false });
    expect(validateOfferingPolicyInput({ mode: "SOMETHING" })).toMatchObject({ ok: false });
    const valid = validateOfferingPolicyInput({
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: { minimumMarginPercent: 15, maximumNetValue: null, incompleteCostRequiresApproval: true },
    });
    expect(valid).toEqual({
      ok: true,
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: { incompleteCostRequiresApproval: true, minimumMarginPercent: 15, maximumNetValue: null },
    });
    // Rules are discarded outside the approval mode.
    expect(
      validateOfferingPolicyInput({ mode: "COMMERCIAL_AUTONOMOUS", rules: { minimumMarginPercent: 10 } }),
    ).toMatchObject({ ok: true, rules: { minimumMarginPercent: null } });
    // A stored approval policy without rules blocks the Comercial role.
    expect(resolveOfferingPriceRight(policy("COMMERCIAL_APPROVAL_POLICY"), commercial).canSetPrice).toBe(false);
  });

  it("evaluates the Comercial role against the Owner rules and never the Owner", () => {
    const strict = policy("COMMERCIAL_APPROVAL_POLICY", { minimumMarginPercent: 20, maximumNetValue: 5000 });
    const base = { policy: strict, netPrice: 1200, internalCost: 1000, internalCostComplete: true };
    expect(evaluateOfferingPolicy({ ...base, actor: commercial })).toMatchObject({
      outcome: "WITHIN_POLICY",
      triggeredRules: [],
    });
    expect(evaluateOfferingPolicy({ ...base, netPrice: 1199.99, actor: commercial })).toMatchObject({
      outcome: "APPROVAL_REQUIRED",
      triggeredRules: ["MINIMUM_MARGIN"],
    });
    expect(evaluateOfferingPolicy({ ...base, netPrice: 6000, actor: commercial }).triggeredRules).toEqual([
      "MAXIMUM_NET_VALUE",
    ]);
    expect(
      evaluateOfferingPolicy({ ...base, internalCostComplete: false, actor: commercial }).triggeredRules,
    ).toEqual(["MINIMUM_MARGIN_UNVERIFIABLE"]);
    expect(evaluateOfferingPolicy({ ...base, netPrice: 1, actor: owner }).outcome).toBe("WITHIN_POLICY");
    expect(evaluateOfferingPolicy({ ...base, policy: DEFAULT_OFFERING_POLICY, actor: commercial }).outcome).toBe(
      "NOT_PERMITTED",
    );
    expect(
      evaluateOfferingPolicy({ ...base, policy: policy("COMMERCIAL_AUTONOMOUS"), netPrice: 1, actor: commercial }).outcome,
    ).toBe("WITHIN_POLICY");
  });

  it("shows the Comercial role the outcome only, without cost, threshold or rule", () => {
    const evaluation = evaluateOfferingPolicy({
      policy: policy("COMMERCIAL_APPROVAL_POLICY", { minimumMarginPercent: 30 }),
      actor: commercial,
      netPrice: 1000,
      internalCost: 900,
      internalCostComplete: true,
    });
    const view = commercialOfferingView(evaluation);
    expect(Object.keys(view).sort()).toEqual(["message", "outcome"]);
    expect(JSON.stringify(view)).not.toMatch(/900|30|marj|cost|MINIMUM/i);
  });

  it("binds an approval to the exact price and policy version", () => {
    const truth = {
      templateCode: "P",
      templateVersion: "1",
      reviewId: "r",
      selectedComponentIds: ["a"],
      values: { x: 1 },
      measurements: [],
    };
    const subject = { kind: "PRODUCT_QUOTE" as const, organizationId: "org", requestId: "req", productCode: "P" };
    const hash = priceApprovalBindingHash({ subject, truth, netPrice: 100, installationNetPrice: null, policyVersion: 2 });
    expect(priceApprovalBindingHash({ subject, truth, netPrice: 101, installationNetPrice: null, policyVersion: 2 })).not.toBe(hash);
    expect(priceApprovalBindingHash({ subject, truth, netPrice: 100, installationNetPrice: null, policyVersion: 3 })).not.toBe(hash);
    expect(
      priceApprovalBindingHash({ subject: { ...subject, organizationId: "other" }, truth, netPrice: 100, installationNetPrice: null, policyVersion: 2 }),
    ).not.toBe(hash);

    const evaluation = evaluateOfferingPolicy({
      policy: policy("COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 50 }),
      actor: commercial,
      netPrice: 100,
      internalCost: null,
      internalCostComplete: false,
    });
    const approved: PriceApprovalRecord = {
      approvalId: "apr-1",
      subject,
      bindingHash: hash,
      policyVersion: 3,
      policyMode: "COMMERCIAL_APPROVAL_POLICY",
      netPrice: 100,
      installationNetPrice: null,
      currency: "EUR",
      internalCostComplete: false,
      triggeredRules: ["MAXIMUM_NET_VALUE"],
      status: "APPROVED",
      requestedByUserId: "u-c",
      requestedByLabel: "c@example.test",
      requestedAt: "2026-11-16T09:00:00.000Z",
      requestNote: null,
      decidedByUserId: "u-o",
      decidedByLabel: "o@example.test",
      decidedAt: "2026-11-16T09:05:00.000Z",
      decisionReason: "Client strategic",
    };
    expect(decideOfferingFreeze({ evaluation, bindingHash: hash, latestApproval: null })).toMatchObject({
      ok: false,
      error: "price_approval_required",
    });
    const ok = decideOfferingFreeze({ evaluation, bindingHash: hash, latestApproval: approved });
    expect(ok).toMatchObject({ ok: true, approval: { approvalId: "apr-1", approvedByUserId: "u-o" } });
    // An approval of an earlier version is never reused.
    expect(decideOfferingFreeze({ evaluation, bindingHash: "other", latestApproval: approved })).toMatchObject({
      ok: false,
      error: "price_approval_required",
    });
    expect(approvalViewFor(approved, "other").status).toBe("STALE");
    expect(
      decideOfferingFreeze({ evaluation, bindingHash: hash, latestApproval: { ...approved, status: "REJECTED" } }),
    ).toMatchObject({ ok: false, error: "price_approval_rejected" });

    if (!ok.ok) return;
    const record = frozenOfferingRecordFor({ evaluation, pricedByUserId: "u-c", pricedByRole: "member", approval: ok.approval });
    expect(isFrozenOfferingRecord(record)).toBe(true);
    expect(record.outcome).toBe("APPROVED_EXCEPTION");
    expect(isFrozenOfferingRecord({ ...record, approval: null })).toBe(false);
  });
});
