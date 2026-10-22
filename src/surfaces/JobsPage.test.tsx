import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { JobsPage } from "./JobsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

const base = {
  kind: "PRODUCT",
  kindLabel: "Produs",
  productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
  productLabel: "Litere volumetrice luminoase",
  memberLabels: [],
  priority: "STANDARD",
  priorityLabel: "Standard",
  targetDate: null,
  targetDateLabel: "Fără termen",
  overdue: false,
};

const URBAN = {
  ...base,
  jobId: "urban-1",
  inscription: "URBAN",
  customerDisplayName: "Urban Pharma Demo SRL",
  stage: "ORDER_CREATED",
  stageLabel: "Comandă creată",
  nextAction: "RELEASE_TO_PRODUCTION",
  nextActionLabel: "Trimite în producție",
  needsAttention: true,
  attentionLabel: "Comanda așteaptă trimiterea în producție",
  progressLabel: null,
  createdAt: "2026-09-21T10:00:00.000Z",
};
const ALPHA = {
  ...base,
  jobId: "alpha-2",
  inscription: "ALPHA",
  customerDisplayName: "Alpha Clima Demo SRL",
  stage: "EXECUTION_PLANNED",
  stageLabel: "Plan de execuție",
  nextAction: "OPEN_EXECUTION",
  nextActionLabel: "Vezi operațiile",
  needsAttention: true,
  attentionLabel: "Lipsă utilaj dedicat",
  progressLabel: "0 / 12 finalizate",
  completedCount: 0,
  taskCount: 12,
  planId: "plan-2",
  createdAt: "2026-09-22T10:00:00.000Z",
};
const NORD = {
  ...base,
  jobId: "nord-3",
  inscription: "NORD",
  customerDisplayName: "Nord Market Demo SRL",
  stage: "EXECUTION_IN_PROGRESS",
  stageLabel: "În lucru",
  nextAction: "CONTINUE_EXECUTION",
  nextActionLabel: "Urmărește producția",
  needsAttention: false,
  attentionLabel: null,
  progressLabel: "5 / 17 finalizate · 1 în lucru",
  completedCount: 5,
  taskCount: 17,
  inProgressCount: 1,
  planId: "plan-3",
  createdAt: "2026-09-23T10:00:00.000Z",
};
const NOVA = {
  ...base,
  jobId: "nova-4",
  inscription: "NOVA",
  customerDisplayName: "Demo Nova SRL",
  stage: "EXECUTION_COMPLETED",
  stageLabel: "Producție finalizată",
  nextAction: "VIEW_COMPLETED",
  nextActionLabel: "Lucrare finalizată",
  needsAttention: false,
  attentionLabel: null,
  progressLabel: "19 / 19 finalizate",
  completedCount: 19,
  taskCount: 19,
  planId: "plan-4",
  createdAt: "2026-09-24T10:00:00.000Z",
};

function serve(jobs: unknown[], summary: unknown = { total: jobs.length, active: jobs.length, inExecution: 1, needsAttention: 2, completed: 1 }) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => Promise.resolve({
    ok: true,
    status: 200,
    json: async () => (String(input).endsWith("/jobs") ? { overview: { summary, jobs } } : {}),
  })));
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole("row", { name: `Previzualizează lucrarea ${name}` });
}

describe("JobsPage", () => {
  it("keeps the resource view inside Lucrări without a separate Planning page", async () => {
    serve([ALPHA]);
    render(<JobsPage />);
    await screen.findByRole("link", { name: "ALPHA" });
    const resources = screen.getByRole("link", { name: "Pe utilaje și zone" });
    expect(resources).toHaveAttribute("href", "/lucrari?vedere=utilaje");
    expect(resources.closest("nav")).toHaveAttribute("aria-label", "Vederi lucrări");
    expect(screen.queryByRole("link", { name: "Planificare" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Lucrări" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtre registru lucrări" })).toBeInTheDocument();
    expect(document.querySelector(".app-shell__nav")).toBeNull();
  });

  it("presents every action through presentJobWorklistAction, with its real destination", async () => {
    serve([URBAN, ALPHA, NORD, NOVA]);
    render(<JobsPage />);
    await screen.findByRole("link", { name: "URBAN" });
    // Before release: open the job sheet; the server's next step is said beside it.
    expect(within(rowOf("URBAN")).getByRole("link", { name: "Deschide lucrarea" })).toHaveAttribute("href", "/lucrari/urban-1");
    expect(within(rowOf("URBAN")).getByText("Pas următor: Trimite în producție")).toBeInTheDocument();
    // Plan ready and execution under way: the Operații section of the job sheet, never Atelier.
    expect(within(rowOf("ALPHA")).getByRole("link", { name: "Vezi operațiile" })).toHaveAttribute("href", "/lucrari/alpha-2?sectiune=operatii");
    expect(within(rowOf("ALPHA")).queryByText(/Pas următor/)).not.toBeInTheDocument();
    expect(within(rowOf("NORD")).getByRole("link", { name: "Vezi operațiile" })).toHaveAttribute("href", "/lucrari/nord-3?sectiune=operatii");
    expect(within(rowOf("NORD")).getByText("Pas următor: Urmărește producția")).toBeInTheDocument();
    // Finished: the consultation label from the server, on the job sheet.
    expect(within(rowOf("NOVA")).getByRole("link", { name: "Lucrare finalizată" })).toHaveAttribute("href", "/lucrari/nova-4");
    expect(screen.queryAllByRole("link").some((link) => link.getAttribute("href")?.startsWith("/atelier"))).toBe(false);
    expect(within(rowOf("ALPHA")).getByText("Lipsă utilaj dedicat")).toBeInTheDocument();
    expect(screen.queryByText(/Alege utilajul/)).not.toBeInTheDocument();
  });

  it("shows operation progress only from the server counts and the honest label otherwise", async () => {
    serve([URBAN, NORD]);
    render(<JobsPage />);
    await screen.findByRole("link", { name: "NORD" });
    const bar = within(rowOf("NORD")).getByRole("progressbar", { name: "Operații finalizate" });
    expect(bar).toHaveAttribute("aria-valuenow", "5");
    expect(bar).toHaveAttribute("aria-valuemax", "17");
    expect(within(rowOf("URBAN")).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(rowOf("URBAN")).getByText("Fără plan de execuție")).toBeInTheDocument();
  });

  it("counts the production line by stage code and filters by station", async () => {
    serve([URBAN, ALPHA, NORD, NOVA]);
    render(<JobsPage />);
    await screen.findByRole("link", { name: "URBAN" });
    const line = screen.getByRole("group", { name: "Linia de producție: filtru pe etapă" });
    expect(within(line).getByRole("button", { name: "Comandă: 1 lucrări" })).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Eliberată: 0 lucrări" })).toBeInTheDocument();
    await userEvent.click(within(line).getByRole("button", { name: "În execuție: 1 lucrări" }));
    expect(screen.getByRole("link", { name: "NORD" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "URBAN" })).not.toBeInTheDocument();
    await userEvent.click(within(line).getByRole("button", { name: "În execuție: 1 lucrări" }));
    expect(screen.getByRole("link", { name: "URBAN" })).toBeInTheDocument();
  });

  it("opens the traveler for the selected job, tied to the server-owned stage and next action", async () => {
    window.history.replaceState({}, "", "/lucrari");
    serve([URBAN, NORD]);
    const { rerender } = render(<JobsPage search="" />);
    await screen.findByRole("link", { name: "URBAN" });
    expect(screen.getByText("Nicio lucrare selectată")).toBeInTheDocument();
    fireEvent.click(rowOf("URBAN"));
    expect(window.location.search).toBe("?lucrare=urban-1");
    rerender(<JobsPage search="?lucrare=urban-1" />);
    const traveler = screen.getByRole("article", { name: "Fișa de traseu: URBAN" });
    expect(within(traveler).getAllByText("Fără plan de execuție").length).toBeGreaterThan(0);
    expect(within(traveler).getByText("Pas următor: Trimite în producție")).toBeInTheDocument();
    expect(within(traveler).getByText("Comandă creată")).toBeInTheDocument();
    const dossier = screen.getByRole("complementary", { name: "Fișa de traseu a lucrării" });
    expect(within(dossier).getByRole("link", { name: "Deschide lucrarea" })).toHaveAttribute("href", "/lucrari/urban-1");
    expect(within(dossier).queryByRole("link", { name: "Fișa completă" })).not.toBeInTheDocument();
  });

  it("offers the full sheet beside operations in the traveler and steps through the register", async () => {
    serve([NORD, ALPHA]);
    window.history.replaceState({}, "", "/lucrari?lucrare=nord-3");
    render(<JobsPage search="?lucrare=nord-3" />);
    const dossier = await screen.findByRole("complementary", { name: "Fișa de traseu a lucrării" });
    expect(within(dossier).getByRole("link", { name: "Vezi operațiile" })).toHaveAttribute("href", "/lucrari/nord-3?sectiune=operatii");
    expect(within(dossier).getByRole("link", { name: "Fișa completă" })).toHaveAttribute("href", "/lucrari/nord-3");
    expect(within(dossier).getByText("1 din 2")).toBeInTheDocument();
    await userEvent.click(within(dossier).getByRole("button", { name: "Lucrarea următoare" }));
    expect(window.location.search).toBe("?lucrare=alpha-2");
  });

  it("says so when a linked job is not in the register", async () => {
    serve([NORD]);
    render(<JobsPage search="?lucrare=missing" />);
    expect(await screen.findByText("Lucrarea nu este în registru")).toBeInTheDocument();
  });
});
