import {
  COMMERCIAL_POLICY_DEFINITION,
  isConfigurationStatus,
} from "../configuration/contracts.js";
import {
  COMMERCIAL_CURRENCY,
  COMMERCIAL_ROUNDING,
  DEFAULT_COMMERCIAL_POLICY_ID,
  validateCommercialPolicy,
  type CommercialPolicy,
  type CommercialPolicyIssue,
  type CommercialPolicyStatus,
} from "./policy.js";

export type CommercialPolicyVersionRecord = {
  policyVersionRowId: string;
  policyId: string;
  version: number;
  status: CommercialPolicyStatus;
  label: string;
  markupPercent: number;
  vatPercent: number;
  defaultDiscountPercent: number;
  defaultAdjustment: number;
  currency: typeof COMMERCIAL_CURRENCY;
  rounding: typeof COMMERCIAL_ROUNDING;
  source: "ORGANIZATION";
  effectiveFrom: string;
  createdAt: string;
  supersedesVersion: number | null;
};

export type CommercialPolicyDraftValues = {
  markupPercent: number;
  vatPercent: number;
  defaultDiscountPercent: number;
  defaultAdjustment: number;
};

export type CommercialPolicySavePlan =
  | {
      ok: true;
      alreadyApplied: boolean;
      next: CommercialPolicyVersionRecord | null;
      retireVersion: number | null;
    }
  | { ok: false; issues: CommercialPolicyIssue[] };

export const ORGANIZATION_COMMERCIAL_POLICY_LABEL = "Politică comercială organizație";

export function validateCommercialPolicyDraft(
  values: CommercialPolicyDraftValues,
): CommercialPolicyIssue[] {
  return validateCommercialPolicy(policyFromDraft(values));
}

export function planCommercialPolicySave(
  existing: readonly CommercialPolicyVersionRecord[],
  values: CommercialPolicyDraftValues,
  input: { rowId: string; now: string },
): CommercialPolicySavePlan {
  const issues = validateCommercialPolicyDraft(values);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const active = existing.filter((row) => row.status === "ACTIVE");
  if (active.length > 1) {
    return {
      ok: false,
      issues: [
        {
          field: "status",
          reason: "Există mai multe versiuni active. Salvează din nou după corectare.",
        },
      ],
    };
  }

  const currentActive = active[0] ?? null;
  if (currentActive && sameEditableValues(currentActive, values)) {
    return { ok: true, alreadyApplied: true, next: null, retireVersion: null };
  }

  const latestVersion = existing.reduce(
    (max, row) => (row.version > max ? row.version : max),
    0,
  );
  const nextVersion = latestVersion + 1;
  const supersedesVersion = currentActive
    ? currentActive.version
    : latestVersion > 0
      ? latestVersion
      : null;

  return {
    ok: true,
    alreadyApplied: false,
    retireVersion: currentActive?.version ?? null,
    next: {
      policyVersionRowId: input.rowId,
      policyId: COMMERCIAL_POLICY_DEFINITION.definitionId,
      version: nextVersion,
      status: "ACTIVE",
      label: ORGANIZATION_COMMERCIAL_POLICY_LABEL,
      markupPercent: values.markupPercent,
      vatPercent: values.vatPercent,
      defaultDiscountPercent: values.defaultDiscountPercent,
      defaultAdjustment: values.defaultAdjustment,
      currency: COMMERCIAL_CURRENCY,
      rounding: COMMERCIAL_ROUNDING,
      source: "ORGANIZATION",
      effectiveFrom: input.now,
      createdAt: input.now,
      supersedesVersion,
    },
  };
}

export function isCommercialPolicyVersionRecord(
  value: unknown,
): value is CommercialPolicyVersionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as CommercialPolicyVersionRecord;
  return (
    typeof row.policyVersionRowId === "string" &&
    row.policyId === DEFAULT_COMMERCIAL_POLICY_ID &&
    Number.isInteger(row.version) &&
    row.version >= 1 &&
    isConfigurationStatus(row.status) &&
    row.currency === COMMERCIAL_CURRENCY &&
    row.rounding === COMMERCIAL_ROUNDING &&
    row.source === "ORGANIZATION" &&
    Number.isFinite(row.markupPercent) &&
    Number.isFinite(row.vatPercent) &&
    Number.isFinite(row.defaultDiscountPercent) &&
    Number.isFinite(row.defaultAdjustment)
  );
}

function policyFromDraft(values: CommercialPolicyDraftValues): CommercialPolicy {
  return {
    id: COMMERCIAL_POLICY_DEFINITION.definitionId,
    label: ORGANIZATION_COMMERCIAL_POLICY_LABEL,
    currency: COMMERCIAL_CURRENCY,
    markupPercent: values.markupPercent,
    vatPercent: values.vatPercent,
    rounding: COMMERCIAL_ROUNDING,
    defaultDiscountPercent: values.defaultDiscountPercent,
    defaultAdjustment: values.defaultAdjustment,
    version: 1,
    status: "ACTIVE",
  };
}

function sameEditableValues(
  row: CommercialPolicyVersionRecord,
  values: CommercialPolicyDraftValues,
): boolean {
  return (
    row.markupPercent === values.markupPercent &&
    row.vatPercent === values.vatPercent &&
    row.defaultDiscountPercent === values.defaultDiscountPercent &&
    row.defaultAdjustment === values.defaultAdjustment
  );
}
