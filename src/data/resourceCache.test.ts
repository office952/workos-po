import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateAfterAssemblyMemberChange } from "./invalidation";
import {
  discardResourceCache,
  invalidateResources,
  loadResource,
  readResource,
  resetResourceCache,
  subscribeResource,
  writeResource,
} from "./resourceCache";
import { TransportError } from "../api/http";
import { resourceKeys } from "./resourceKeys";

afterEach(() => {
  resetResourceCache();
});

describe("resourceCache", () => {
  it.each([401, 403])("discards cached data when a refresh returns %i", async (status) => {
    writeResource("protected", "private value");
    await expect(loadResource("protected", () => Promise.reject(new TransportError("denied", status)), { force: true }))
      .rejects.toMatchObject({ status });
    expect(readResource("protected")).toMatchObject({ status: "error", data: undefined });
  });

  it("retains a last successful read on temporary failure", async () => {
    writeResource("temporary", "last read");
    await loadResource("temporary", () => Promise.reject(new TransportError("unavailable", 503)), { force: true }).catch(() => {});
    expect(readResource("temporary")).toMatchObject({ status: "error", data: "last read" });
  });

  it("discards previous-session values and late responses while keeping subscriptions", async () => {
    const listener = vi.fn();
    const stop = subscribeResource("customer-workspace:one", listener);
    writeResource("customer-workspace:one", "org A");
    let release!: (value: string) => void;
    const oldRead = loadResource("customer-workspace:one", () => new Promise<string>((resolve) => { release = resolve; }), { force: true });
    discardResourceCache();
    expect(readResource("customer-workspace:one")).toMatchObject({ status: "idle", data: undefined });
    await loadResource("customer-workspace:one", async () => "org B");
    release("late org A");
    await oldRead;
    expect(readResource("customer-workspace:one").data).toBe("org B");
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("deduplicates in-flight reads for the same key", async () => {
    let started = 0;
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async () => {
      started += 1;
      return gate;
    });

    const first = loadResource("demo", fetcher);
    const second = loadResource("demo", fetcher);
    expect(started).toBe(1);
    release("ok");
    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh resolved value without calling the fetcher again", async () => {
    const fetcher = vi.fn(async () => "cached");
    await expect(loadResource("reuse", fetcher)).resolves.toBe("cached");
    await expect(loadResource("reuse", fetcher)).resolves.toBe("cached");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readResource<string>("reuse")).toMatchObject({
      status: "success",
      data: "cached",
    });
  });

  it("refetches after explicit invalidation", async () => {
    const fetcher = vi.fn(async () => "next");
    writeResource("stale", "old");
    invalidateResources("stale");
    expect(readResource<string>("stale").updatedAt).toBeNull();
    await expect(loadResource("stale", fetcher, { force: true })).resolves.toBe("next");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readResource<string>("stale").data).toBe("next");
  });

  it("refetches observed resources immediately after invalidation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("old")
      .mockResolvedValueOnce("next");
    const stop = subscribeResource("stale-observed", vi.fn());
    await loadResource("stale-observed", fetcher);
    invalidateResources("stale-observed");
    await vi.waitFor(() => {
      expect(readResource<string>("stale-observed").data).toBe("next");
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
  });

  it("marks stale but does not refetch unobserved resources on explicit invalidation", async () => {
    const fetcher = vi.fn(async () => "v1");
    await loadResource("unobserved", fetcher);
    invalidateResources("unobserved");
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readResource<string>("unobserved")).toMatchObject({
      data: "v1",
      updatedAt: null,
    });
  });

  it("notifies subscribers when a value is written", () => {
    const listener = vi.fn();
    const stop = subscribeResource("written", listener);
    writeResource("written", 12);
    expect(listener).toHaveBeenCalled();
    expect(readResource<number>("written").data).toBe(12);
    stop();
  });

  it("survives repeated invalidation while unobserved", async () => {
    const fetcher = vi.fn(async () => "v1");
    await loadResource("repeat-unobserved", fetcher);
    invalidateResources("repeat-unobserved");
    invalidateResources("repeat-unobserved");
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readResource<string>("repeat-unobserved").updatedAt).toBeNull();
  });

  it("handles repeated invalidation for observed keys", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    const stop = subscribeResource("repeat-observed", vi.fn());
    await loadResource("repeat-observed", fetcher);
    invalidateResources("repeat-observed");
    invalidateResources("repeat-observed");
    await vi.waitFor(() => {
      expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(readResource<string>("repeat-observed").data).toBe("fresh");
    stop();
  });
});

describe("resourceCache assembly invalidation", () => {
  it("refreshes unobserved assembly data after member confirmation invalidation", async () => {
    const assemblyId = "asm:test";
    const key = resourceKeys.assembly(assemblyId);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ canConfirm: false })
      .mockResolvedValueOnce({ canConfirm: true });

    await loadResource(key, fetcher);
    expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(false);

    invalidateAfterAssemblyMemberChange(assemblyId);
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(true);
  });

  it("updates mounted assembly readers after invalidation", async () => {
    const assemblyId = "asm:mounted";
    const key = resourceKeys.assembly(assemblyId);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ canConfirm: false })
      .mockResolvedValueOnce({ canConfirm: true });
    const listener = vi.fn();

    subscribeResource(key, listener);
    await loadResource(key, fetcher);
    invalidateAfterAssemblyMemberChange(assemblyId);
    await vi.waitFor(() => {
      expect(readResource<{ canConfirm: boolean }>(key).data?.canConfirm).toBe(true);
    });
    expect(listener).toHaveBeenCalled();
  });
});
