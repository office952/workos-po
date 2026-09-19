import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestDetailPage } from "./RequestDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("RequestDetailPage", () => {
  it("keeps request identity in the header and a single catalog continuation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        void input;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            detail: {
              request: {
                requestId: "req-1",
                title: "Litere vitrină",
                description: "Față plexi",
                customerId: "cus-1",
              },
              customerDisplayName: "Atelier Nord",
              statusLabel: "Deschisă",
              linkedOffers: [],
            },
          }),
        });
      }),
    );

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.getByText("Atelier Nord")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alege produsul din catalog" })).toHaveAttribute(
      "href",
      "/catalog?customer=cus-1&request=req-1",
    );
    expect(screen.queryByRole("heading", { name: "Cerere", level: 2 })).not.toBeInTheDocument();
  });
});
