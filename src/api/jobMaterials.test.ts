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

function preparation(status: "AVAILABLE" | "MISSING", quantity = 140, requiresReview = false) {
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

function postedKeys(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.flatMap((call) => {
    const init = call[1] as RequestInit | undefined;
    if (init?.method !== "POST" || typeof init.body !== "string") {
      return [];
    }
    const body = JSON.parse(init.body) as { actionKey?: string };
    return typeof body.actionKey === "string" ? [body.actionKey] : [];
  });
}

describe("submitJobMaterialDecision", () => {
  it("reuses the action key after a lost response and changes it when the quantity changes", async () => {
    let posts = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toContain("material-preparation");
      if (init?.method === "POST") {
        posts += 1;
        if (posts === 1) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        const body = JSON.parse(String(init.body)) as { requestedQuantity?: number };
        return response(preparation("MISSING", body.requestedQuantity ?? 140, false));
      }
      return response(preparation("MISSING"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
      requestedQuantity: 140,
    })).rejects.toThrow(/Failed to fetch/);

    await submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
      requestedQuantity: 140,
    });
    await submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
      requestedQuantity: 160,
    });

    const keys = postedKeys(fetchMock);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).not.toBe(keys[2]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{12,}$/i);
  });

  it("reconciles a conflicting replay by reading the current preparation", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toContain("material-preparation");
      if (init?.method === "POST") {
        return response({ error: "already_requested" }, 409);
      }
      return response(preparation("MISSING", 140, false));
    });
    vi.stubGlobal("fetch", fetchMock);

    const recovered = await submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
      requestedQuantity: 140,
    });
    expect(recovered.lines[0]?.openRequest?.requestedQuantity).toBe(140);
    expect(fetchMock.mock.calls.some((call) =>
      String(call[0]).includes("/material-preparation") &&
      (call[1] as RequestInit | undefined)?.method !== "POST",
    )).toBe(true);

    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toContain("material-preparation");
      if (init?.method === "POST") {
        return response({ error: "already_requested" }, 409);
      }
      return response(preparation("MISSING", 140, false));
    });
    await expect(submitJobMaterialDecision("job-1", "MAT-LED-MODULE", {
      status: "MISSING",
      requestedQuantity: 180,
    })).rejects.toBeInstanceOf(MaterialDecisionConflictError);
  });
});
