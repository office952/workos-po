import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MaterialDecisionConflictError,
  resetPendingJobMaterialActionKeys,
  submitJobMaterialDecision,
} from "./jobMaterials";

afterEach(() => {
  resetPendingJobMaterialActionKeys();
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function preparation(status: "AVAILABLE" | "MISSING", quantity: number | null = null, requiresReview = false) {
  return {
    preparation: {
      jobId: "job-1",
      planId: "exp:1",
      lines: [
        {
          resourceId: "MAT-LED-MODULE",
          label: "Modul LED 12V",
          unit: "buc",
          estimatedQuantity: 125,
          taskIds: ["task-led"],
          canCheck: true,
          latestCheck: {
            status,
            checkedByLabel: "Maria Ansamblu Demo",
            checkedAt: "2026-10-16T01:39:00.000Z",
          },
          openRequest: status === "MISSING" || requiresReview
            ? {
                requestId: "mreq:1",
                requestedQuantity: quantity,
                unit: "buc",
                status: "REQUESTED",
                requestedByLabel: "Maria Ansamblu Demo",
                requestedAt: "2026-10-16T01:39:00.000Z",
                requiresReview,
              }
            : null,
        },
      ],
    },
  };
}

function postedBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.flatMap((call) => {
    const init = call[1] as RequestInit | undefined;
    if (init?.method !== "POST" || typeof init.body !== "string") {
      return [];
    }
    return [JSON.parse(init.body) as Record<string, unknown>];
  });
}

describe("submitJobMaterialDecision", () => {
  it("reuses the action key after a lost response and does not send a purchase quantity", async () => {
    let posts = 0;
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        if (posts === 1) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return response(preparation("MISSING", null, false));
      }
      return response(preparation("MISSING"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
    })).rejects.toThrow(/Failed to fetch/);

    await submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
    });
    await submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "AVAILABLE",
    });

    const bodies = postedBodies(fetchMock);
    expect(bodies).toHaveLength(3);
    expect(bodies.every((body) => !("requestedQuantity" in body))).toBe(true);
    expect(bodies[0]?.actionKey).toBe(bodies[1]?.actionKey);
    expect(bodies[1]?.actionKey).not.toBe(bodies[2]?.actionKey);
    expect(bodies[0]?.actionKey).toMatch(/^[0-9a-f-]{12,}$/i);
  });

  it("treats another operator's existing request as a conflict, not as this attempt's success", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        return response({ error: "already_requested" }, 409);
      }
      return response(preparation("MISSING", null, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
    })).rejects.toBeInstanceOf(MaterialDecisionConflictError);
    expect(fetchMock.mock.calls.some((call) =>
      (call[1] as RequestInit | undefined)?.method !== "POST",
    )).toBe(true);
  });
});
