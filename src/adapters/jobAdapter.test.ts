import { describe, expect, it } from "vitest";
import { presentJobList, presentJobOverview } from "./jobAdapter";

const row = { jobId: "job-1", productCode: "P", stage: "EXECUTION_IN_PROGRESS" };

describe("presentJobOverview", () => {
  it("exposes the operation counts the server sends and leaves them null otherwise", () => {
    const overview = presentJobOverview({
      overview: {
        summary: { total: 2, active: 2, inExecution: 1, needsAttention: 1, completed: 0 },
        jobs: [{ ...row, completedCount: 5, taskCount: 17, inProgressCount: 1, progressLabel: "5 / 17 finalizate" }, { ...row, jobId: "job-2", progressLabel: "3 / 9" }],
      },
    });
    expect(overview.summary).toEqual({ total: 2, active: 2, inExecution: 1, needsAttention: 1, completed: 0 });
    expect(overview.jobs[0]).toMatchObject({ completedCount: 5, taskCount: 17, inProgressCount: 1 });
    // A label is never parsed into numbers.
    expect(overview.jobs[1]).toMatchObject({ completedCount: null, taskCount: null, inProgressCount: null, progressLabel: "3 / 9" });
  });

  it("keeps the summary null when the payload has none and the list helper unchanged", () => {
    const payload = { overview: { jobs: [row] } };
    expect(presentJobOverview(payload).summary).toBeNull();
    expect(presentJobList(payload)).toHaveLength(1);
  });
});
