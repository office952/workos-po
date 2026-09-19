import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobDetailPage } from "./JobDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JobDetailPage", () => {
  it("keeps the traveler workspace without a repeated object hero", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/jobs/job-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: {
              jobId: "job-1",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              productLabel: "Litere volumetrice",
              inscription: "NORD",
              customerDisplayName: "Atelier Nord",
              stage: "RELEASED",
              stageLabel: "Eliberată",
              nextAction: "CREATE_EXECUTION_PLAN",
              nextActionLabel: "Creează planul de execuție",
              progressLabel: "0 / 3",
              orderSnapshotId: "ord-1",
              releaseSnapshotId: "rel-1",
            },
            quote: { quoteSnapshotId: "q-1" },
            execution: { planId: null },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<JobDetailPage jobId="job-1" />);
    expect(await screen.findByRole("heading", { name: "NORD" })).toBeInTheDocument();
    expect(document.querySelector(".page-workspace--traveler")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Identitate" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Traseu de producție" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Planificat și realizat" })).toBeInTheDocument();
    expect(document.querySelector(".object-hero")).toBeNull();
    expect(document.querySelector(".job-dashboard-box")).toBeNull();
    expect(screen.getByText("Ofertă acceptată")).toBeInTheDocument();
    expect(screen.getAllByText("Ofertă acceptată").length).toBe(1);
  });
});
