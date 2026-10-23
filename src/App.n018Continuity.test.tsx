import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { navigate } from "./routing/navigate";
import { resetResourceCache } from "./data/resourceCache";
import { jobRecordFixture } from "./test/jobRecordFixture";

function json(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 300, status, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const dossierFile = {
  artifactId: "file-old", originalFileName: "litere.dxf", mimeType: "application/dxf", sizeLabel: "1 KB", category: "WORKING",
  purpose: "WORKING", purposeLabel: "Fișier de lucru", note: null, usedAt: null, preview: "DOWNLOAD", uploadedAt: "2026-10-20T07:00:00Z",
  downloadHref: "/api/execution-artifacts/file-old/download", linkedToTask: true, supersedesArtifactId: null,
};

/** One synthetic job; the planning PATCH answers with `planning` statuses in order. */
function serve(planning: number[] = []) {
  const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
    if (url.endsWith("/planning") && init?.method === "PATCH") {
      const status = planning.shift() ?? 200;
      return json(status < 300 ? { job: { jobId: "job-1" } } : {}, status);
    }
    if (url.endsWith("/api/jobs/job-1/record")) return json({ record: jobRecordFixture });
    if (url.endsWith("/api/jobs/job-1")) return json({
      job: { jobId: "job-1", kind: "ASSEMBLY", productCode: "assembly", productLabel: "Panou și litere", inscription: "NORD", customerDisplayName: "Client sintetic", stage: "EXECUTION_IN_PROGRESS", stageLabel: "În lucru", nextAction: "CONTINUE_EXECUTION", nextActionLabel: "Continuă execuția", priority: "STANDARD", targetDate: null, planningEditable: true, orderSnapshotId: "order", releaseSnapshotId: "release" },
      execution: { planId: "plan-1" },
    });
    if (url.includes("/execution-plans/plan-1")) return json({ executionPlan: {
      plan: { planId: "plan-1", sourceSnapshotId: "snapshot", productLabel: "Panou și litere", inscription: "NORD" },
      progress: { completed: 2, total: 2, inProgress: 0, outside: 0, planned: 0, waitingDependencies: 0, noProvider: 0, varianceCount: 0 },
      tasks: [
        { taskId: "task-1", seqLabel: "01", processLabel: "Lipire", scopeLabel: "Litere", status: "COMPLETED", statusLabel: "Finalizat", assignmentLabel: "Banc", waitingFor: [] },
        { taskId: "task-2", seqLabel: "02", processLabel: "Control", scopeLabel: "Ansamblu", status: "COMPLETED", statusLabel: "Finalizat", assignmentLabel: "Banc", waitingFor: [] },
      ],
    } });
    if (url.includes("/dossier")) return json({ dossier: { taskId: url.includes("task-1") ? "task-1" : "task-2", instructions: [], observations: [], issues: [], files: url.includes("task-1") ? [dossierFile] : [], planFiles: [], history: [] } });
    if (url.includes("material-preparation")) return json({ preparation: { jobId: "job-1", planId: "plan-1", lines: [] } });
    return json({});
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const section = () => new URLSearchParams(window.location.search).get("sectiune");
const param = (name: string) => new URLSearchParams(window.location.search).get(name);

// Long journeys (several Back/Forward steps): a larger time budget, not weaker checks.
describe("N-018 · unsaved planning and the browser's Back/Forward", { timeout: 15_000 }, () => {
  it("Back → Rămân keeps everything; Back → Pleacă leaves and drops the values; Forward returns clean; the stack never grows", async () => {
    serve();
    window.history.replaceState({}, "", "/lucrari/job-1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Situația lucrării" });
    await user.click(screen.getByRole("link", { name: "Date lucrare" }));
    const panel = await screen.findByRole("region", { name: "Prioritatea și termenul" });
    const depth = window.history.length;
    await user.type(within(panel).getByLabelText("Termen"), "2026-12-01");

    // Back → the question names the destination; the page is put back on the same entry.
    window.history.back();
    expect(await screen.findByRole("heading", { name: "Ai modificări nesalvate" })).toBeInTheDocument();
    expect(screen.getByText(/Dacă pleci spre fișa lucrării/)).toBeInTheDocument();
    await waitFor(() => expect(section()).toBe("date"));
    await user.click(screen.getByRole("button", { name: "Rămân pe pagină" }));
    expect(screen.queryByRole("heading", { name: "Ai modificări nesalvate" })).toBeNull();
    expect(section()).toBe("date");
    expect(within(screen.getByRole("region", { name: "Prioritatea și termenul" })).getByLabelText("Termen")).toHaveValue("2026-12-01");
    expect(window.history.length).toBe(depth);

    // Back → Pleacă fără salvare: the same Back completes; the draft is dropped.
    window.history.back();
    await user.click(await screen.findByRole("button", { name: "Pleacă fără salvare" }));
    await waitFor(() => expect(section()).toBeNull());
    expect(await screen.findByRole("heading", { name: "Situația lucrării" })).toBeVisible();
    expect(window.history.length).toBe(depth);

    // Forward is intact and returns to the section without the abandoned values.
    window.history.forward();
    await waitFor(() => expect(section()).toBe("date"));
    const again = await screen.findByRole("region", { name: "Prioritatea și termenul" });
    expect(within(again).getByLabelText("Termen")).toHaveValue("");
    expect(within(again).queryByText("Modificări nesalvate")).toBeNull();
    expect(window.history.length).toBe(depth);
  });

  it("Back → Salvează și continuă: a failed save keeps page and values; the retry saves, then the Back completes and Forward still works", async () => {
    const fetch = serve([500, 200]);
    window.history.replaceState({}, "", "/lucrari/job-1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Situația lucrării" });
    await user.click(screen.getByRole("link", { name: "Date lucrare" }));
    const panel = await screen.findByRole("region", { name: "Prioritatea și termenul" });
    const depth = window.history.length;
    await user.type(within(panel).getByLabelText("Termen"), "2026-12-01");

    window.history.back();
    await user.click(await screen.findByRole("button", { name: "Salvează și continuă" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Salvarea a eșuat")).toBeInTheDocument();
    expect(section()).toBe("date");
    expect(within(screen.getByRole("region", { name: "Prioritatea și termenul" })).getByLabelText("Termen")).toHaveValue("2026-12-01");

    await user.click(within(dialog).getByRole("button", { name: "Reîncearcă și continuă" }));
    await waitFor(() => expect(section()).toBeNull());
    expect(window.history.length).toBe(depth);
    const patches = fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/planning") && init?.method === "PATCH");
    expect(patches).toHaveLength(2);

    window.history.forward();
    await waitFor(() => expect(section()).toBe("date"));
    expect(screen.queryByRole("heading", { name: "Ai modificări nesalvate" })).toBeNull();
  });

  it("without changes, Back and Forward pass without a question", async () => {
    serve();
    window.history.replaceState({}, "", "/lucrari/job-1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Situația lucrării" });
    await user.click(screen.getByRole("link", { name: "Date lucrare" }));
    await screen.findByRole("region", { name: "Prioritatea și termenul" });
    window.history.back();
    await waitFor(() => expect(section()).toBeNull());
    window.history.forward();
    await waitFor(() => expect(section()).toBe("date"));
    expect(screen.queryByRole("heading", { name: "Ai modificări nesalvate" })).toBeNull();
  });
});

describe("N-018 · operation bench and viewer history", { timeout: 15_000 }, () => {
  it("opens a file next to the operation (push), switches versions in place (replace), and closes back to the same operation", async () => {
    const fetch = serve();
    window.history.replaceState({}, "", "/lucrari/job-1?sectiune=operatii");
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "01 · Lipire" }));
    expect(param("task")).toBe("task-1");
    await user.click(await screen.findByRole("button", { name: "litere.dxf" }));
    const depth = window.history.length;
    await waitFor(() => expect(param("fisier")).toBe("file-old"));
    const viewer = await screen.findByRole("complementary", { name: "Vizor fișier litere.dxf" });
    expect(within(viewer).getByText("Pentru operația 01")).toBeInTheDocument();
    expect(within(viewer).getByRole("button", { name: "v1 · asociată" })).toHaveAttribute("aria-pressed", "true");
    expect(within(viewer).getByRole("button", { name: "Închide ×" })).toHaveFocus();

    // Another version replaces the entry and says what does not change.
    await user.click(within(viewer).getByRole("button", { name: "v2 · ulterioară" }));
    await waitFor(() => expect(param("fisier")).toBe("file-new"));
    expect(window.history.length).toBe(depth);
    const shown = screen.getByRole("complementary", { name: "Vizor fișier litere.dxf" });
    expect(within(shown).getByText("Consulți v2 (ulterioară). Asocierea rămâne la v1; utilizarea declarată nu se schimbă.")).toBeInTheDocument();
    await user.click(within(shown).getByRole("button", { name: "Revino la v1" }));
    await waitFor(() => expect(param("fisier")).toBe("file-old"));
    expect(screen.queryByText(/Consulți v2/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Extinde vizorul" }));
    expect(document.querySelector(".op-bench")).toHaveAttribute("data-expanded");
    await user.click(screen.getByRole("button", { name: "Restrânge vizorul" }));

    // Închide goes back to the entry before the viewer: the same operation, still open.
    await user.click(screen.getByRole("button", { name: "Închide ×" }));
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(param("task")).toBe("task-1");
    expect(screen.getByRole("navigation", { name: "Comutator operații" })).toBeInTheDocument();

    window.history.forward();
    await waitFor(() => expect(param("fisier")).toBe("file-old"));
    expect(await screen.findByRole("complementary", { name: "Vizor fișier litere.dxf" })).toBeInTheDocument();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("opens a file detail from Fișiere through the URL and Back returns to the same list", async () => {
    serve();
    window.history.replaceState({}, "", "/lucrari/job-1?sectiune=fisiere");
    const user = userEvent.setup();
    render(<App />);
    const open = (await screen.findAllByRole("button", { name: "Utilizări și versiuni →" }))[0]!;
    await user.click(open);
    await waitFor(() => expect(param("fisier")).toBe("file-old"));
    expect(await screen.findByRole("region", { name: "Detalii fișier litere.dxf" })).toBeInTheDocument();
    window.history.back();
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(section()).toBe("fisiere");
    expect(screen.queryByRole("region", { name: "Detalii fișier litere.dxf" })).toBeNull();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Utilizări și versiuni →" })[0]).toHaveFocus());
  });
});

describe("N-018 · context trail on the job sheet", { timeout: 15_000 }, () => {
  it("links client, request and offer by their references and names the open operation", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
      if (url.endsWith("/api/jobs/job-1/record")) return json({ record: jobRecordFixture });
      if (url.endsWith("/api/jobs/job-1")) return json({
        job: { jobId: "job-1", kind: "ASSEMBLY", productCode: "assembly", productLabel: "Panou și litere", inscription: "NORD", customerId: "cus-1", customerDisplayName: "Nord Market Demo SRL", stage: "EXECUTION_IN_PROGRESS", stageLabel: "În lucru", nextAction: "CONTINUE_EXECUTION", orderSnapshotId: "order", releaseSnapshotId: "release" },
        execution: { planId: "plan-1" }, request: { requestId: "req-1" }, quote: { quoteSnapshotId: "asmq:1", href: "/oferte/ansamblu/asmq%3A1" },
      });
      if (url.endsWith("/api/requests/req-1")) return json({ detail: { request: { requestId: "req-1", reference: "CER-847B52B5", title: "Fațadă", customerId: "cus-1", status: "NEW" } } });
      if (url.endsWith("/api/quotes/asmq%3A1")) return json({ quote: { quoteSnapshotId: "asmq:1", kind: "ASSEMBLY", kindLabel: "Ansamblu", productCode: "A", productLabel: "Panou", reference: "OF-3B592B0E", stage: "ORDER_CREATED", stageLabel: "Cu comandă", nextAction: "OPEN_ORDER", nextActionLabel: "Deschide comanda" } });
      if (url.includes("/execution-plans/plan-1")) return json({ executionPlan: { plan: { planId: "plan-1" }, progress: { completed: 0, total: 2 }, tasks: [
        { taskId: "task-1", seqLabel: "01", processLabel: "Lipire", scopeLabel: "Litere", status: "COMPLETED", statusLabel: "Finalizat", waitingFor: [] },
        { taskId: "task-2", seqLabel: "02", processLabel: "Control", scopeLabel: "Ansamblu", status: "COMPLETED", statusLabel: "Finalizat", waitingFor: [] },
      ] } });
      if (url.includes("/dossier")) return json({ dossier: { taskId: "task-2", instructions: [], observations: [], issues: [], files: [], planFiles: [], history: [] } });
      return json({});
    }));
    window.history.replaceState({}, "", "/lucrari/job-1?task=task-2&sectiune=operatii");
    render(<App />);
    const trail = await screen.findByRole("navigation", { name: "Firul lucrării" });
    expect(within(trail).getByRole("link", { name: "Nord Market Demo SRL" })).toHaveAttribute("href", "/clienti/cus-1");
    expect(await within(trail).findByRole("link", { name: "CER-847B52B5" })).toHaveAttribute("href", "/cereri/req-1");
    expect(await within(trail).findByRole("link", { name: "OF-3B592B0E" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    expect(within(trail).getByRole("link", { name: "Panou și litere" })).toHaveAttribute("href", "/lucrari/job-1");
    expect(await within(trail).findByText("Operația 02")).toHaveAttribute("aria-current", "page");
  });
});

describe("N-018 · the way back names the real origin", { timeout: 15_000 }, () => {
  it("opened from a client page, the job sheet returns there across its own section changes", async () => {
    serve();
    window.history.replaceState({}, "", "/clienti/cus-1");
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate("/lucrari/job-1"));
    await screen.findByRole("heading", { name: "Situația lucrării" });
    await user.click(screen.getByRole("link", { name: "Date lucrare" }));
    await screen.findByRole("region", { name: "Prioritatea și termenul" });
    const depth = window.history.length;
    const back = screen.getByRole("link", { name: "← Fișa clientului" });
    expect(back).toHaveAttribute("href", "/clienti/cus-1");
    await user.click(back);
    await waitFor(() => expect(window.location.pathname).toBe("/clienti/cus-1"));
    expect(window.history.length).toBe(depth);
  });

  it("after a direct link it is the job list", async () => {
    serve();
    window.history.replaceState({}, "", "/lucrari/job-1");
    render(<App />);
    await screen.findByRole("heading", { name: "Situația lucrării" });
    expect(screen.getByRole("link", { name: "← Lucrări" })).toHaveAttribute("href", "/lucrari");
  });
});
