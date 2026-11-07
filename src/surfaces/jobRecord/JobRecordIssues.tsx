import { useState } from "react";
import type { JobIssue, JobRecord } from "../../api/jobRecord";
import { acknowledgeTaskIssue, resolveTaskIssue } from "../../api/taskDossier";
import { Button } from "../../components/Button";
import { InlineAlert } from "../../components/InlineAlert";
import { invalidateAfterIssueChange } from "../../data/invalidation";
import { moment } from "./format";
import { Heading, RecordIcon } from "./presentation";

export function JobRecordIssues({
  record,
  operationHref,
}: {
  record: JobRecord;
  operationHref: (id: string) => string;
}) {
  const issues = record.issues ?? [];
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (issues.length === 0) {
    return null;
  }

  async function run(issue: JobIssue, action: "ACKNOWLEDGE" | "RESOLVE"): Promise<void> {
    setPendingId(issue.entryId);
    setError(null);
    try {
      if (action === "ACKNOWLEDGE") {
        await acknowledgeTaskIssue(issue.taskId, issue.entryId);
      } else {
        await resolveTaskIssue(issue.taskId, issue.entryId);
      }
      invalidateAfterIssueChange();
    } catch {
      setError(
        action === "ACKNOWLEDGE"
          ? "Preluarea problemei a eșuat. Ultima citire rămâne afișată."
          : "Rezolvarea problemei a eșuat. Ultima citire rămâne afișată.",
      );
    } finally {
      setPendingId(null);
    }
  }

  const activeCount = issues.filter((issue) => issue.status !== "RESOLVED").length;
  return (
    <section className="job-record__section job-record__issues" aria-label="Probleme semnalate">
      <header>
        <div>
          <Heading icon="warning">Probleme semnalate</Heading>
          <p>Starea, operația afectată, motivul și cine a înregistrat fiecare tranziție.</p>
        </div>
        <span className="job-record__count">
          {activeCount === 0
            ? `${issues.length} rezolvate`
            : activeCount === 1
              ? "1 deschisă sau preluată"
              : `${activeCount} deschise sau preluate`}
        </span>
      </header>
      {error ? (
        <InlineAlert tone="error" title="Acțiunea nu a fost finalizată">
          {error}
        </InlineAlert>
      ) : null}
      <ul className="job-record__issue-list">
        {issues.map((issue) => (
          <li key={issue.entryId}>
            <article className="job-record__issue" data-issue-status={issue.status}>
              <header>
                <RecordIcon kind="warning" />
                <div>
                  <p className="job-record__issue-head">
                    <span className="job-record__status" data-status={issue.status}>
                      {issue.statusLabel}
                    </span>
                    {issue.reasonLabel ? <span className="job-record__issue-reason">{issue.reasonLabel}</span> : null}
                  </p>
                  {issue.taskId ? (
                    <a href={operationHref(issue.taskId)}>{issue.taskLabel ?? "Deschide operația"}</a>
                  ) : null}
                </div>
              </header>
              <p>{issue.body}</p>
              <p className="job-record__note">
                Semnalată de {issue.authorLabel ?? "Cont organizație"} · {moment(issue.createdAt)}
              </p>
              {issue.acknowledgedAt ? (
                <p className="job-record__note">
                  Preluată de {issue.acknowledgedByLabel ?? "Cont organizație"} · {moment(issue.acknowledgedAt)}
                </p>
              ) : null}
              {issue.resolvedAt ? (
                <p className="job-record__note">
                  Rezolvată de {issue.resolvedByLabel ?? "Cont organizație"} · {moment(issue.resolvedAt)}
                </p>
              ) : null}
              {issue.history.length > 1 ? (
                <ol className="job-record__issue-history">
                  {issue.history.map((event, index) => (
                    <li key={`${event.kind}-${event.occurredAt}-${index}`}>
                      {event.label} · {event.actorLabel ?? "Cont organizație"} · {moment(event.occurredAt)}
                    </li>
                  ))}
                </ol>
              ) : null}
              {issue.canAcknowledge || issue.canResolve ? (
                <div className="job-record__issue-actions">
                  {issue.canAcknowledge ? (
                    <Button
                      variant="secondary"
                      disabled={pendingId === issue.entryId}
                      onClick={() => void run(issue, "ACKNOWLEDGE")}
                    >
                      Preia problema
                    </Button>
                  ) : null}
                  {issue.canResolve ? (
                    <Button
                      variant="secondary"
                      disabled={pendingId === issue.entryId}
                      onClick={() => void run(issue, "RESOLVE")}
                    >
                      Marchează rezolvată
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
