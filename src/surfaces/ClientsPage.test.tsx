import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateResources, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { readClientsRegistryMemory, writeClientsRegistryMemory } from "../session/clientsRegistryMemory";
import { ClientsPage } from "./ClientsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("ClientsPage", () => {
  it.each([401, 403])("hides a cached registry and its create form after a %i refresh", async (status) => {
    const fetchMock = vi.fn(() => jsonResponse(200, { registry: { customers: [{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    await screen.findByRole("link", { name: /Atelier Nord/ });
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(status, {}));
    act(() => invalidateResources(resourceKeys.customers()));
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    expect(screen.queryByText("Atelier Nord")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Înregistrează clientul" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client nou" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("remembers the client opened using the row action", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, { registry: { customers: [{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE" }] } })));
    render(<ClientsPage />);
    const link = await screen.findByRole("link", { name: /Deschide/ });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(readClientsRegistryMemory().selectedId).toBe("cus-1");
  });
  it("restores context without painting the previously opened client as selected", async () => {
    writeClientsRegistryMemory({ query: "", statusChip: "all", selectedId: "cus-1" });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, { registry: { customers: [{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE" }] } })));
    render(<ClientsPage />);
    const link = await screen.findByRole("link", { name: /Atelier Nord/ });
    expect(link.closest("tr")).not.toHaveAttribute("data-selected");
    expect(readClientsRegistryMemory().selectedId).toBe("cus-1");
  });
  it("creates a customer through the public customers API", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/customers") && init?.method === "POST") {
        return jsonResponse(201, { customer: { customerId: "cus-new", displayName: "Atelier Nord" } });
      }
      return jsonResponse(200, { customers: [], registry: { summary: { total: 0, active: 0, retired: 0, needsAttention: 0 }, customers: [] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<ClientsPage />);
    expect(document.querySelector(".page-workspace--stack")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.setup().type(screen.getByLabelText("Denumire"), "Atelier Nord");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/customers",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Atelier Nord"),
        }),
      );
    });
  });

  it("opens the hub by customerId when two clients share a name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(200, {
          registry: {
            summary: { total: 2, active: 2, retired: 0, needsAttention: 0 },
            customers: [
              { customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE", city: "Cluj" },
              { customerId: "cus-2", displayName: "Atelier Nord", status: "ACTIVE", city: "Iași" },
            ],
          },
        }),
      ),
    );

    render(<ClientsPage />);
    const links = await screen.findAllByRole("link", { name: /Atelier Nord/ });
    expect(links.some((link) => link.getAttribute("href") === "/clienti/cus-1")).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "/clienti/cus-2")).toBe(true);
    expect(screen.getAllByText("Cluj").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Iași").length).toBeGreaterThan(0);
  });

  it("keeps search when the registry is shown again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(200, {
          registry: {
            summary: { total: 1, active: 1, retired: 0, needsAttention: 0 },
            customers: [{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE", city: "Cluj" }],
          },
        }),
      ),
    );
    const { unmount } = render(<ClientsPage />);
    await userEvent.setup().type(await screen.findByLabelText("Caută"), "Nord");
    unmount();
    render(<ClientsPage />);
    expect(await screen.findByLabelText("Caută")).toHaveValue("Nord");
  });

  it("retries after a denied registry read", async () => {
    const fetchMock = vi.fn(() => jsonResponse(403, { error: "forbidden" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    fetchMock.mockImplementation(() =>
      jsonResponse(200, {
        registry: {
          summary: { total: 0, active: 0, retired: 0, needsAttention: 0 },
          customers: [],
        },
      }),
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("Nu există încă clienți")).toBeInTheDocument();
  });
  it("keeps a draft when closed and reopens only through the CTA", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, { registry: { customers: [] } })));
    render(<ClientsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.type(screen.getByLabelText("Denumire"), "Atelier nou");
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    expect(screen.queryByLabelText("Denumire")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByLabelText("Denumire")).toHaveValue("Atelier nou");
  });

  it("does not navigate after a pending customer creation has left the page", async () => {
    let release!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo, init?: RequestInit) =>
      init?.method === "POST" ? new Promise((resolve) => { release = resolve; }) : jsonResponse(200, { registry: { customers: [] } }),
    ));
    window.history.replaceState({}, "", "/clienti");
    const { unmount } = render(<ClientsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.type(screen.getByLabelText("Denumire"), "Atelier nou");
    await userEvent.click(screen.getByRole("button", { name: "Înregistrează clientul" }));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    unmount();
    window.history.replaceState({}, "", "/cereri");
    await act(async () => { release(await jsonResponse(201, { customer: { customerId: "cus-new", displayName: "Atelier nou" } })); });
    expect(window.location.pathname).toBe("/cereri");
  });

});
