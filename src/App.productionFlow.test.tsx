import { jobRecordFixture } from './test/jobRecordFixture';
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { navigate } from "./routing/navigate";

function json(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}
const task = {
  taskId: "task-1", seqLabel: "01", processLabel: "Lipire", scopeLabel: "Litere", status: "IN_PROGRESS",
  statusLabel: "În lucru", assignmentLabel: "Banc", waitingFor: [], requiresProvider: false,
  canComplete: true, requiresCompletedQuantity: true, measurableQuantity: { value: 3, unit: "buc" },
};
function fixture(options: { identified?: boolean; planned?: boolean; productionError?: boolean; incompleteResult?: boolean } = {}) {
  let identified = options.identified ?? true;
  let planned = options.planned ?? false;
  const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
    if (url.includes("/cloud/session")) return json({ mode: "single_plane", authConfigured: true });
    if (url.endsWith("/confirm-order") && method === "POST") return json({ orderSnapshot: { orderSnapshotId: "job-1" } });
    if (url.endsWith("/api/quotes/q-1")) return json({ quote: { quoteSnapshotId: "q-1", productCode: "PRD-DEMO", reference: "OF-1", nextAction: "ACCEPT_QUOTE", stage: "QUOTE_CREATED" } });
    if (url.includes("/quote-snapshots/q-1")) return json({ quoteSnapshot: { quoteSnapshotId: "q-1", productCode: "PRD-DEMO", productLabel: "Litere", inscription: "NORD", eic: { completeness: "COMPLETE", total: 50, lines: [], currency: "EUR" }, commercial: { completeness: "COMPLETE", grossPrice: 121, netPrice: 100, currency: "EUR" } } });
    if (url.endsWith("/jobs/job-1/production") && method === "POST") {
      if (options.productionError) return json({ error: "not_ready", reasons: ["Lipsește configurația confirmată."] }, 422);
      if (options.incompleteResult) return json({ releaseSnapshotId: "release-1" });
      planned = true;
      return json({ releaseSnapshotId: "release-1", executionPlan: { plan: { planId: "plan-1" } } });
    }
    if (url.endsWith("/jobs/job-1/record")) return json({ record: jobRecordFixture });
    if (url.endsWith("/jobs/job-1")) return json({ job: { jobId: "job-1", productCode: "PRD-DEMO", productLabel: "Litere", inscription: "NORD", customerDisplayName: "Client sintetic", stage: planned ? "EXECUTION_IN_PROGRESS" : "ORDER_CREATED", stageLabel: planned ? "În lucru" : "Comandă confirmată", nextAction: planned ? "CONTINUE_EXECUTION" : "RELEASE_TO_PRODUCTION", orderSnapshotId: "job-1", releaseSnapshotId: planned ? "release-1" : null }, execution: { planId: planned ? "plan-1" : null } });
    if (url.includes("/execution-plans/plan-1")) return json({ executionPlan: { plan: { planId: "plan-1", sourceSnapshotId: "release-1", productLabel: "Litere", inscription: "NORD" }, tasks: [task], progress: { completed: 0, total: 1, inProgress: 1 } }, job: { jobId: "job-1" } });
    if (url.includes("/operator-session")) {
      if (method === "POST") identified = true;
      return json({ operator: identified ? { personId: "person-1", displayName: "Maria" } : null });
    }
    if (url.includes("/operator-candidates")) return json({ candidates: [{ personId: "person-1", displayName: "Maria", pinConfigured: true }] });
    if (url.includes("/operator-task-inbox")) return json({ inbox: { inProgressMine: [{ ...task, planId: "plan-1", jobId: "job-1", productLabel: "Litere", inscription: "NORD", lane: "in_progress_mine" }], availableReady: [], availableNeedsProvider: [], waitingDependencies: [] } });
    if (url.endsWith("/dossier")) return json({ dossier: { taskId: "task-1", files: [], planFiles: [], instructions: [], observations: [], issues: [], history: [] } });
    if (url.includes("material-preparation")) return json({ preparation: { jobId: "job-1", planId: planned ? "plan-1" : null, lines: [] } });
    return json({});
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("simplified production journey", () => {
  it("confirms an offer, prepares production once and stays in the job's operations", async () => {
    const fetch = fixture();
    window.history.replaceState({}, "", "/quotes/PRD-DEMO/q-1");
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Confirmă comanda" }));
    await user.click(screen.getByRole("button", { name: "Da, confirm comanda" }));
    await user.click(await screen.findByRole("button", { name: "Trimite în producție" }));
    await screen.findByRole("heading", { name: "Situația lucrării" });
    expect(window.location.pathname).toBe("/lucrari/job-1");
    expect(new URLSearchParams(window.location.search).get("task")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Secțiunile lucrării" }).querySelectorAll("a")).toHaveLength(6);
    expect(screen.queryByRole("region", { name: "Fișierele lucrării" })).toBeNull();
    const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url));
    expect(posts).toEqual(["/api/products/PRD-DEMO/quote-snapshots/q-1/confirm-order", "/api/jobs/job-1/production"]);
  });

  it.each([
    { productionError: true, message: "Lipsește configurația confirmată." },
    { incompleteResult: true, message: "Lucrarea nu a putut fi trimisă în producție." },
  ])("keeps the sheet actionable after a refusal or unconfirmed result: $message", async ({ message, ...options }) => {
    const fetch = fixture(options);
    window.history.replaceState({}, "", "/lucrari/job-1");
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Trimite în producție" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(window.location.pathname).toBe("/lucrari/job-1");
    expect(screen.getByRole("button", { name: "Trimite în producție" })).toBeEnabled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("resumes a legacy selected operation after identification and retains its draft through the inbox", async () => {
    const fetch = fixture({ identified: false, planned: true });
    window.history.replaceState({}, "", "/executie/plan-1?task=task-1&job=job-1");
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Intră în atelier" }));
    await user.type(await screen.findByLabelText("Cantitate realizată"), "2");
    expect(window.location.pathname).toBe("/atelier");
    expect(new URLSearchParams(window.location.search).get("task")).toBe("task-1");
    expect(document.querySelectorAll("main")).toHaveLength(1);
    await user.click(screen.getByRole("link", { name: "← Lista mea de operații" }));
    expect(screen.queryByRole("textbox", { name: "Cantitate realizată" })).toBeNull();
    await user.click(await screen.findByRole("link", { name: /Lipire · Litere/ }));
    expect(await screen.findByLabelText("Cantitate realizată")).toHaveValue("2");
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url))).toEqual(["/api/operator-session"]);
  });

  it("keeps an invalid explicit task visible as an error in both workspaces", async () => {
    fixture({ planned: true });
    window.history.replaceState({}, "", "/lucrari/job-1?task=missing&sectiune=operatie");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Operația nu există în această lucrare");
    expect(new URLSearchParams(window.location.search).get("task")).toBe("missing");
    expect(screen.queryByRole("region", { name: "Dosarul operației selectate" })).toBeNull();
    await act(async () => navigate("/atelier?job=job-1&plan=plan-1&task=missing"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Operația nu există în această lucrare"));
    expect(screen.queryByLabelText("Cantitate realizată")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("task")).toBe("missing");
  });
});
