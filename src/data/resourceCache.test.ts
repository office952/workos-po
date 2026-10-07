import { describe, expect, it, vi } from "vitest";
import {
  discardResourceCache,
  invalidateResources,
  loadResource,
  readResource,
  subscribeResource,
  writeResource,
} from "./resourceCache";
import { TransportError } from "../api/http";

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

  it("notifies subscribers when a value is written", () => {
    const listener = vi.fn();
    const stop = subscribeResource("written", listener);
    writeResource("written", 12);
    expect(listener).toHaveBeenCalled();
    expect(readResource<number>("written").data).toBe(12);
    stop();
  });
});
