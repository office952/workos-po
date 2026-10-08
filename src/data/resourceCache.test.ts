import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateResources,
  loadResource,
  readResource,
  resetResourceCache,
  subscribeResource,
} from "./resourceCache";

afterEach(() => {
  resetResourceCache();
});

describe("resourceCache assembly invalidation", () => {
  it("refreshes unobserved assembly data after member confirmation invalidation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ canConfirm: false })
      .mockResolvedValueOnce({ canConfirm: true });

    const key = "assembly:asm:test";
    await loadResource(key, fetcher);
    expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(false);

    invalidateResources(key);
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(true);
  });

  it("updates mounted assembly readers after invalidation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ canConfirm: false })
      .mockResolvedValueOnce({ canConfirm: true });
    const key = "assembly:asm:mounted";
    const listener = vi.fn();

    subscribeResource(key, listener);
    await loadResource(key, fetcher);
    invalidateResources(key);
    await vi.waitFor(() => {
      expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(true);
    });
    expect(listener).toHaveBeenCalled();
  });
});
