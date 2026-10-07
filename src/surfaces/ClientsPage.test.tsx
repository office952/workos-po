import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { ClientsPage } from "./ClientsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("ClientsPage", () => {
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
    expect(document.querySelector(".page-workspace--collection-with-rail")).not.toBeNull();
    await userEvent.setup().type(await screen.findByLabelText("Denumire"), "Atelier Nord");
    await userEvent.setup().click(screen.getByRole("button", { name: "Înregistrează clientul" }));

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
    expect(screen.getByText("Cluj")).toBeInTheDocument();
    expect(screen.getByText("Iași")).toBeInTheDocument();
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
});
