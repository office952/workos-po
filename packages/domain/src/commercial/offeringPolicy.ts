import { canonicalContentHash } from "../production/snapshot.js";
import type { ProductTruth } from "../product/types.js";

/**
 * Commercial & Financial V1 · organization offering policy.
 *
 * The policy decides whether the Comercial role (`member`) may set the manual client price and
 * freeze a quote, and which quotes need the explicit approval of the Owner. It never changes the
 * price formula (manual net price, R-001A) and never exposes internal cost to the Comercial role:
 * evaluation runs on the server and the commercial projection carries only the outcome.
 *
 * No organization changes behaviour without an explicit Owner action: without a stored version the
 * effective policy is `OWNER_ONLY` (the pre-V1 behaviour). Thresholds have no invented defaults; a
 * rule is active only when the Owner enables it and enters its value.
 */
export const OFFERING_POLICY_MODES = [
  "OWNER_ONLY",
  "COMMERCIAL_AUTONOMOUS",
  "COMMERCIAL_APPROVAL_POLICY",
] as const;
export type OfferingPolicyMode = (typeof OFFERING_POLICY_MODES)[number];

export const OFFERING_POLICY_SCHEMA = "ORGANIZATION_OFFERING_POLICY_V1" as const;

export type OfferingPolicyRules = {
  /** Internal cost not COMPLETE ⇒ approval. */
  incompleteCostRequiresApproval: boolean;
  /** Net price below internal cost × (1 + percent / 100) ⇒ approval. `null` = rule off. */
  minimumMarginPercent: number | null;
  /** Net value above this amount (EUR, without VAT) ⇒ approval. `null` = rule off. */
  maximumNetValue: number | null;
  /**
   * Control total (Commercial Continuity V2): every quote priced by the Comercial role needs the
   * Owner's approval, whatever its value or margin. Absent or false on every earlier version.
   */
  everyOfferRequiresApproval?: boolean;
};

export type OfferingPolicy = {
  schema: typeof OFFERING_POLICY_SCHEMA;
  mode: OfferingPolicyMode;
  rules: OfferingPolicyRules;
  /** 0 = platform default (never stored). */
  version: number;
  source: "PLATFORM_DEFAULT" | "ORGANIZATION";
  createdAt: string | null;
  createdByUserId: string | null;
  createdByLabel: string | null;
};

export type OfferingPolicyInput = {
  mode: unknown;
  rules?: {
    incompleteCostRequiresApproval?: unknown;
    minimumMarginPercent?: unknown;
    maximumNetValue?: unknown;
    everyOfferRequiresApproval?: unknown;
  } | null;
};

export type OfferingPolicyIssue = { field: string; reason: string };

export const EMPTY_OFFERING_RULES: OfferingPolicyRules = {
  incompleteCostRequiresApproval: false,
  minimumMarginPercent: null,
  maximumNetValue: null,
};

export const DEFAULT_OFFERING_POLICY: OfferingPolicy = {
  schema: OFFERING_POLICY_SCHEMA,
  mode: "OWNER_ONLY",
  rules: EMPTY_OFFERING_RULES,
  version: 0,
  source: "PLATFORM_DEFAULT",
  createdAt: null,
  createdByUserId: null,
  createdByLabel: null,
};

export const OFFERING_MARGIN_PERCENT_MAX = 1000;
export const OFFERING_NET_VALUE_MAX = 100_000_000;

export function isOfferingPolicyMode(value: unknown): value is OfferingPolicyMode {
  return typeof value === "string" && (OFFERING_POLICY_MODES as readonly string[]).includes(value);
}

export function offeringPolicyModeLabel(mode: OfferingPolicyMode): string {
  switch (mode) {
    case "OWNER_ONLY":
      return "Doar Proprietarul stabilește prețul și îngheață oferta";
    case "COMMERCIAL_AUTONOMOUS":
      return "Comercialul stabilește prețul și îngheață oferta";
    case "COMMERCIAL_APPROVAL_POLICY":
      return "Comercialul ofertează după reguli; excepțiile cer aprobarea Proprietarului";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function readOptionalNumber(value: unknown): number | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return value;
}

/** Validates an Owner input. Approval mode needs at least one active rule (fail-closed). */
export function validateOfferingPolicyInput(
  input: OfferingPolicyInput,
): { ok: true; mode: OfferingPolicyMode; rules: OfferingPolicyRules } | { ok: false; issues: OfferingPolicyIssue[] } {
  const issues: OfferingPolicyIssue[] = [];
  if (!isOfferingPolicyMode(input.mode)) {
    issues.push({ field: "mode", reason: "Alege unul dintre modurile de ofertare." });
  }
  const raw = input.rules ?? {};
  const incomplete = raw.incompleteCostRequiresApproval;
  if (incomplete !== undefined && typeof incomplete !== "boolean") {
    issues.push({ field: "incompleteCostRequiresApproval", reason: "Valoarea regulii nu este validă." });
  }
  const margin = readOptionalNumber(raw.minimumMarginPercent);
  if (margin === false || (typeof margin === "number" && (margin < 0 || margin > OFFERING_MARGIN_PERCENT_MAX))) {
    issues.push({
      field: "minimumMarginPercent",
      reason: `Marja minimă trebuie să fie un număr între 0 și ${OFFERING_MARGIN_PERCENT_MAX}.`,
    });
  }
  const maxValue = readOptionalNumber(raw.maximumNetValue);
  if (maxValue === false || (typeof maxValue === "number" && (maxValue <= 0 || maxValue > OFFERING_NET_VALUE_MAX))) {
    issues.push({
      field: "maximumNetValue",
      reason: "Valoarea maximă trebuie să fie un număr pozitiv.",
    });
  }
  const everyOffer = raw.everyOfferRequiresApproval;
  if (everyOffer !== undefined && typeof everyOffer !== "boolean") {
    issues.push({ field: "everyOfferRequiresApproval", reason: "Valoarea regulii nu este validă." });
  }
  if (issues.length > 0) return { ok: false, issues };
  const mode = input.mode as OfferingPolicyMode;
  // Control total is the approval mode with the unconditional rule. The value and margin rules are
  // not stored with it: nothing may let a quote through without the Owner.
  const rules: OfferingPolicyRules =
    mode !== "COMMERCIAL_APPROVAL_POLICY"
      ? EMPTY_OFFERING_RULES
      : everyOffer === true
        ? { ...EMPTY_OFFERING_RULES, everyOfferRequiresApproval: true }
        : {
            incompleteCostRequiresApproval: incomplete === true,
            minimumMarginPercent: margin as number | null,
            maximumNetValue: maxValue as number | null,
          };
  if (mode === "COMMERCIAL_APPROVAL_POLICY" && !hasActiveOfferingRule(rules)) {
    return {
      ok: false,
      issues: [
        {
          field: "rules",
          reason: "Modul cu aprobare are nevoie de cel puțin o regulă activă, cu valoarea introdusă de tine.",
        },
      ],
    };
  }
  return { ok: true, mode, rules };
}

export function hasActiveOfferingRule(rules: OfferingPolicyRules): boolean {
  return (
    rules.everyOfferRequiresApproval === true ||
    rules.incompleteCostRequiresApproval ||
    rules.minimumMarginPercent !== null ||
    rules.maximumNetValue !== null
  );
}

/**
 * The four commercial modes an Owner chooses from. Control total is not a fourth stored mode: it
 * is the approval mode with the unconditional rule, so the approval mechanism stays single.
 */
export const OFFERING_CONTROL_MODES = ["OWNER_ONLY", "CONTROL_TOTAL", "CONTROL_BY_RULES", "COMMERCIAL_AUTONOMY"] as const;
export type OfferingControlMode = (typeof OFFERING_CONTROL_MODES)[number];

export function offeringControlMode(policy: Pick<OfferingPolicy, "mode" | "rules">): OfferingControlMode {
  switch (policy.mode) {
    case "OWNER_ONLY":
      return "OWNER_ONLY";
    case "COMMERCIAL_AUTONOMOUS":
      return "COMMERCIAL_AUTONOMY";
    case "COMMERCIAL_APPROVAL_POLICY":
      return policy.rules.everyOfferRequiresApproval === true ? "CONTROL_TOTAL" : "CONTROL_BY_RULES";
    default: {
      const _exhaustive: never = policy.mode;
      return _exhaustive;
    }
  }
}

export function offeringControlModeLabel(mode: OfferingControlMode): string {
  switch (mode) {
    case "OWNER_ONLY":
      return "Doar Proprietarul";
    case "CONTROL_TOTAL":
      return "Control total";
    case "CONTROL_BY_RULES":
      return "Control pe reguli";
    case "COMMERCIAL_AUTONOMY":
      return "Autonomie comercială";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** One sentence per mode: what the Comercial role may do. No thresholds, no internal values. */
export function offeringControlModeSummary(mode: OfferingControlMode): string {
  switch (mode) {
    case "OWNER_ONLY":
      return "Comercialul configurează. Prețul și oferta sunt ale Proprietarului.";
    case "CONTROL_TOTAL":
      return "Comercialul propune prețul. Fiecare ofertă a lui are nevoie de aprobarea Proprietarului.";
    case "CONTROL_BY_RULES":
      return "Comercialul emite în limitele firmei. Excepțiile au nevoie de aprobarea Proprietarului.";
    case "COMMERCIAL_AUTONOMY":
      return "Comercialul stabilește prețul și emite. Totul rămâne consemnat.";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function sameOfferingPolicy(
  current: Pick<OfferingPolicy, "mode" | "rules">,
  next: { mode: OfferingPolicyMode; rules: OfferingPolicyRules },
): boolean {
  return (
    current.mode === next.mode &&
    current.rules.incompleteCostRequiresApproval === next.rules.incompleteCostRequiresApproval &&
    current.rules.minimumMarginPercent === next.rules.minimumMarginPercent &&
    current.rules.maximumNetValue === next.rules.maximumNetValue &&
    (current.rules.everyOfferRequiresApproval === true) === (next.rules.everyOfferRequiresApproval === true)
  );
}

/** The actor whose request is evaluated. `canSetPriceByRole` = the fixed role grants it (Owner). */
export type OfferingActor = {
  canSetPriceByRole: boolean;
  /** Role may use the organization offering policy (Comercial). */
  mayUseOfferingPolicy: boolean;
};

export type OfferingPriceRight = {
  /** May enter / confirm the manual client price. */
  canSetPrice: boolean;
  /** Why not, in operator language (no internal values). */
  blockedReason: string | null;
};

export const OFFERING_OWNER_ONLY_REASON =
  "În această firmă, prețul și înghețarea ofertei sunt stabilite de Proprietar.";
export const OFFERING_NOT_PERMITTED_REASON =
  "Rolul tău nu poate stabili prețul ofertei.";

export function resolveOfferingPriceRight(
  policy: OfferingPolicy,
  actor: OfferingActor,
): OfferingPriceRight {
  if (actor.canSetPriceByRole) return { canSetPrice: true, blockedReason: null };
  if (!actor.mayUseOfferingPolicy) return { canSetPrice: false, blockedReason: OFFERING_NOT_PERMITTED_REASON };
  if (policy.mode === "OWNER_ONLY") return { canSetPrice: false, blockedReason: OFFERING_OWNER_ONLY_REASON };
  if (policy.mode === "COMMERCIAL_APPROVAL_POLICY" && !hasActiveOfferingRule(policy.rules)) {
    // A stored approval policy without rules cannot be evaluated: fail closed.
    return { canSetPrice: false, blockedReason: OFFERING_INCOMPLETE_POLICY_REASON };
  }
  return { canSetPrice: true, blockedReason: null };
}

export const OFFERING_INCOMPLETE_POLICY_REASON =
  "Regulile de ofertare ale firmei sunt incomplete. Proprietarul trebuie să le finalizeze.";

export const OFFERING_RULE_IDS = [
  "EVERY_OFFER",
  "INCOMPLETE_INTERNAL_COST",
  "MINIMUM_MARGIN",
  "MINIMUM_MARGIN_UNVERIFIABLE",
  "MAXIMUM_NET_VALUE",
] as const;
export type OfferingRuleId = (typeof OFFERING_RULE_IDS)[number];

export function offeringRuleLabel(rule: OfferingRuleId): string {
  switch (rule) {
    case "EVERY_OFFER":
      return "Politica firmei: fiecare ofertă a Comercialului se aprobă (Control total)";
    case "INCOMPLETE_INTERNAL_COST":
      return "Costul intern nu este complet";
    case "MINIMUM_MARGIN":
      return "Prețul net este sub marja minimă a firmei";
    case "MINIMUM_MARGIN_UNVERIFIABLE":
      return "Marja minimă nu poate fi verificată: costul intern nu este complet";
    case "MAXIMUM_NET_VALUE":
      return "Valoarea netă depășește limita fără aprobare";
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export type OfferingEvaluationInput = {
  policy: OfferingPolicy;
  actor: OfferingActor;
  /** Net client price of the whole quote (product + selected services), EUR without VAT. */
  netPrice: number;
  /** Internal cost of the same scope, from the engine. */
  internalCost: number | null;
  internalCostComplete: boolean;
};

export type OfferingOutcome = "WITHIN_POLICY" | "APPROVAL_REQUIRED" | "NOT_PERMITTED";

export type OfferingEvaluation = {
  outcome: OfferingOutcome;
  /** Owner-only detail. Never sent to the Comercial role. */
  triggeredRules: readonly OfferingRuleId[];
  policyVersion: number;
  policyMode: OfferingPolicyMode;
};

/**
 * Server-only evaluation. The Owner is never subject to the policy; the Comercial role is
 * evaluated against the effective version. Missing evidence fails closed (approval required).
 */
export function evaluateOfferingPolicy(input: OfferingEvaluationInput): OfferingEvaluation {
  const base = { policyVersion: input.policy.version, policyMode: input.policy.mode };
  if (input.actor.canSetPriceByRole) {
    return { ...base, outcome: "WITHIN_POLICY", triggeredRules: [] };
  }
  const right = resolveOfferingPriceRight(input.policy, input.actor);
  if (!right.canSetPrice) {
    return { ...base, outcome: "NOT_PERMITTED", triggeredRules: [] };
  }
  if (input.policy.mode === "COMMERCIAL_AUTONOMOUS") {
    return { ...base, outcome: "WITHIN_POLICY", triggeredRules: [] };
  }
  const rules = input.policy.rules;
  if (rules.everyOfferRequiresApproval === true) {
    // Control total: no value, margin or cost fact can let the Comercial role through.
    return { ...base, outcome: "APPROVAL_REQUIRED", triggeredRules: ["EVERY_OFFER"] };
  }
  const triggered: OfferingRuleId[] = [];
  const costKnown =
    input.internalCostComplete && typeof input.internalCost === "number" && Number.isFinite(input.internalCost);
  if (rules.incompleteCostRequiresApproval && !costKnown) {
    triggered.push("INCOMPLETE_INTERNAL_COST");
  }
  if (rules.minimumMarginPercent !== null) {
    if (!costKnown) {
      triggered.push("MINIMUM_MARGIN_UNVERIFIABLE");
    } else {
      const floor = roundMoney((input.internalCost as number) * (1 + rules.minimumMarginPercent / 100));
      if (input.netPrice < floor) triggered.push("MINIMUM_MARGIN");
    }
  }
  if (rules.maximumNetValue !== null && input.netPrice > rules.maximumNetValue) {
    triggered.push("MAXIMUM_NET_VALUE");
  }
  return {
    ...base,
    outcome: triggered.length > 0 ? "APPROVAL_REQUIRED" : "WITHIN_POLICY",
    triggeredRules: triggered,
  };
}

/** What the Comercial role may see: outcome and next action only. */
export type CommercialOfferingView = {
  outcome: OfferingOutcome;
  message: string;
};

export function commercialOfferingView(evaluation: OfferingEvaluation): CommercialOfferingView {
  switch (evaluation.outcome) {
    case "WITHIN_POLICY":
      return { outcome: "WITHIN_POLICY", message: "Oferta respectă regulile firmei." };
    case "APPROVAL_REQUIRED":
      // The mode is not a financial fact: naming it tells the Comercial why, without a threshold.
      return {
        outcome: "APPROVAL_REQUIRED",
        message: evaluation.triggeredRules.includes("EVERY_OFFER")
          ? "În această firmă, fiecare ofertă este aprobată de Proprietar înainte de emitere."
          : "Oferta necesită aprobarea Proprietarului înainte de înghețare.",
      };
    case "NOT_PERMITTED":
      return { outcome: "NOT_PERMITTED", message: OFFERING_OWNER_ONLY_REASON };
    default: {
      const _exhaustive: never = evaluation.outcome;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Price exception approvals
// ---------------------------------------------------------------------------------------------

export const PRICE_APPROVAL_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
export type PriceApprovalStatus = (typeof PRICE_APPROVAL_STATUSES)[number];

export const PRICE_APPROVAL_POLICY = "COMMERCIAL_PRICE_APPROVAL_V1" as const;
export const PRICE_APPROVAL_REASON_MAX_LENGTH = 500;

export type PriceApprovalSubject = {
  kind: "PRODUCT_QUOTE";
  organizationId: string;
  requestId: string;
  productCode: string;
  /**
   * The saved quote variant the approval is about (Commercial Continuity V2). Absent on every
   * approval requested before variants existed, so those binding hashes are unchanged.
   */
  variantId?: string;
};

/**
 * Binds an approval to the exact confirmed configuration, client price and evaluated policy
 * version. Any change makes the stored approval stale; it is never reused for another version.
 */
export function priceApprovalBindingHash(input: {
  subject: PriceApprovalSubject;
  truth: Pick<
    ProductTruth,
    "templateCode" | "templateVersion" | "reviewId" | "selectedComponentIds" | "values" | "measurements"
  >;
  netPrice: number;
  installationNetPrice: number | null;
  policyVersion: number;
}): string {
  return canonicalContentHash({
    policy: PRICE_APPROVAL_POLICY,
    subject: input.subject,
    templateCode: input.truth.templateCode,
    templateVersion: input.truth.templateVersion,
    reviewId: input.truth.reviewId,
    selectedComponentIds: input.truth.selectedComponentIds,
    values: input.truth.values,
    measurements: input.truth.measurements,
    netPrice: input.netPrice,
    installationNetPrice: input.installationNetPrice,
    policyVersion: input.policyVersion,
  });
}

export type PriceApprovalRecord = {
  approvalId: string;
  subject: PriceApprovalSubject;
  bindingHash: string;
  policyVersion: number;
  policyMode: OfferingPolicyMode;
  netPrice: number;
  installationNetPrice: number | null;
  currency: "EUR";
  internalCostComplete: boolean;
  triggeredRules: readonly OfferingRuleId[];
  status: PriceApprovalStatus;
  requestedByUserId: string;
  requestedByLabel: string;
  requestedAt: string;
  requestNote: string | null;
  decidedByUserId: string | null;
  decidedByLabel: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
};

export type FrozenPriceApproval = {
  policy: typeof PRICE_APPROVAL_POLICY;
  approvalId: string;
  bindingHash: string;
  policyVersion: number;
  approvedByUserId: string;
  approvedAt: string;
};

export function readApprovalReason(value: unknown, required: boolean): string | null | false {
  if (value === undefined || value === null) return required ? false : null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return required ? false : null;
  if (trimmed.length > PRICE_APPROVAL_REASON_MAX_LENGTH) return false;
  return trimmed;
}

export type FreezeOfferingDecision =
  | { ok: true; approval: FrozenPriceApproval | null }
  | { ok: false; error: "offering_not_permitted" | "price_approval_required" | "price_approval_rejected"; reasons: string[] };

/**
 * Decides whether a quote may be frozen under the evaluated policy. An approval counts only if it
 * is APPROVED and bound to the exact current binding hash.
 */
export function decideOfferingFreeze(input: {
  evaluation: OfferingEvaluation;
  bindingHash: string;
  latestApproval: PriceApprovalRecord | null;
}): FreezeOfferingDecision {
  if (input.evaluation.outcome === "WITHIN_POLICY") return { ok: true, approval: null };
  if (input.evaluation.outcome === "NOT_PERMITTED") {
    return { ok: false, error: "offering_not_permitted", reasons: [OFFERING_OWNER_ONLY_REASON] };
  }
  const approval = input.latestApproval;
  if (approval && approval.bindingHash === input.bindingHash) {
    if (approval.status === "APPROVED" && approval.decidedByUserId && approval.decidedAt) {
      return {
        ok: true,
        approval: {
          policy: PRICE_APPROVAL_POLICY,
          approvalId: approval.approvalId,
          bindingHash: approval.bindingHash,
          policyVersion: approval.policyVersion,
          approvedByUserId: approval.decidedByUserId,
          approvedAt: approval.decidedAt,
        },
      };
    }
    if (approval.status === "REJECTED") {
      return {
        ok: false,
        error: "price_approval_rejected",
        reasons: ["Proprietarul a respins această variantă de preț. Modifică oferta și cere din nou aprobarea."],
      };
    }
  }
  return {
    ok: false,
    error: "price_approval_required",
    reasons: ["Oferta necesită aprobarea Proprietarului înainte de înghețare."],
  };
}

export type ApprovalView = {
  status: PriceApprovalStatus | "NONE" | "STALE";
  statusLabel: string;
  requestedAt: string | null;
  requestedByLabel: string | null;
  decidedAt: string | null;
  decidedByLabel: string | null;
  decisionReason: string | null;
};

export function priceApprovalStatusLabel(status: ApprovalView["status"]): string {
  switch (status) {
    case "NONE":
      return "Fără solicitare";
    case "REQUESTED":
      return "Așteaptă aprobarea Proprietarului";
    case "APPROVED":
      return "Aprobată de Proprietar";
    case "REJECTED":
      return "Respinsă de Proprietar";
    case "WITHDRAWN":
      return "Retrasă";
    case "STALE":
      return "Oferta s-a schimbat după solicitare; cere din nou aprobarea";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Presentation of the latest approval for the current binding (no internal values). */
export function approvalViewFor(latest: PriceApprovalRecord | null, bindingHash: string | null): ApprovalView {
  if (!latest) {
    return {
      status: "NONE",
      statusLabel: priceApprovalStatusLabel("NONE"),
      requestedAt: null,
      requestedByLabel: null,
      decidedAt: null,
      decidedByLabel: null,
      decisionReason: null,
    };
  }
  const status = bindingHash !== null && latest.bindingHash !== bindingHash && latest.status !== "WITHDRAWN" ? "STALE" : latest.status;
  return {
    status,
    statusLabel: priceApprovalStatusLabel(status),
    requestedAt: latest.requestedAt,
    requestedByLabel: latest.requestedByLabel,
    decidedAt: latest.decidedAt,
    decidedByLabel: latest.decidedByLabel,
    decisionReason: latest.decisionReason,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// Frozen offering record (additive in the quote snapshot; absent on historical quotes)
// ---------------------------------------------------------------------------------------------

export const FROZEN_OFFERING_RECORD_POLICY = OFFERING_POLICY_SCHEMA;

export type FrozenOfferingRecord = {
  policy: typeof FROZEN_OFFERING_RECORD_POLICY;
  policyVersion: number;
  policyMode: OfferingPolicyMode;
  pricedByUserId: string;
  pricedByRole: "owner" | "member";
  outcome: "WITHIN_POLICY" | "APPROVED_EXCEPTION";
  approval: FrozenPriceApproval | null;
};

export function isFrozenOfferingRecord(value: unknown): value is FrozenOfferingRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    record.policy !== FROZEN_OFFERING_RECORD_POLICY ||
    typeof record.policyVersion !== "number" ||
    !Number.isInteger(record.policyVersion) ||
    record.policyVersion < 0 ||
    !isOfferingPolicyMode(record.policyMode) ||
    typeof record.pricedByUserId !== "string" ||
    record.pricedByUserId.trim() === "" ||
    (record.pricedByRole !== "owner" && record.pricedByRole !== "member") ||
    (record.outcome !== "WITHIN_POLICY" && record.outcome !== "APPROVED_EXCEPTION")
  ) {
    return false;
  }
  if (record.outcome === "WITHIN_POLICY") return record.approval === null;
  const approval = record.approval as Record<string, unknown> | null;
  return (
    approval !== null &&
    typeof approval === "object" &&
    approval.policy === PRICE_APPROVAL_POLICY &&
    typeof approval.approvalId === "string" &&
    typeof approval.bindingHash === "string" &&
    typeof approval.approvedByUserId === "string" &&
    typeof approval.approvedAt === "string" &&
    approval.policyVersion === record.policyVersion
  );
}

export function frozenOfferingRecordFor(input: {
  evaluation: OfferingEvaluation;
  pricedByUserId: string;
  pricedByRole: "owner" | "member";
  approval: FrozenPriceApproval | null;
}): FrozenOfferingRecord {
  return {
    policy: FROZEN_OFFERING_RECORD_POLICY,
    policyVersion: input.evaluation.policyVersion,
    policyMode: input.evaluation.policyMode,
    pricedByUserId: input.pricedByUserId,
    pricedByRole: input.pricedByRole,
    outcome: input.approval ? "APPROVED_EXCEPTION" : "WITHIN_POLICY",
    approval: input.approval ? { ...input.approval } : null,
  };
}
