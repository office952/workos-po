import { describe, expect, it, vi } from "vitest";
import {
  invalidateAfterAcceptQuote,
  invalidateAfterCreateOrder,
  invalidateAfterCreateExecutionPlan,
  invalidateAfterExecutionTaskChange,
  invalidateAfterFreezeQuote,
  invalidateAfterProductionRelease,
  invalidateAfterRequestDetailChange,
} from "./invalidation";
import { loadResource } from "./resourceCache";
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
