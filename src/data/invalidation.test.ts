import { describe, expect, it, vi } from "vitest";
import {
  invalidateAfterAcceptQuote,
  invalidateAfterCreateOrder,
  invalidateAfterCreateExecutionPlan,
  invalidateAfterExecutionTaskChange,
  invalidateAfterFreezeQuote,
  invalidateAfterProductionRelease,
  invalidateAfterRequestDetailChange,
  invalidateAfterOperatorSessionChange,
  invalidateAfterPeopleAdminChange,
} from "./invalidation";
import { loadResource, readResource, subscribeResource } from "./resourceCache";
import { resourceKeys } from "./resourceKeys";

describe("customer projection updates", () => {
  it.each([
    ["request edit", () => invalidateAfterRequestDetailChange("req-one")],
    ["quote freeze", () => invalidateAfterFreezeQuote()],
    ["quote acceptance", () => invalidateAfterAcceptQuote("quote-one")],
    ["order creation", () => invalidateAfterCreateOrder("quote-one")],
    ["production release", () => invalidateAfterProductionRelease("job-one")],
    ["execution plan", () => invalidateAfterCreateExecutionPlan("job-one")],
    ["execution task", () => invalidateAfterExecutionTaskChange("plan-one")],
  ])("reads fresh registry and hub projections immediately after %s", async (_label, mutate) => {
    let revision = "before mutation";
    const readRegistry = vi.fn(async () => ({ revision }));
    const readHub = vi.fn(async () => ({ revision }));
    await loadResource(resourceKeys.customers(), readRegistry);
    await loadResource(resourceKeys.customerWorkspace("cus-one"), readHub);
    revision = "after mutation";
    (mutate as () => void)();
    expect(await loadResource(resourceKeys.customers(), readRegistry)).toEqual({ revision });
    expect(await loadResource(resourceKeys.customerWorkspace("cus-one"), readHub)).toEqual({ revision });
    expect(readRegistry).toHaveBeenCalledTimes(2);
    expect(readHub).toHaveBeenCalledTimes(2);
  });
});

describe("execution eligibility updates", () => {
  it.each([
    ["operator change", invalidateAfterOperatorSessionChange],
    ["qualification change", invalidateAfterPeopleAdminChange],
  ])("refreshes an open plan after %s and ignores the previous pending answer", async (_label, invalidate) => {
    const key = resourceKeys.executionPlan("plan-eligibility");
    const stop = subscribeResource(key, vi.fn());
    let resolveOld!: (value: { canClaimStart: boolean }) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ canClaimStart: true });
    try {
      const oldRequest = loadResource(key, fetcher);
      invalidate();
      await vi.waitFor(() => expect(readResource(key).data).toEqual({ canClaimStart: true }));
      resolveOld({ canClaimStart: false });
      await oldRequest;
      expect(readResource(key).data).toEqual({ canClaimStart: true });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
