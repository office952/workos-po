import { fireEvent, render, screen, within } from "@testing-library/react";
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
                  nextAction: "CONTINUE_EXECUTION",
                  nextActionLabel: "Continuă execuția",
                  progressLabel: "0 / 2",
                  createdAt: "2026-09-21T10:00:00.000Z",
                  planId: "exp-1",
                  needsAttention: true,
                  attentionLabel: "Lipsă utilaj dedicat",
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<JobsPage />);
    expect((await screen.findAllByText("ALPHA")).length).toBeGreaterThan(0);
    const planning = screen.getByRole("link", { name: "Planificare" });
    expect(planning).toHaveAttribute("href", "/planificare");
    expect(planning.closest(".jobs-spine__controls")).not.toBeNull();
    const hero = screen.getByRole("heading", { name: "Lucrări" }).closest(".page-header");
    expect(hero).toHaveClass("page-header--pilot");
    expect(hero).not.toHaveClass("page-header--pilot-compact");
    expect(within(hero as HTMLElement).getByRole("group", { name: "Indicatori lucrări" })).toHaveClass("pilot-instrument");

    expect(document.querySelector(".app-shell__nav")).toBeNull();
    expect(screen.getByRole("link", { name: /ALPHA/ })).toHaveAttribute("href", "/lucrari/job-1");
    const continueLinks = screen.getAllByRole("link", { name: "Vezi operațiile" });
    expect(continueLinks).toHaveLength(2);
    continueLinks.forEach((link) => expect(link).toHaveAttribute("href", "/lucrari/job-1?sectiune=operatii"));
    expect(screen.getAllByText(/Lipsă utilaj dedicat/).length).toBeGreaterThan(0);
    expect(screen.getByText("FLUX DE PRODUCȚIE")).toBeInTheDocument();
    expect(screen.getAllByText("Eliberare").length).toBeGreaterThan(0);

    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
  });

  it("keeps the paper selection tied to the server-owned job and next action", async () => {
    const job = {
      jobId: "urban-1",
      kind: "PRODUCT",
      kindLabel: "Produs",
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      productLabel: "Litere volumetrice luminoase",
      inscription: "URBAN",
      customerDisplayName: "Urban Pharma Demo SRL",
      memberLabels: [],
      stage: "ORDER_CREATED",
      stageLabel: "Comandă creată",
      priority: "STANDARD",
      priorityLabel: "Standard",
      targetDate: null,
      targetDateLabel: "Fără termen",
      nextAction: "RELEASE_TO_PRODUCTION",
      nextActionLabel: "Eliberează pentru producție",
      needsAttention: true,
      attentionLabel: "Urmează eliberarea pentru producție",
      overdue: false,
      progressLabel: null,
      createdAt: "2026-09-21T10:00:00.000Z",
    };
    const second = {
      ...job,
      jobId: "alpha-2",
      inscription: "ALPHA",
      customerDisplayName: "Alpha Clima Demo SRL",
      stage: "EXECUTION_IN_PROGRESS",
      stageLabel: "În lucru",
      nextAction: "CONTINUE_EXECUTION",
      nextActionLabel: "Continuă execuția",
      progressLabel: "0 / 12 finalizate · 1 în lucru",
      planId: "plan-2",
      createdAt: "2026-09-22T10:00:00.000Z",
    };

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => String(input).endsWith("/jobs")
        ? { overview: { jobs: [job, second] } }
        : {},
    })));

    render(<JobsPage />);
    await screen.findByRole("button", { name: "Previzualizează lucrarea URBAN" });
    fireEvent.click(screen.getByRole("button", { name: "Previzualizează lucrarea URBAN" }));

    const traveler = screen.getByRole("complementary", { name: "Fișa operațională a lucrării selectate" });
    expect(within(traveler).getByRole("heading", { name: "URBAN" })).toBeInTheDocument();
    expect(within(traveler).getByText("Comandă creată", { selector: "strong" })).toBeInTheDocument();
    expect(within(traveler).getByText("Fără plan de execuție")).toBeInTheDocument();
    expect(within(traveler).getByRole("link", { name: "Deschide lucrarea" })).toHaveAttribute("href", "/lucrari/urban-1");
    expect(within(traveler).getByRole("region", { name: "Traseul lucrării" })).toBeInTheDocument();
    expect(within(traveler).queryByText("5 zile rămase")).not.toBeInTheDocument();
  });
});
