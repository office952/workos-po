import { describe, expect, it, vi, afterEach } from "vitest";
import { createHarnessCustomer, writeHarnessCostEvidence } from "./referenceSliceHarness";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reference slice harness orchestration", () => {
  it("creates the synthetic customer outside product surfaces", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      return jsonResponse({ customer: { customerId: "cus-harness" } }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createHarnessCustomer()).resolves.toBe("cus-harness");
    expect(String(fetchMock.mock.calls.at(0)?.[0])).toBe("/api/customers");
  });

  it("proves stale cost evidence from a second writer, not from operator UI", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/cost-evidence/row-old")) {
        return jsonResponse({ error: "stale_cost_evidence" }, 409);
      }
      if (url.includes("/cost-evidence/row-current")) {
        return jsonResponse({
          evidence: { evidenceRowId: "row-new" },
          admin: { writeState: "READY", costEvidence: [] },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(writeHarnessCostEvidence("row-current", 3.2)).resolves.toBe("row-new");
    await expect(writeHarnessCostEvidence("row-old", 3.2)).resolves.toBeNull();
    const stale = await fetch("/api/resources-admin/cost-evidence/row-old", {
      method: "PATCH",
      body: JSON.stringify({ amount: 3.2 }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "stale_cost_evidence" });
  });
});
