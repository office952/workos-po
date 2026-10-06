import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientsPage } from "./ClientsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClientsPage", () => {
  it("creates a customer through the public customers API", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/customers") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ customer: { customerId: "cus-new", displayName: "Atelier Nord" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ customers: [] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<ClientsPage />);
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-layout", "REGISTRY");
    expect(document.querySelector("[data-layout='OBJECT_DETAIL']")).toBeNull();
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
});
