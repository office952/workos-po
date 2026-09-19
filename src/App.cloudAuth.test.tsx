import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { notifyCloudUnauthorizedUnlessPublic } from "./session/sessionExpiryBridge";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const health = {
  status: "ok",
  service: "workos-final-api",
  apiContractId: "workos-ui-contract-v1",
};

const authenticatedSession = {
  mode: "cloud" as const,
  user: { userId: "usr:1", email: "owner@example.test" },
  organization: {
    organizationId: "org:a",
    displayName: "Atelier Alpha",
    slug: "alpha",
    role: "owner",
  },
  memberships: [
    {
      organizationId: "org:a",
      displayName: "Atelier Alpha",
      slug: "alpha",
      role: "owner",
      status: "ACTIVE",
    },
  ],
};

function installFetch(
  handler: (url: string, method: string, body: unknown) => Promise<unknown> | unknown,
) {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    const rawBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    return Promise.resolve(handler(url, method, rawBody)).then((result) => {
      if (
        result &&
        typeof result === "object" &&
        "json" in result &&
        "status" in result
      ) {
        return result;
      }
      return jsonResponse(result);
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("App Cloud auth integration", () => {
  it("keeps controlled local mode open without a login gate", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return { mode: "single_plane", user: null, organization: null, memberships: [] };
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      if (url.endsWith("/api/customers")) {
        return { customers: [] };
      }
      return {};
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autentificare" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ieși din cont" })).not.toBeInTheDocument();
  });

  it("shows a boot gate until the session read settles", async () => {
    let releaseSession!: (value: unknown) => void;
    const sessionGate = new Promise((resolve) => {
      releaseSession = resolve;
    });
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return sessionGate.then(() => ({
          mode: "cloud",
          user: null,
          organization: null,
          memberships: [],
        }));
      }
      return health;
    });

    render(<App />);
    expect(screen.getByRole("heading", { name: "Se încarcă" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    releaseSession(null);
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
  });

  it("enters the application after a successful Cloud login", async () => {
    let session: unknown = { mode: "cloud", user: null, organization: null, memberships: [] };
    installFetch((url, method) => {
      if (url.endsWith("/api/cloud/login") && method === "POST") {
        session = authenticatedSession;
        return authenticatedSession;
      }
      if (url.endsWith("/api/cloud/session")) {
        return session;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Intră" }));
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByText("OwnerPass12")).not.toBeInTheDocument();
  });

  it("shows the Cloud login gate when the session is empty", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return { mode: "cloud", user: null, organization: null, memberships: [] };
      }
      return health;
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clienți" })).not.toBeInTheDocument();
    expect(screen.queryByText("/api/cloud/session")).not.toBeInTheDocument();
  });

  it("shows organization and user after a successful Cloud session", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return authenticatedSession;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      if (url.endsWith("/api/customers")) {
        return { customers: [] };
      }
      return {};
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);

    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Organizație activă")).not.toBeInTheDocument();
    expect(screen.queryByText("usr:1")).not.toBeInTheDocument();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
  });

  it("offers organization switching when the session has multiple memberships", async () => {
    const switchMock = vi.fn();
    installFetch((url, method, body) => {
      if (url.endsWith("/api/cloud/session")) {
        return {
          ...authenticatedSession,
          memberships: [
            authenticatedSession.memberships[0],
            {
              organizationId: "org:b",
              displayName: "Atelier Beta",
              slug: "beta",
              role: "member",
              status: "ACTIVE",
            },
          ],
        };
      }
      if (url.endsWith("/api/cloud/active-organization") && method === "POST") {
        switchMock(body);
        return {
          ...authenticatedSession,
          organization: {
            ...authenticatedSession.organization,
            organizationId: "org:b",
            displayName: "Atelier Beta",
          },
          memberships: [
            authenticatedSession.memberships[0],
            {
              organizationId: "org:b",
              displayName: "Atelier Beta",
              slug: "beta",
              role: "member",
              status: "ACTIVE",
            },
          ],
        };
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    const select = await screen.findByLabelText("Organizație activă");
    await userEvent.selectOptions(select, "org:b");
    await waitFor(() => {
      expect(switchMock).toHaveBeenCalledWith({ organizationId: "org:b" });
      expect(select).toHaveValue("org:b");
    });
  });

  it("logs out through the Cloud contract and returns to the login gate", async () => {
    let session: unknown = authenticatedSession;
    const fetchMock = installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return session;
      }
      if (url.endsWith("/api/cloud/logout")) {
        session = { mode: "cloud", user: null, organization: null, memberships: [] };
        return { ok: true };
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/api/cloud/logout") && String(init?.method) === "POST")).toBe(true);
    notifyCloudUnauthorizedUnlessPublic("/api/customers", 401);
    notifyCloudUnauthorizedUnlessPublic("/api/requests", 401);
    expect(screen.queryByText("Sesiunea a expirat. Autentifică-te din nou.")).not.toBeInTheDocument();
    expect(screen.queryByText("Sesiune expirată")).not.toBeInTheDocument();
  });

  it("keeps a clean login after logout even if the page remounts", async () => {
    let session: unknown = authenticatedSession;
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return session;
      }
      if (url.endsWith("/api/cloud/logout")) {
        session = { mode: "cloud", user: null, organization: null, memberships: [] };
        return { ok: true };
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    const first = render(<App />);
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    first.unmount();

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    expect(screen.queryByText("Sesiunea a expirat. Autentifică-te din nou.")).not.toBeInTheDocument();
  });

  it("returns to the application after login following an explicit logout", async () => {
    let session: unknown = authenticatedSession;
    installFetch((url, method) => {
      if (url.endsWith("/api/cloud/login") && method === "POST") {
        session = authenticatedSession;
        return authenticatedSession;
      }
      if (url.endsWith("/api/cloud/session")) {
        return session;
      }
      if (url.endsWith("/api/cloud/logout")) {
        session = { mode: "cloud", user: null, organization: null, memberships: [] };
        return { ok: true };
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Intră" }));
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autentificare" })).not.toBeInTheDocument();
  });

  it("turns a protected 401 into the expired-session gate", async () => {
    let releaseCustomers!: (value: unknown) => void;
    const customersGate = new Promise((resolve) => {
      releaseCustomers = resolve;
    });
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return authenticatedSession;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      if (url.endsWith("/api/customers")) {
        return customersGate.then(() => ({
          ok: false,
          status: 401,
          json: async () => ({ error: "invalid_session" }),
        }));
      }
      return {};
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    releaseCustomers(null);
    expect(await screen.findByText("Sesiunea a expirat. Autentifică-te din nou.")).toBeInTheDocument();
    expect(screen.queryByText("Email sau parolă greșită.")).not.toBeInTheDocument();
  });

  it("blocks Cloud mode when auth is not configured", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return {
          mode: "cloud",
          authConfigured: false,
          user: null,
          organization: null,
          memberships: [],
        };
      }
      return health;
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Autentificare indisponibilă" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("does not treat a Cloud user as an Atelier operator", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return authenticatedSession;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      if (url.endsWith("/api/operator-session")) {
        return { operator: null, session: null };
      }
      if (url.endsWith("/api/operator-candidates")) {
        return {
          candidates: [
            {
              personId: "p1",
              displayName: "Ion Pop",
              pinConfigured: true,
              availabilityLabel: "",
            },
          ],
        };
      }
      return {};
    });
    window.history.replaceState({}, "", "/atelier");

    render(<App />);

    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(await screen.findByText("Neidentificat")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toBeInTheDocument();
    expect(screen.queryByText("Autentificat: owner@example.test")).not.toBeInTheDocument();
  });

  it("does not persist passwords or tokens in web storage", async () => {
    const setLocal = vi.spyOn(window.localStorage, "setItem");
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return authenticatedSession;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(await screen.findByText("owner@example.test")).toBeInTheDocument();
    expect(setLocal).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("workos-ui20.cloud.wasAuthenticated")).toBe("1");
    expect(window.sessionStorage.getItem("workos-ui20.cloud.wasAuthenticated")).not.toMatch(
      /token|cookie|password/i,
    );
    setLocal.mockRestore();
  });
});
