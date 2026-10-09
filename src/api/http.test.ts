import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, sendJson, postForm, fetchDownload } from "./http";
import {
  restoreCloudUnauthorizedExpiry,
  advanceCloudBoundaryVersion,
  setCloudUnauthorizedHandler,
  suppressCloudUnauthorizedExpiry,
} from "../session/sessionExpiryBridge";

afterEach(() => {
  vi.unstubAllGlobals();
  setCloudUnauthorizedHandler(null);
  restoreCloudUnauthorizedExpiry();
});

describe("sendJson", () => {
  it.each([200, 401])("ignores a delayed %i response from a previous session", async (status) => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    let release!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = resolve; })));
    const pending = getJson("/api/customers");
    advanceCloudBoundaryVersion();
    release({ ok: status === 200, status, json: async () => ({ customers: ["old session"] }) });
    await expect(pending).rejects.toThrow("session_context_changed");
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["upload", "download"])("rejects an old session's delayed %s payload", async (kind) => {
    let release!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = resolve; })));
    const pending = kind === "upload" ? postForm("/api/requests/one/attachments", new FormData()) : fetchDownload("/api/files/one");
    advanceCloudBoundaryVersion();
    release({ ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(["private"]), headers: new Headers() });
    await expect(pending).rejects.toThrow("session_context_changed");
  });
  it("uses same-origin credentials and never stores the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendJson("POST", "/api/cloud/login", {
      email: "owner@example.test",
      password: "secret-pass",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/cloud/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "secret-pass",
      }),
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("does not treat a login 401 as session expiry", async () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_credentials" }),
      }),
    );

    await sendJson("POST", "/api/cloud/login", {
      email: "owner@example.test",
      password: "wrong",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("notifies when a protected read returns 401", async () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_session" }),
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not notify protected 401s while explicit logout owns the session", async () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    suppressCloudUnauthorizedExpiry();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_session" }),
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });
});
