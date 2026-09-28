import { afterEach, describe, expect, it } from "vitest";
import {
  consumeCloudSessionExpiredMark,
  intendedReturnPath,
  isAuthEntryPath,
  loginErrorLabel,
  rememberCloudAuthenticated,
  resolveCloudAuthGate,
  resolvePostAuthenticationPath,
  safeAppPath,
} from "./cloudAuth";

afterEach(() => {
  sessionStorage.clear();
});

describe("safeAppPath", () => {
  it("rejects protocol and protocol-relative return paths", () => {
    expect(safeAppPath("/atelier")).toBe("/atelier");
    expect(safeAppPath("//evil.test")).toBeNull();
    expect(safeAppPath("https://evil.test")).toBeNull();
    expect(safeAppPath("\\windows")).toBeNull();
  });
});

describe("intendedReturnPath", () => {
  it("keeps a same-app path and search", () => {
    expect(intendedReturnPath("/atelier", "?from=inbox")).toBe("/atelier?from=inbox");
    expect(intendedReturnPath("https://evil.test")).toBe("/");
  });
});

describe("resolvePostAuthenticationPath", () => {
  it("sends auth-entry paths to the Launchpad", () => {
    expect(isAuthEntryPath("/login")).toBe(true);
    expect(isAuthEntryPath("/login/")).toBe(true);
    expect(isAuthEntryPath("/clienti")).toBe(false);
    expect(resolvePostAuthenticationPath("/login")).toBe("/");
    expect(resolvePostAuthenticationPath("/login/")).toBe("/");
    expect(resolvePostAuthenticationPath("/login", "?next=1")).toBe("/");
  });

  it("preserves valid product deep links and leaves arbitrary unknowns alone", () => {
    expect(resolvePostAuthenticationPath("/clienti")).toBe("/clienti");
    expect(resolvePostAuthenticationPath("/planificare", "?week=1")).toBe(
      "/planificare?week=1",
    );
    expect(resolvePostAuthenticationPath("/pagina-inexistenta")).toBe("/pagina-inexistenta");
  });
});

describe("resolveCloudAuthGate", () => {
  const base = {
    ready: true,
    unavailable: false,
    mode: "cloud" as const,
    authConfigured: true,
    user: { email: "owner@example.test" },
    organization: {
      organizationId: "org:a",
      displayName: "Atelier Alpha",
      membershipRole: "owner" as const,
    },
    sessionExpired: false,
  };

  it("keeps local single-plane open without a Cloud user", () => {
    expect(
      resolveCloudAuthGate({
        ...base,
        mode: "single_plane",
        user: null,
        organization: null,
      }),
    ).toBe("authenticated");
  });

  it("fails closed when Cloud auth is missing", () => {
    expect(
      resolveCloudAuthGate({
        ...base,
        authConfigured: false,
        user: null,
        organization: null,
      }),
    ).toBe("auth_config_missing");
  });

  it("separates expired sessions from first-visit login", () => {
    expect(
      resolveCloudAuthGate({
        ...base,
        user: null,
        organization: null,
        sessionExpired: false,
      }),
    ).toBe("unauthenticated");
    expect(
      resolveCloudAuthGate({
        ...base,
        user: null,
        organization: null,
        sessionExpired: true,
      }),
    ).toBe("session_expired");
  });

  it("shows boot and network before a Cloud decision", () => {
    expect(resolveCloudAuthGate({ ...base, ready: false })).toBe("boot");
    expect(resolveCloudAuthGate({ ...base, unavailable: true })).toBe("network");
  });
});

describe("loginErrorLabel", () => {
  it("keeps invalid credentials distinct from missing Cloud config", () => {
    expect(loginErrorLabel("invalid_credentials")).toBe("Email sau parolă greșită.");
    expect(loginErrorLabel("auth_config_missing")).toBe(
      "Autentificarea Cloud nu este configurată.",
    );
    expect(loginErrorLabel("unknown_code")).toBe("Autentificarea nu a reușit.");
    expect(loginErrorLabel("unknown_code")).not.toContain("unknown_code");
  });
});

describe("cloud authenticated mark", () => {
  it("consumes a previous authenticated mark once", () => {
    rememberCloudAuthenticated();
    expect(consumeCloudSessionExpiredMark()).toBe(true);
    expect(consumeCloudSessionExpiredMark()).toBe(false);
  });
});
