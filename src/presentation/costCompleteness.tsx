import type { CostCompletenessIssueTransport } from "../api/types";
import { SectionLabel } from "../components/SectionLabel";

type CostCompletenessIssuesProps = {
  issues: readonly CostCompletenessIssueTransport[];
};

function issueAction(
  issue: CostCompletenessIssueTransport,
): { href?: string; label: string } | null {
  switch (issue.type) {
    case "MISSING_COST_EVIDENCE":
    case "PROVISIONAL_COST_EVIDENCE":
      return { href: "/admin/resources", label: "Deschide Dovezi de cost" };
    case "MISSING_TECHNICAL_INPUT":
    case "UNCALCULATED_COMPONENT":
      return { href: "#configuratie", label: "Completează configurația" };
    case "OTHER":
      return null;
    default: {
      const exhaustive: never = issue.type;
      return exhaustive;
    }
  }
}

export function CostCompletenessIssues({ issues }: CostCompletenessIssuesProps) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <div className="stack" data-testid="cost-completeness-issues" id="cost-intern-gaps">
      <SectionLabel>Ce lipsește din cost</SectionLabel>
      <ul className="cost-issue-list">
        {issues.map((issue) => {
          const action = issueAction(issue);
          return (
            <li
              key={`${issue.type}:${issue.resourceId ?? ""}:${issue.reason}`}
              className="cost-issue-list__item"
            >
              <p className="cost-issue-list__label">{issue.label}</p>
              <p>{issue.reason}</p>
              {issue.context ? <p>{issue.context}</p> : null}
              {action?.href ? (
                <p>
                  <a className="text-link" href={action.href}>
                    {action.label}
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
