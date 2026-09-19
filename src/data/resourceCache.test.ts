import { describe, expect, it, vi } from "vitest";
import {
  invalidateResources,
  loadResource,
  readResource,
  subscribeResource,
  writeResource,
} from "./resourceCache";

describe("resourceCache", () => {
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
