import { describe, expect, it } from "vitest";
import type { JobListItemTransport } from "../../api/types";
import {
  EMPTY_JOB_FILTERS,
  filterJobs,
  presentActiveIssueMark,
  type JobFilters,
} from "./jobRegistryModel";

const attentionFilter: JobFilters = { ...EMPTY_JOB_FILTERS, attention: true };

function job(overrides: Partial<JobListItemTransport> & Pick<JobListItemTransport, "jobId">): JobListItemTransport {
  return {
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "P",
    productLabel: "Produs",
    inscription: overrides.jobId,
    memberLabels: [],
    customerId: null,
    customerDisplayName: "Client",
    requestId: null,
    stage: "EXECUTION_IN_PROGRESS",
    stageLabel: "În lucru",
    nextAction: "CONTINUE_EXECUTION",
    nextActionLabel: "Urmărește producția",
    priority: "STANDARD",
    priorityLabel: "Standard",
    targetDate: null,
    targetDateLabel: "Fără termen",
    planningEditable: true,
    overdue: false,
    needsAttention: false,
    attentionLabel: null,
    activeIssueCount: 0,
    progressLabel: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    releaseSnapshotId: null,
    planId: "plan-1",
    orderSnapshotId: overrides.jobId,
    ...overrides,
  };
}

describe("presentActiveIssueMark", () => {
  it("shows the active count beside provider attention", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Lipsă utilaj dedicat",
        activeIssueCount: 1,
      }),
    ).toEqual({ text: "1 problemă", accessible: "1 problemă semnalată" });
  });

  it("shows the active count beside overdue attention", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Termen depășit",
        activeIssueCount: 1,
      }),
    ).toEqual({ text: "1 problemă", accessible: "1 problemă semnalată" });
  });

  it("does not duplicate a single-issue primary label", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Problemă semnalată",
        activeIssueCount: 1,
      }),
    ).toBeNull();
  });

  it("exposes the number when several issues are the primary reason", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Probleme semnalate",
        activeIssueCount: 3,
      }),
    ).toEqual({ text: "3", accessible: "3 probleme semnalate" });
  });

  it("hides the mark when every report is resolved", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Lipsă utilaj dedicat",
        activeIssueCount: 0,
      }),
    ).toBeNull();
  });

  it("still represents an active issue on a completed job", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Problemă semnalată",
        activeIssueCount: 1,
      }),
    ).toBeNull();
    expect(
      presentActiveIssueMark({
        attentionLabel: "Probleme semnalate",
        activeIssueCount: 2,
      }),
    ).toEqual({ text: "2", accessible: "2 probleme semnalate" });
  });

  it("hides the mark when there are no issues", () => {
    expect(presentActiveIssueMark({ attentionLabel: null, activeIssueCount: 0 })).toBeNull();
    expect(presentActiveIssueMark({ attentionLabel: null })).toBeNull();
  });

  it("shows a compact plural mark beside a non-issue reason", () => {
    expect(
      presentActiveIssueMark({
        attentionLabel: "Lipsă utilaj dedicat",
        activeIssueCount: 2,
      }),
    ).toEqual({ text: "2 probleme", accessible: "2 probleme semnalate" });
  });
});

describe("filterJobs Necesită acțiune", () => {
  const providerIssue = job({
    jobId: "provider-issue",
    needsAttention: true,
    attentionLabel: "Lipsă utilaj dedicat",
    activeIssueCount: 1,
  });
  const overdueIssue = job({
    jobId: "overdue-issue",
    overdue: true,
    needsAttention: true,
    attentionLabel: "Termen depășit",
    activeIssueCount: 1,
  });
  const onlyIssue = job({
    jobId: "only-issue",
    needsAttention: true,
    attentionLabel: "Problemă semnalată",
    activeIssueCount: 1,
  });
  const manyIssues = job({
    jobId: "many-issues",
    needsAttention: true,
    attentionLabel: "Probleme semnalate",
    activeIssueCount: 3,
  });
  const resolved = job({
    jobId: "resolved",
    needsAttention: false,
    attentionLabel: null,
    activeIssueCount: 0,
  });
  const completedIssue = job({
    jobId: "completed-issue",
    stage: "EXECUTION_COMPLETED",
    stageLabel: "Producție finalizată",
    nextAction: "VIEW_COMPLETED",
    nextActionLabel: "Lucrare finalizată",
    needsAttention: true,
    attentionLabel: "Problemă semnalată",
    activeIssueCount: 1,
  });
  const none = job({
    jobId: "none",
    needsAttention: false,
    attentionLabel: null,
    activeIssueCount: 0,
  });
  const items = [providerIssue, overdueIssue, onlyIssue, manyIssues, resolved, completedIssue, none];

  it("keeps provider, overdue, issue-only, multiple and completed-with-issue jobs", () => {
    expect(filterJobs(items, attentionFilter, "newest").map((row) => row.jobId)).toEqual([
      "provider-issue",
      "overdue-issue",
      "only-issue",
      "many-issues",
      "completed-issue",
    ]);
  });

  it("drops jobs whose issues are resolved and jobs with no issues", () => {
    const kept = new Set(filterJobs(items, attentionFilter, "newest").map((row) => row.jobId));
    expect(kept.has("resolved")).toBe(false);
    expect(kept.has("none")).toBe(false);
  });

  it("still keeps a job whose primary reason is not the issue itself", () => {
    const providerOnly = job({
      jobId: "provider-only",
      needsAttention: true,
      attentionLabel: "Lipsă utilaj dedicat",
      activeIssueCount: 0,
    });
    expect(filterJobs([providerOnly, resolved], attentionFilter, "newest").map((row) => row.jobId)).toEqual([
      "provider-only",
    ]);
  });
});
