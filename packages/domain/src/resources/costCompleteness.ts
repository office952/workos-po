import type { ProductProcessComposition } from "../processes/composition.js";
import type { ProductAggregate } from "../product/types.js";
import {
  costEvidence,
  getResource,
  lookupCostEvidence,
  type CostEvidence,
  type CostEvidenceWhen,
} from "./catalog.js";
import {
  costEvidenceKeepsEicPartial,
  missingCostEvidenceReason,
  resourceRequirements,
} from "./eic.js";

export const COST_COMPLETENESS_ISSUE_TYPES = [
  "MISSING_COST_EVIDENCE",
  "MISSING_TECHNICAL_INPUT",
  "UNCALCULATED_COMPONENT",
  "PROVISIONAL_COST_EVIDENCE",
  "OTHER",
] as const;

export type CostCompletenessIssueType = (typeof COST_COMPLETENESS_ISSUE_TYPES)[number];

export type CostCompletenessIssue = {
  type: CostCompletenessIssueType;
  label: string;
  reason: string;
  resourceId?: string;
  componentLabel?: string;
  context?: string;
};

export const PROVISIONAL_COST_EVIDENCE_REASON = "Cost existent, dar neconfirmat";

export function isCostCompletenessIssueType(
  value: string,
): value is CostCompletenessIssueType {
  return (COST_COMPLETENESS_ISSUE_TYPES as readonly string[]).includes(value);
}

export function projectCostCompletenessIssues(
  aggregate: ProductAggregate,
  composition?: ProductProcessComposition,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): CostCompletenessIssue[] {
  const issues: CostCompletenessIssue[] = [];
  for (const requirement of resourceRequirements(aggregate, composition)) {
    const resource = getResource(requirement.resourceId);
    if (!resource) {
      continue;
    }
    const evidence = lookupCostEvidence(
      evidenceRows,
      requirement.resourceId,
      requirement.costQualifier,
    );
    const context = qualifierContext(requirement.costQualifier);
    if (!evidence) {
      issues.push({
        type: "MISSING_COST_EVIDENCE",
        resourceId: requirement.resourceId,
        label: resource.label,
        reason: missingCostEvidenceReason(
          requirement.resourceId,
          requirement.costQualifier,
        ),
        ...(context ? { context } : {}),
      });
      continue;
    }
    if (costEvidenceKeepsEicPartial(evidence)) {
      issues.push({
        type: "PROVISIONAL_COST_EVIDENCE",
        resourceId: requirement.resourceId,
        label: resource.label,
        reason: PROVISIONAL_COST_EVIDENCE_REASON,
        ...(context ? { context } : {}),
      });
    }
  }

  for (const component of aggregate.componentStatuses) {
    if (component.status === "CALCULATED") {
      continue;
    }
    const type =
      component.status === "MISSING_MEASUREMENT"
        ? "MISSING_TECHNICAL_INPUT"
        : "UNCALCULATED_COMPONENT";
    const reasons = component.unavailable.filter((reason) => reason.trim() !== "");
    if (reasons.length === 0) {
      issues.push({
        type,
        label: component.label,
        reason: component.label,
        componentLabel: component.label,
      });
      continue;
    }
    for (const reason of reasons) {
      issues.push({
        type,
        label: component.label,
        reason,
        componentLabel: component.label,
      });
    }
  }

  return uniqueIssues(issues);
}

function qualifierContext(when?: CostEvidenceWhen): string | undefined {
  if (when?.volumeDepthMm === undefined) {
    return undefined;
  }
  return `Adâncime ${when.volumeDepthMm} mm`;
}

function uniqueIssues(
  issues: readonly CostCompletenessIssue[],
): CostCompletenessIssue[] {
  const seen = new Set<string>();
  const unique: CostCompletenessIssue[] = [];
  for (const issue of issues) {
    const key = [issue.type, issue.resourceId ?? "", issue.reason, issue.label].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(issue);
  }
  return unique;
}
