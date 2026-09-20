import {
  COMMERCIAL_POLICY_DEFINITION,
  type ConfigurationSource,
} from "../configuration/contracts.js";
import {
  DEFAULT_COMMERCIAL_POLICY,
  DEFAULT_COMMERCIAL_POLICY_ID,
  type CommercialPolicy,
} from "./policy.js";
import type { CommercialPolicyVersionRecord } from "./policyVersion.js";

export type CommercialPolicySource = ConfigurationSource;

export type ResolvedCommercialPolicy = CommercialPolicy & {
  source: CommercialPolicySource;
  effectiveFrom: string | null;
  createdAt: string | null;
  supersedesVersion: number | null;
};

export const ORGANIZATION_POLICY_INACTIVE = "ORGANIZATION_POLICY_INACTIVE";

export const ORGANIZATION_POLICY_INACTIVE_REASON =
  "Organizația deține o politică comercială, dar nu există o versiune activă validă. Configurează politica înainte de a calcula prețuri noi.";

export const CODE_DEFAULT_POLICY_GUIDANCE =
  "Politica de sistem. Valorile nu au fost încă confirmate pentru această organizație.";

export type CommercialPolicyResolution =
  | { ok: true; policy: ResolvedCommercialPolicy }
  | {
      ok: false;
      error: typeof ORGANIZATION_POLICY_INACTIVE;
      reason: string;
      history: readonly CommercialPolicyVersionRecord[];
    };

export function policySourceOf(
  policy: CommercialPolicy | ResolvedCommercialPolicy,
): CommercialPolicySource {
  if ("source" in policy && (policy.source === "CODE_DEFAULT" || policy.source === "ORGANIZATION")) {
    return policy.source;
  }
  return "CODE_DEFAULT";
}

export function codeDefaultCommercialPolicy(): ResolvedCommercialPolicy {
  return {
    ...DEFAULT_COMMERCIAL_POLICY,
    id: COMMERCIAL_POLICY_DEFINITION.definitionId,
    source: "CODE_DEFAULT",
    effectiveFrom: null,
    createdAt: null,
    supersedesVersion: null,
  };
}

export function commercialPolicySourceLabel(source: CommercialPolicySource): string {
  switch (source) {
    case "CODE_DEFAULT":
      return "Politică de sistem";
    case "ORGANIZATION":
      return "Valori implicite ale firmei";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function resolveCommercialPolicy(
  versions: readonly CommercialPolicyVersionRecord[],
): CommercialPolicyResolution {
  if (versions.length === 0) {
    return { ok: true, policy: codeDefaultCommercialPolicy() };
  }
  const active = versions.filter((row) => row.status === "ACTIVE");
  if (active.length === 1) {
    return { ok: true, policy: resolvedFromOrganizationVersion(active[0]) };
  }
  return {
    ok: false,
    error: ORGANIZATION_POLICY_INACTIVE,
    reason: ORGANIZATION_POLICY_INACTIVE_REASON,
    history: versions,
  };
}

export function resolvedFromOrganizationVersion(
  row: CommercialPolicyVersionRecord,
): ResolvedCommercialPolicy {
  return {
    id: row.policyId,
    label: row.label,
    currency: row.currency,
    markupPercent: row.markupPercent,
    vatPercent: row.vatPercent,
    rounding: row.rounding,
    defaultDiscountPercent: row.defaultDiscountPercent,
    defaultAdjustment: row.defaultAdjustment,
    version: row.version,
    status: row.status,
    source: "ORGANIZATION",
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    supersedesVersion: row.supersedesVersion,
  };
}

export function isDefaultCommercialPolicyId(policyId: string): boolean {
  return policyId === DEFAULT_COMMERCIAL_POLICY_ID;
}
