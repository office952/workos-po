import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestsPage } from "./RequestsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RequestsPage", () => {
  it("keeps the collection workspace and prefers request identity over title", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/requests")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            overview: {
              requests: [
                {
                  requestId: "req-1",
                  title: "Litere vitrină",
                  reference: "CRQ-104",
                  customerId: "cus-1",
                  customerDisplayName: "Atelier Nord",
                  statusLabel: "Deschisă",
                  commercialProgressLabel: "Fără ofertă",
                  createdAt: "2026-09-01T10:00:00.000Z",
                  nextActionLabel: "Deschide catalogul",
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<RequestsPage />);
    expect(document.querySelector(".page-workspace--stack")).not.toBeNull();
    expect(document.querySelector(".ui-panel--flush")).not.toBeNull();
    expect(await screen.findByText("CRQ-104")).toBeInTheDocument();
    expect(screen.getByText("Litere vitrină")).toBeInTheDocument();
    expect(document.querySelector(".requests-card")).toBeNull();
  });
});
