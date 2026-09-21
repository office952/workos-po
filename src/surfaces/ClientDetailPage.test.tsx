import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientDetailPage } from "./ClientDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClientDetailPage", () => {
  it("keeps the object workspace without a repeated context-card rail", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/customers/cus-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            customer: {
              customerId: "cus-1",
              displayName: "Atelier Nord",
              status: "ACTIVE",
              city: "Cluj",
            },
          }),
        });
      }
      if (url.endsWith("/requests")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ overview: { requests: [] } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect(document.querySelector(".page-workspace--object")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Cerere nouă" })).toBeInTheDocument();
    expect(screen.getByText("Deschide catalogul pentru acest client")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Context client" })).not.toBeInTheDocument();
    expect(document.querySelector(".client-special-panel")).toBeNull();
    expect(screen.queryByText(/Montajul nu face parte/i)).not.toBeInTheDocument();
  });
});
