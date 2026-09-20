import {
  CONFIGURATION_STATUSES,
  isConfigurationStatus,
  type ConfigurationStatus,
} from "../configuration/contracts.js";

export const DEFAULT_COMMERCIAL_POLICY_ID = "DEFAULT_COMMERCIAL_POLICY";
export const COMMERCIAL_CURRENCY = "EUR";
export const COMMERCIAL_ROUNDING = 0.01;
export const COMMERCIAL_POLICY_STATUSES = CONFIGURATION_STATUSES;
export type CommercialPolicyStatus = ConfigurationStatus;

export type CommercialPolicy = {
  id: string;
  label: string;
  currency: typeof COMMERCIAL_CURRENCY;
  markupPercent: number;
  vatPercent: number;
  rounding: number;
  defaultDiscountPercent: number;
  defaultAdjustment: number;
  version: number;
  status: CommercialPolicyStatus;
};

export const DEFAULT_COMMERCIAL_POLICY: CommercialPolicy = {
  id: DEFAULT_COMMERCIAL_POLICY_ID,
  label: "Politică comercială implicită",
  currency: COMMERCIAL_CURRENCY,
  markupPercent: 35,
  vatPercent: 21,
  rounding: COMMERCIAL_ROUNDING,
  defaultDiscountPercent: 0,
  defaultAdjustment: 0,
  version: 1,
  status: "ACTIVE",
};

export type CommercialPolicyIssue = {
  field: string;
  reason: string;
};

export function validateCommercialPolicy(
  policy: CommercialPolicy,
): CommercialPolicyIssue[] {
  const issues: CommercialPolicyIssue[] = [];
  if (policy.id.trim().length === 0) {
    issues.push({ field: "id", reason: "Politica comercială trebuie să aibă identitate." });
  }
  if (policy.currency !== COMMERCIAL_CURRENCY) {
    issues.push({
      field: "currency",
      reason: "Commercial V1 acceptă doar EUR.",
    });
  }
  if (!Number.isFinite(policy.markupPercent) || policy.markupPercent < 0) {
    issues.push({
      field: "markupPercent",
      reason: "Adaosul comercial nu poate fi negativ.",
    });
  }
  if (!Number.isFinite(policy.vatPercent) || policy.vatPercent < 0) {
    issues.push({
      field: "vatPercent",
      reason: "TVA nu poate fi negativ.",
    });
  }
  if (
    !Number.isFinite(policy.defaultDiscountPercent) ||
    policy.defaultDiscountPercent < 0 ||
    policy.defaultDiscountPercent > 100
  ) {
    issues.push({
      field: "defaultDiscountPercent",
      reason: "Discountul trebuie să fie între 0 și 100.",
    });
  }
  if (!Number.isFinite(policy.defaultAdjustment)) {
    issues.push({
      field: "defaultAdjustment",
      reason: "Ajustarea comercială trebuie să fie un număr.",
    });
  }
  if (policy.rounding !== COMMERCIAL_ROUNDING) {
    issues.push({
      field: "rounding",
      reason: "Rotunjirea V1 este 0,01 EUR.",
    });
  }
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    issues.push({
      field: "version",
      reason: "Versiunea politicii trebuie să fie un întreg pozitiv.",
    });
  }
  if (!isConfigurationStatus(policy.status)) {
    issues.push({
      field: "status",
      reason: "Starea politicii comerciale nu este validă.",
    });
  }
  return issues;
}

export function isCommercialPolicyStatus(
  value: string,
): value is CommercialPolicyStatus {
  return isConfigurationStatus(value);
}
