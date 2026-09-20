import type { CostCompletenessIssueTransport } from "../api/types";
import { SectionLabel } from "../components/SectionLabel";
import { formatMoney } from "./format";

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

function IssueList({
  issues,
  showRate,
}: {
  issues: readonly CostCompletenessIssueTransport[];
  showRate: boolean;
}) {
  return (
    <ul className="cost-issue-list">
      {issues.map((issue) => {
        const action = issueAction(issue);
        return (
          <li
            key={`${issue.type}:${issue.resourceId ?? ""}:${issue.reason}`}
            className="cost-issue-list__item"
          >
            <p className="cost-issue-list__label">{issue.label}</p>
            {showRate && issue.rate !== null ? <p>{formatMoney(issue.rate, "EUR")}</p> : null}
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
  );
}

export function CostCompletenessIssues({ issues }: CostCompletenessIssuesProps) {
  const blocking = issues.filter((issue) => issue.impact === "BLOCKS_CALCULATION");
  const verification = issues.filter((issue) => issue.impact === "REQUIRES_VERIFICATION");
  if (blocking.length === 0 && verification.length === 0) {
    return null;
  }
  return (
    <div className="stack" data-testid="cost-completeness-issues">
      {blocking.length > 0 ? (
        <div id="cost-intern-gaps">
          <SectionLabel>Ce lipsește din cost</SectionLabel>
          <IssueList issues={blocking} showRate={false} />
        </div>
      ) : null}
      {verification.length > 0 ? (
        <div id="cost-intern-verification">
          <SectionLabel>Valori care necesită verificare</SectionLabel>
          <IssueList issues={verification} showRate />
        </div>
      ) : null}
    </div>
  );
}
