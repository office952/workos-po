import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsPage } from "./JobsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JobsPage", () => {
  it("keeps a discoverable Planificare entry without adding L1 navigation", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            overview: {
              jobs: [
                {
                  jobId: "job-1",
                  productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
                  productLabel: "Litere volumetrice",
                  inscription: "ALPHA",
                  customerDisplayName: "ALPHA CLIMA DEMO SRL",
                  stage: "IN_EXECUTION",
                  stageLabel: "În execuție",
                  nextActionLabel: "Continuă execuția",
                  progressLabel: "0 / 2",
                  createdAt: "2026-09-21T10:00:00.000Z",
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<JobsPage />);
    expect(await screen.findByText("ALPHA")).toBeInTheDocument();
    const planning = screen.getByRole("link", { name: "Planificare" });
    expect(planning).toHaveAttribute("href", "/planificare");
    expect(planning.closest(".page-header__action")).not.toBeNull();
    expect(document.querySelector(".app-shell__nav")).toBeNull();
  });
});
