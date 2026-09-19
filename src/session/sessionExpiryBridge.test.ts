import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublicCloudSessionPath,
  notifyCloudUnauthorized,
  notifyCloudUnauthorizedUnlessPublic,
  restoreCloudUnauthorizedExpiry,
  setCloudUnauthorizedHandler,
  suppressCloudUnauthorizedExpiry,
} from "./sessionExpiryBridge";

afterEach(() => {
  setCloudUnauthorizedHandler(null);
  restoreCloudUnauthorizedExpiry();
});

describe("sessionExpiryBridge", () => {
  it("treats health and Cloud session routes as public", () => {
    expect(isPublicCloudSessionPath("/api/health")).toBe(true);
    expect(isPublicCloudSessionPath("/api/cloud/login")).toBe(true);
    expect(isPublicCloudSessionPath("/api/cloud/session")).toBe(true);
    expect(isPublicCloudSessionPath("/api/cloud/logout")).toBe(true);
    expect(isPublicCloudSessionPath("/api/customers")).toBe(false);
  });

  it("notifies only for protected 401 responses", () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    notifyCloudUnauthorizedUnlessPublic("/api/cloud/login", 401);
    notifyCloudUnauthorizedUnlessPublic("/api/customers", 403);
    notifyCloudUnauthorizedUnlessPublic("/api/customers", 401);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("can be cleared", () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    setCloudUnauthorizedHandler(null);
    notifyCloudUnauthorized();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify after an explicit logout owns the unauthenticated state", () => {
    const handler = vi.fn();
    setCloudUnauthorizedHandler(handler);
    suppressCloudUnauthorizedExpiry();
    notifyCloudUnauthorizedUnlessPublic("/api/customers", 401);
    expect(handler).not.toHaveBeenCalled();
    restoreCloudUnauthorizedExpiry();
    notifyCloudUnauthorizedUnlessPublic("/api/customers", 401);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
