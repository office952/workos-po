import { describe, expect, it } from "vitest";
import { presentCloudLoginResult, presentCloudSession } from "./cloudSessionAdapter";

const ownerMembership = {
  organizationId: "org:a",
  displayName: "Atelier Alpha",
  slug: "alpha",
  role: "owner",
  status: "ACTIVE",
};

describe("presentCloudSession", () => {
  it("treats an empty payload as controlled local mode", () => {
    expect(presentCloudSession({})).toEqual({
      mode: "single_plane",
      authConfigured: true,
      user: null,
      organization: null,
      memberships: [],
    });
  });

  it("keeps Cloud unconfigured distinct from a missing user", () => {
    expect(
      presentCloudSession({
        mode: "cloud",
        authConfigured: false,
        user: null,
        organization: null,
        memberships: [],
      }),
    ).toMatchObject({
      mode: "cloud",
      authConfigured: false,
      user: null,
      organization: null,
    });
  });

  it("presents only operator-facing identity and drops session secrets", () => {
    const presented = presentCloudSession({
      mode: "cloud",
      user: { userId: "usr:1", email: "owner@example.test" },
      organization: {
        organizationId: "org:a",
        displayName: "Atelier Alpha",
        slug: "alpha",
        role: "owner",
      },
      memberships: [ownerMembership],
      session: { sessionId: "sess:secret", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    expect(presented).toEqual({
      mode: "cloud",
      authConfigured: true,
      user: { email: "owner@example.test" },
      organization: { organizationId: "org:a", displayName: "Atelier Alpha" },
      memberships: [{ organizationId: "org:a", displayName: "Atelier Alpha" }],
    });
    expect(JSON.stringify(presented)).not.toContain("sess:secret");
    expect(JSON.stringify(presented)).not.toContain("usr:1");
    expect(JSON.stringify(presented.user)).not.toContain("userId");
  });

  it("fails closed when the organization has no human-readable name", () => {
    const presented = presentCloudSession({
      mode: "cloud",
      user: { userId: "usr:1", email: "owner@example.test" },
      organization: { organizationId: "org:a", displayName: "", slug: "alpha" },
    });
    expect(presented.organization).toBeNull();
  });

  it("omits disabled memberships from the switcher contract", () => {
    const presented = presentCloudSession({
      mode: "cloud",
      memberships: [
        ownerMembership,
        {
          organizationId: "org:b",
          displayName: "Atelier Beta",
          slug: "beta",
          role: "member",
          status: "DISABLED",
        },
      ],
    });
    expect(presented.memberships).toEqual([
      { organizationId: "org:a", displayName: "Atelier Alpha" },
    ]);
  });
});

describe("presentCloudLoginResult", () => {
  it("maps invalid credentials without exposing the request body", () => {
    const presented = presentCloudLoginResult({
      ok: false,
      status: 401,
      body: { error: "invalid_credentials" },
    });
    expect(presented).toEqual({
      ok: false,
      error: "invalid_credentials",
      memberships: [],
    });
  });

  it("keeps organization choices from the selection contract", () => {
    const presented = presentCloudLoginResult({
      ok: false,
      status: 409,
      body: {
        error: "organization_selection_required",
        memberships: [ownerMembership, { ...ownerMembership, organizationId: "org:b", displayName: "Atelier Beta" }],
      },
    });
    expect(presented).toEqual({
      ok: false,
      error: "organization_selection_required",
      memberships: [
        { organizationId: "org:a", displayName: "Atelier Alpha" },
        { organizationId: "org:b", displayName: "Atelier Beta" },
      ],
    });
  });
});
