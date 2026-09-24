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
    expect(screen.queryByRole("link", { name: "Deschide atelierul lucrării" })).toBeNull();
  });

  it("opens execution and atelier with the same job context when a plan exists", async () => {
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
              stage: "IN_EXECUTION",
              stageLabel: "În execuție",
              nextAction: "CONTINUE_EXECUTION",
              nextActionLabel: "Continuă execuția",
              progressLabel: "0 / 3",
              orderSnapshotId: "job-1",
              releaseSnapshotId: "rel-1",
            },
            quote: { quoteSnapshotId: "q-1" },
            execution: { planId: "exp-1" },
          }),
        });
      }
      if (url.includes("/execution-plans/exp-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            executionPlan: {
              plan: {
                planId: "exp-1",
                productLabel: "Litere",
                inscription: "NORD",
                sourceSnapshotId: "aps-1",
              },
              statusLabel: "În lucru",
              progress: { completed: 0, total: 1 },
              tasks: [
                {
                  taskId: "task-1",
                  processLabel: "Debitare",
                  scopeLabel: "Spate",
                  seqLabel: "01",
                  status: "PLANNED",
                  statusLabel: "Planificat",
                  assignmentLabel: "Nealocat",
                  requiresProvider: true,
                  canAssign: false,
                  canClaimStart: false,
                  canComplete: false,
                  requiresCompletedQuantity: false,
                  waitingFor: [],
                  eligibleProviders: [],
                },
              ],
            },
            job: { jobId: "job-1", href: "/jobs/job-1" },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<JobDetailPage jobId="job-1" />);
    expect(await screen.findByRole("link", { name: "Deschide execuția" })).toHaveAttribute(
      "href",
      "/executie/exp-1?job=job-1",
    );
    expect(screen.getByRole("link", { name: "Deschide atelierul lucrării" })).toHaveAttribute(
      "href",
      "/atelier?job=job-1",
    );
    const headerAction = document.querySelector(".page-header__action");
    expect(headerAction?.querySelector('a[href="/executie/exp-1?job=job-1"]')).not.toBeNull();
    expect(headerAction).toHaveTextContent("Continuă execuția");
  });

  it("shows frozen OTHER installation notes and hides them for ordinary values", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      expect(url).not.toContain("/requests/");
      if (url.includes("/jobs/job-other")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: {
              jobId: "job-other",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              productLabel: "Litere volumetrice",
              inscription: "ALTUL",
              customerDisplayName: "Client sintetic",
              stage: "RELEASED",
              stageLabel: "Eliberată",
              nextAction: "CREATE_EXECUTION_PLAN",
              nextActionLabel: "Creează planul de execuție",
              progressLabel: "0 / 3",
              orderSnapshotId: "ord-other",
              releaseSnapshotId: "rel-other",
            },
            siteInstallation: {
              providerModeLabel: "Intern",
              siteName: null,
              street: "Strada Sintetică 1",
              city: "Oraș Sintetic",
              surfaceTypeLabel: "Altul",
              surfaceOtherNote: "Suprafață sintetică specială",
              fixingMethodLabel: "Altul",
              fixingOtherNote: "Fixare sintetică specială",
              installationElevationMm: null,
              siteElectricalLabel: "Exclus — responsabilitatea clientului",
              accessNotes: null,
              contactName: null,
              contactPhone: null,
              crewSize: 2,
              plannedDurationHours: 3,
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<JobDetailPage jobId="job-other" />);
    expect(await screen.findByText("Suprafață sintetică specială")).toBeInTheDocument();
    expect(screen.getByText("Fixare sintetică specială")).toBeInTheDocument();
    expect(screen.getByText("Tip suprafață — detalii")).toBeInTheDocument();
    expect(screen.getByText("Metodă de fixare — detalii")).toBeInTheDocument();
    expect(screen.getAllByText("Altul")).toHaveLength(2);
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: {
              jobId: "job-ordinary",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              productLabel: "Litere volumetrice",
              inscription: "BETON",
              customerDisplayName: "Client sintetic",
              stage: "RELEASED",
              stageLabel: "Eliberată",
              nextAction: "CREATE_EXECUTION_PLAN",
              nextActionLabel: "Creează planul de execuție",
              progressLabel: "0 / 3",
              orderSnapshotId: "ord-ordinary",
              releaseSnapshotId: "rel-ordinary",
            },
            siteInstallation: {
              providerModeLabel: "Subcontractat",
              siteName: null,
              street: "Strada Sintetică 10",
              city: "Oraș Sintetic",
              surfaceTypeLabel: "Beton",
              surfaceOtherNote: null,
              fixingMethodLabel: "Ancoră mecanică",
              fixingOtherNote: null,
              installationElevationMm: null,
              siteElectricalLabel: "Nu se aplică",
              accessNotes: null,
              contactName: null,
              contactPhone: null,
              crewSize: null,
              plannedDurationHours: null,
            },
          }),
        }),
      ),
    );
    render(<JobDetailPage jobId="job-ordinary" />);
    expect(await screen.findByText("Beton")).toBeInTheDocument();
    expect(screen.getByText("Ancoră mecanică")).toBeInTheDocument();
    expect(screen.queryByText("Tip suprafață — detalii")).not.toBeInTheDocument();
    expect(screen.queryByText("Metodă de fixare — detalii")).not.toBeInTheDocument();
    expect(screen.queryByText("Echipă")).not.toBeInTheDocument();
  });
});
