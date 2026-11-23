/**
 * Commercial & Financial V1 · defensive adapters from server transport to presentation models.
 * No business value is derived here: labels, outcomes, totals and margins come from the server.
 */
type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export type OfferingRules = {
  incompleteCostRequiresApproval: boolean;
  minimumMarginPercent: number | null;
  maximumNetValue: number | null;
};

export type OfferingPolicyView = {
  mode: string;
  modeLabel: string;
  rules: OfferingRules;
  version: number;
  source: string;
  createdAt: string | null;
  createdByLabel: string | null;
};

export type OfferingAdminModel = {
  policy: OfferingPolicyView;
  versions: OfferingPolicyView[];
  modes: { mode: string; label: string; summary?: string }[];
  openApprovals: number;
  /** Unissued quote variants whose approval a policy change would make stale. */
  affectedVariants: number;
};

/**
 * The four commercial modes as the page selects them. Control total is stored by the server as
 * the approval mode with its unconditional rule; here it is a choice of its own.
 */
export const CONTROL_TOTAL_MODE = "CONTROL_TOTAL";
const PAGE_MODE_BY_CONTROL_MODE: Record<string, string> = {
  OWNER_ONLY: "OWNER_ONLY",
  CONTROL_TOTAL: CONTROL_TOTAL_MODE,
  CONTROL_BY_RULES: "COMMERCIAL_APPROVAL_POLICY",
  COMMERCIAL_AUTONOMY: "COMMERCIAL_AUTONOMOUS",
};

function presentPolicy(value: unknown): OfferingPolicyView | null {
  const row = record(value);
  if (!row || typeof row.mode !== "string" || typeof row.version !== "number") return null;
  const rules = record(row.rules) ?? {};
  const controlTotal = row.controlMode === CONTROL_TOTAL_MODE;
  return {
    mode: controlTotal ? CONTROL_TOTAL_MODE : row.mode,
    modeLabel: text(row.controlModeLabel) ?? text(row.modeLabel) ?? row.mode,
    rules: {
      incompleteCostRequiresApproval: rules.incompleteCostRequiresApproval === true,
      minimumMarginPercent: num(rules.minimumMarginPercent),
      maximumNetValue: num(rules.maximumNetValue),
    },
    version: row.version,
    source: text(row.source) ?? "PLATFORM_DEFAULT",
    createdAt: text(row.createdAt),
    createdByLabel: text(row.createdByLabel),
  };
}

export function presentOfferingAdmin(value: unknown): OfferingAdminModel | null {
  const body = record(value);
  const policy = presentPolicy(body?.policy);
  if (!body || !policy) return null;
  return {
    policy,
    versions: list(body.versions).flatMap((row) => {
      const presented = presentPolicy(row);
      return presented ? [presented] : [];
    }),
    modes:
      list(body.controlModes).length > 0
        ? list(body.controlModes).flatMap((row) => {
            const item = record(row);
            const mode = item && typeof item.controlMode === "string" ? PAGE_MODE_BY_CONTROL_MODE[item.controlMode] : undefined;
            return item && mode
              ? [{ mode, label: text(item.label) ?? mode, ...(text(item.summary) ? { summary: text(item.summary) as string } : {}) }]
              : [];
          })
        : list(body.modes).flatMap((row) => {
            const item = record(row);
            return item && typeof item.mode === "string" ? [{ mode: item.mode, label: text(item.label) ?? item.mode }] : [];
          }),
    openApprovals: num(body.openApprovals) ?? 0,
    affectedVariants: num(body.affectedVariants) ?? 0,
  };
}

export type PriceApprovalItem = {
  approvalId: string;
  requestId: string;
  variantId: string | null;
  productCode: string | null;
  requestReference: string | null;
  customerLabel: string | null;
  status: string;
  statusLabel: string;
  netPrice: number | null;
  installationNetPrice: number | null;
  currency: string;
  internalCostComplete: boolean;
  triggeredRules: { id: string; label: string }[];
  policyModeLabel: string | null;
  requestedByLabel: string | null;
  requestedAt: string | null;
  requestNote: string | null;
  decidedByLabel: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
};

export function presentPriceApprovals(value: unknown): PriceApprovalItem[] {
  return list(record(value)?.approvals).flatMap((row) => {
    const item = record(row);
    if (!item || typeof item.approvalId !== "string") return [];
    return [
      {
        approvalId: item.approvalId,
        requestId: text(item.requestId) ?? "",
        variantId: text(item.variantId),
        productCode: text(item.productCode),
        requestReference: text(item.requestReference),
        customerLabel: text(item.customerLabel),
        status: text(item.status) ?? "",
        statusLabel: text(item.statusLabel) ?? "",
        netPrice: num(item.netPrice),
        installationNetPrice: num(item.installationNetPrice),
        currency: text(item.currency) ?? "EUR",
        internalCostComplete: item.internalCostComplete === true,
        triggeredRules: list(item.triggeredRules).flatMap((rule) => {
          const entry = record(rule);
          return entry && typeof entry.id === "string" ? [{ id: entry.id, label: text(entry.label) ?? entry.id }] : [];
        }),
        policyModeLabel: text(item.policyModeLabel),
        requestedByLabel: text(item.requestedByLabel),
        requestedAt: text(item.requestedAt),
        requestNote: text(item.requestNote),
        decidedByLabel: text(item.decidedByLabel),
        decidedAt: text(item.decidedAt),
        decisionReason: text(item.decisionReason),
      },
    ];
  });
}

/** What the configurator receives about the offering policy (no thresholds, no cost). */
export type OfferingView = {
  canSetPrice: boolean;
  blockedReason: string | null;
  modeLabel: string | null;
  outcome: "WITHIN_POLICY" | "APPROVAL_REQUIRED" | "NOT_PERMITTED" | null;
  outcomeMessage: string | null;
  approvalStatus: string | null;
  approvalStatusLabel: string | null;
  approvalDecisionReason: string | null;
  approvalDecidedByLabel: string | null;
  canRequestApproval: boolean;
};

export function presentOfferingView(value: unknown): OfferingView | null {
  const body = record(value);
  if (!body) return null;
  const policy = record(body.policy);
  const outcome = record(body.outcome);
  const approval = record(body.approval);
  const outcomeValue = text(outcome?.outcome);
  return {
    canSetPrice: policy?.canSetPrice === true,
    blockedReason: text(policy?.blockedReason),
    modeLabel: text(policy?.modeLabel),
    outcome:
      outcomeValue === "WITHIN_POLICY" || outcomeValue === "APPROVAL_REQUIRED" || outcomeValue === "NOT_PERMITTED"
        ? outcomeValue
        : null,
    outcomeMessage: text(outcome?.message),
    approvalStatus: text(approval?.status),
    approvalStatusLabel: text(approval?.statusLabel),
    approvalDecisionReason: text(approval?.decisionReason),
    approvalDecidedByLabel: text(approval?.decidedByLabel),
    canRequestApproval: body.canRequestApproval === true,
  };
}

export type CompanyField = { field: string; label: string };

export type CompanyIdentityModel = {
  configured: boolean;
  canEdit: boolean;
  version: number;
  values: Record<string, string>;
  fields: CompanyField[];
  completenessStatus: string;
  completenessLabel: string;
  missingRequiredLabels: string[];
  fiscalIdCheck: string | null;
};

export function presentCompanyIdentity(value: unknown): CompanyIdentityModel | null {
  const body = record(value);
  if (!body) return null;
  const seller = record(body.seller) ?? {};
  const fields = list(body.fields).flatMap((row) => {
    const item = record(row);
    return item && typeof item.field === "string" ? [{ field: item.field, label: text(item.label) ?? item.field }] : [];
  });
  const values: Record<string, string> = {};
  for (const { field } of fields) values[field] = text(seller[field]) ?? "";
  const completeness = record(body.completeness) ?? {};
  return {
    configured: body.configured === true,
    canEdit: body.canEdit === true,
    version: num(body.version) ?? 0,
    values,
    fields,
    completenessStatus: text(completeness.status) ?? "UNCONFIGURED",
    completenessLabel: text(completeness.statusLabel) ?? "",
    missingRequiredLabels: list(completeness.missingRequiredLabels).flatMap((item) =>
      typeof item === "string" ? [item] : [],
    ),
    fiscalIdCheck: text(body.fiscalIdCheck),
  };
}

export type CompanyVersion = {
  version: number;
  createdAt: string | null;
  createdByLabel: string | null;
  changedLabels: string[];
};

export function presentCompanyVersions(value: unknown): CompanyVersion[] {
  return list(record(value)?.versions).flatMap((row) => {
    const item = record(row);
    if (!item || typeof item.version !== "number") return [];
    return [
      {
        version: item.version,
        createdAt: text(item.createdAt),
        createdByLabel: text(item.createdByLabel),
        changedLabels: list(item.changedFields).flatMap((entry) => {
          const field = record(entry);
          return field ? [text(field.label) ?? text(field.field) ?? ""] : [];
        }),
      },
    ];
  });
}

export type FieldIssue = { field: string; label: string; reason: string };

export function presentFieldIssues(value: unknown, key: "issues" | "warnings"): FieldIssue[] {
  return list(record(value)?.[key]).flatMap((row) => {
    const item = record(row);
    return item && typeof item.field === "string"
      ? [{ field: item.field, label: text(item.label) ?? item.field, reason: text(item.reason) ?? "" }]
      : [];
  });
}

export type EconomicLine = {
  resourceId: string;
  label: string;
  /** Part of the assembly the line belongs to; null on a product job. */
  groupLabel: string | null;
  unit: string;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  plannedCost: number | null;
  operationalCost: number | null;
  difference: number | null;
  statusLabel: string;
  unknownReason: string | null;
};

export type JobEconomicsModel =
  | { available: false; reason: string }
  | {
      available: true;
      currency: string;
      scopeLabel: string;
      excludedScopeLabel: string | null;
      revenueNet: number | null;
      revenueLabel: string;
      estimatedTotal: number | null;
      estimatedCompletenessLabel: string;
      acceptedIncomplete: boolean;
      operationalTotal: number | null;
      plannedComparableTotal: number | null;
      differenceFromEstimate: number | null;
      operationalCompleteness: string;
      operationalCompletenessLabel: string;
      calculableCount: number;
      unavailableCount: number;
      confirmedCostLabel: string;
      estimatedMargin: number | null;
      estimatedMarginReason: string | null;
      operationalMargin: number | null;
      operationalMarginReason: string | null;
      executionLabel: string;
      /** Assembly job: lines carry the part they belong to and are shown grouped. */
      groupedByPart: boolean;
      lines: EconomicLine[];
      notes: string[];
    };

export function presentJobEconomics(value: unknown): JobEconomicsModel | null {
  const body = record(value);
  if (!body) return null;
  if (body.available !== true) {
    return { available: false, reason: text(body.reason) ?? "Comparația nu este disponibilă." };
  }
  const economics = record(body.economics);
  if (!economics) return null;
  const revenue = record(economics.revenue) ?? {};
  const estimated = record(economics.estimatedCost) ?? {};
  const operational = record(economics.operationalCost) ?? {};
  const estimatedMargin = record(economics.estimatedMargin) ?? {};
  const operationalMargin = record(economics.operationalMargin) ?? {};
  return {
    available: true,
    currency: text(economics.currency) ?? "EUR",
    scopeLabel: text(economics.scopeLabel) ?? "",
    excludedScopeLabel: text(economics.excludedScopeLabel),
    revenueNet: num(revenue.netPrice),
    revenueLabel: text(revenue.label) ?? "",
    estimatedTotal: num(estimated.total),
    estimatedCompletenessLabel: text(estimated.completenessLabel) ?? "",
    acceptedIncomplete: estimated.acceptedIncomplete === true,
    operationalTotal: num(operational.calculableTotal),
    plannedComparableTotal: num(operational.plannedComparableTotal),
    differenceFromEstimate: num(operational.differenceFromEstimate),
    operationalCompleteness: text(operational.completeness) ?? "UNAVAILABLE",
    operationalCompletenessLabel: text(operational.completenessLabel) ?? "",
    calculableCount: num(operational.calculableCount) ?? 0,
    unavailableCount: num(operational.unavailableCount) ?? 0,
    confirmedCostLabel: text(record(economics.confirmedCost)?.label) ?? "",
    estimatedMargin: num(estimatedMargin.value),
    estimatedMarginReason: text(estimatedMargin.unavailableReason),
    operationalMargin: num(operationalMargin.value),
    operationalMarginReason: text(operationalMargin.unavailableReason),
    executionLabel: text(economics.executionLabel) ?? "",
    groupedByPart: body.grouping === "PART",
    lines: list(economics.lines).flatMap((row) => {
      const line = record(row);
      if (!line || typeof line.resourceId !== "string") return [];
      return [
        {
          resourceId: line.resourceId,
          label: text(line.label) ?? line.resourceId,
          groupLabel: text(line.groupLabel),
          unit: text(line.unit) ?? "",
          plannedQuantity: num(line.plannedQuantity),
          actualQuantity: num(line.actualQuantity),
          plannedCost: num(line.plannedCost),
          operationalCost: num(line.operationalCost),
          difference: num(line.difference),
          statusLabel: text(line.statusLabel) ?? "",
          unknownReason: text(line.unknownReason),
        },
      ];
    }),
    notes: list(economics.notes).flatMap((item) => (typeof item === "string" ? [item] : [])),
  };
}
