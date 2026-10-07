import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { notifyCloudUnauthorizedUnlessPublic } from "./session/sessionExpiryBridge";
import { invalidateResources, readResource } from "./data/resourceCache";
import { resourceKeys } from "./data/resourceKeys";
import { readClientsRegistryMemory, writeClientsRegistryMemory } from "./session/clientsRegistryMemory";
import { cloudSessionScope, rememberCloudScope } from "./session/cloudSessionScope";
import { presentCloudSession } from "./adapters/cloudSessionAdapter";
import { readConfiguratorSession, writeConfiguratorSession } from "./session/configuratorSession";

async function openAccountMenu(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Cont" }));
}

async function openSocietateLogin(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: "Login Societate" }));
  expect(await screen.findByRole("heading", { name: "Acces Societate" })).toBeInTheDocument();
}

async function expectLoginGate(): Promise<void> {
  expect(await screen.findByRole("button", { name: "Login Societate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Login Angajat" })).toBeInTheDocument();
  expect(screen.getByLabelText("Panou autentificare WorkOS")).toBeInTheDocument();
}

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
  // Unmount while this test's fetch stub and session context are still installed.
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("App Cloud auth integration", () => {
  it.each([200, 403])("isolates cached hub data and late reads while switching organization (new GET %i)", async (nextStatus) => {
    let activeOrganization = "org:a";
    let readsA = 0;
    let releaseOld!: (value: unknown) => void;
    let releaseNew!: (value: unknown) => void;
    const memberships = [...authenticatedSession.memberships, { organizationId: "org:b", displayName: "Atelier Beta", role: "owner", status: "ACTIVE" }];
    const sessionFor = () => ({ ...authenticatedSession, memberships, organization: { ...authenticatedSession.organization, organizationId: activeOrganization, displayName: activeOrganization === "org:a" ? "Atelier Alpha" : "Atelier Beta" } });
    const hubFor = (name: string) => ({ workspace: { customer: { customerId: "cus-one", displayName: name, status: "ACTIVE", phone: name === "Client Alpha" ? "0740000001" : "0740000002" }, canCreateRequest: true, requests: [], quotes: [], jobs: [] } });
    installFetch((url) => {
      if (url.endsWith("/cloud/session")) return sessionFor();
      if (url.endsWith("/cloud/active-organization")) { activeOrganization = "org:b"; return sessionFor(); }
      if (url.endsWith("/health")) return health;
      if (url.endsWith("/customers/cus-one/workspace")) {
        if (activeOrganization === "org:a") {
          if (++readsA === 1) return hubFor("Client Alpha");
          return new Promise((resolve) => { releaseOld = resolve; });
        }
        return new Promise((resolve) => { releaseNew = resolve; });
      }
      return {};
    });
    window.history.replaceState({}, "", "/clienti/cus-one");
    render(<App />);
    await screen.findByRole("heading", { name: "Client Alpha" });
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    await userEvent.type(screen.getByLabelText("Titlu"), "Cerere din A");
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    writeClientsRegistryMemory({ query: "Client Alpha", selectedId: "cus-one", statusChip: "attention" });
    act(() => invalidateResources(resourceKeys.customerWorkspace("cus-one")));
    await waitFor(() => expect(releaseOld).toBeTypeOf("function"));
    await openAccountMenu();
    await userEvent.selectOptions(screen.getByLabelText("Organizație activă"), "org:b");
    await screen.findByText("Atelier Beta");
    await waitFor(() => expect(releaseNew).toBeTypeOf("function"));
    expect(screen.queryByRole("heading", { name: "Client Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByText("0740000001")).not.toBeInTheDocument();
    expect(readResource(resourceKeys.customerWorkspace("cus-one")).data).toBeUndefined();
    expect(readClientsRegistryMemory()).toEqual({ query: "", selectedId: null, statusChip: "all" });
    await act(async () => { releaseOld(hubFor("Client Alpha")); });
    expect(readResource(resourceKeys.customerWorkspace("cus-one")).data).toBeUndefined();
    await act(async () => { releaseNew(nextStatus === 200 ? hubFor("Client Beta") : jsonResponse({ error: "denied" }, nextStatus)); });
    if (nextStatus === 200) {
      await screen.findByRole("heading", { name: "Client Beta" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
      expect(screen.getByLabelText("Titlu")).toHaveValue("");
    } else {
      expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Creează cererea" })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Client Alpha" })).not.toBeInTheDocument();
  });

  it.each(["same", "different"])("restores preferences only for the %s authenticated scope on boot", async (scope) => {
    const stored = presentCloudSession(authenticatedSession);
    rememberCloudScope(cloudSessionScope(scope === "same" ? stored : { ...stored, organization: { ...stored.organization!, organizationId: "org:b" } }));
    writeClientsRegistryMemory({ query: "Nord", selectedId: null, statusChip: "all" });
    writeConfiguratorSession({ customerId: "cus-one", requestId: "req-one", productCode: null, drafts: { widthMm: "1200" }, draftContext: { customerId: "cus-one", requestId: "req-one", productCode: null }, lastQuote: null });
    installFetch((url) => url.endsWith("/cloud/session") ? authenticatedSession : url.endsWith("/health") ? health : { customers: [] });
    window.history.replaceState({}, "", "/clienti");
    render(<App />);
    expect(await screen.findByLabelText("Caută")).toHaveValue(scope === "same" ? "Nord" : "");
    expect(readConfiguratorSession().drafts).toEqual(scope === "same" ? { widthMm: "1200" } : {});
  });

  it("does not reuse client data after logout and another owner's login", async () => {
    let current: unknown = authenticatedSession;
    let signedOut = false;
    const fetchMock = installFetch((url) => {
      if (url.endsWith("/cloud/session")) return current;
      if (url.endsWith("/cloud/logout")) { signedOut = true; current = { mode: "cloud", user: null, organization: null, memberships: [] }; return {}; }
      if (url.endsWith("/cloud/login")) { current = { ...authenticatedSession, user: { userId: "usr:2", email: "other@example.test" } }; return current; }
      if (url.endsWith("/health")) return health;
      if (url.endsWith("/customers/cus-one/workspace")) return signedOut ? jsonResponse({ error: "denied" }, 403) : { workspace: { customer: { customerId: "cus-one", displayName: "Client privat", status: "ACTIVE" }, canCreateRequest: true, requests: [], quotes: [], jobs: [] } };
      return {};
    });
    window.history.replaceState({}, "", "/clienti/cus-one");
    render(<App />);
    await screen.findByRole("heading", { name: "Client privat" });
    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    await expectLoginGate();
    expect(readResource(resourceKeys.customerWorkspace("cus-one")).data).toBeUndefined();
    await openSocietateLogin();
    await userEvent.type(screen.getByLabelText("Adresă email"), "other@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OtherPass12");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    expect(screen.queryByText("Client privat")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/customers/cus-one/workspace")).length).toBeGreaterThanOrEqual(2);
  });
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

    // The route loading shell also has this heading; wait for the actual registry.
    expect(await screen.findByLabelText("Caută")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login Societate" })).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText("Adresă email")).not.toBeInTheDocument();
    releaseSession(null);
    await expectLoginGate();
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
    await expectLoginGate();
    await openSocietateLogin();
    await userEvent.type(screen.getByLabelText("Adresă email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await openAccountMenu();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByText("OwnerPass12")).not.toBeInTheDocument();
  });

  it("lands on Launchpad after login from /login instead of Pagină inexistentă", async () => {
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
    window.history.replaceState({}, "", "/login");

    render(<App />);
    await expectLoginGate();
    await openSocietateLogin();
    await userEvent.type(screen.getByLabelText("Adresă email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));
    expect(await screen.findByRole("heading", { name: "WorkOS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operațiuni" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Administrare" })).toBeInTheDocument();
    expect(screen.queryByText("Pagină inexistentă")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("keeps an authenticated session on /login from rendering Pagină inexistentă", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/cloud/session")) {
        return authenticatedSession;
      }
      if (url.endsWith("/api/health")) {
        return health;
      }
      return { customers: [] };
    });
    window.history.replaceState({}, "", "/login");

    render(<App />);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(await screen.findByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(screen.queryByText("Pagină inexistentă")).not.toBeInTheDocument();
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

    await expectLoginGate();
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
    await openAccountMenu();
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
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await openAccountMenu();
    const select = await screen.findByLabelText("Organizație activă");
    await userEvent.selectOptions(select, "org:b");
    await waitFor(() => {
      expect(switchMock).toHaveBeenCalledWith({ organizationId: "org:b" });
    });
    await screen.findByText("Atelier Beta");
    await openAccountMenu();
    expect(await screen.findByLabelText("Organizație activă")).toHaveValue("org:b");
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
    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    await expectLoginGate();
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
    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    await expectLoginGate();
    first.unmount();

    render(<App />);
    await expectLoginGate();
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
    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Ieși din cont" }));
    await expectLoginGate();
    await openSocietateLogin();
    await userEvent.type(screen.getByLabelText("Adresă email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login Societate" })).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText("Adresă email")).not.toBeInTheDocument();
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
    await openAccountMenu();
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
    expect(await screen.findByText("Atelier Alpha")).toBeInTheDocument();
    await openAccountMenu();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(setLocal).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("workos-ui20.cloud.wasAuthenticated")).toBe("1");
    expect(window.sessionStorage.getItem("workos-ui20.cloud.wasAuthenticated")).not.toMatch(
      /token|cookie|password/i,
    );
    setLocal.mockRestore();
  });
});
