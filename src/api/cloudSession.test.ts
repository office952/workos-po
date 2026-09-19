import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCloudSession, loginCloud, logoutCloud, switchCloudOrganization } from "./cloudSession";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cloudSession transport", () => {
  it("reads the session snapshot from the Cloud contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mode: "cloud",
        user: { userId: "usr:1", email: "owner@example.test" },
        organization: {
          organizationId: "org:a",
          displayName: "Atelier Alpha",
          slug: "alpha",
          role: "owner",
        },
        memberships: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCloudSession()).resolves.toMatchObject({
      mode: "cloud",
      user: { email: "owner@example.test" },
      organization: { displayName: "Atelier Alpha" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cloud/session",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("posts login and logout to the authoritative endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mode: "cloud",
        user: { userId: "usr:1", email: "owner@example.test" },
        organization: {
          organizationId: "org:a",
          displayName: "Atelier Alpha",
          slug: "alpha",
          role: "owner",
        },
        memberships: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await loginCloud("owner@example.test", "OwnerPass12");
    await logoutCloud();
    await switchCloudOrganization("org:b");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cloud/login");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/cloud/logout");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/cloud/active-organization");
    const loginInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(loginInit.body))).toEqual({
      email: "owner@example.test",
      password: "OwnerPass12",
    });
  });
});
