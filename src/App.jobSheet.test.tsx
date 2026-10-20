import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { navigate } from "./routing/navigate";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("job sheet navigation", () => {
  it("keeps section, operation, plan search and a dossier draft across route changes", async () => {
    const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
      if (url.endsWith("/api/jobs/job-1")) return json({
        job: { jobId: "job-1", kind: "ASSEMBLY", productCode: "assembly", productLabel: "Panou și litere", inscription: "NORD", customerDisplayName: "Client sintetic", stage: "IN_EXECUTION", stageLabel: "În lucru", nextAction: "CONTINUE_EXECUTION", nextActionLabel: "Continuă execuția", orderSnapshotId: "order", releaseSnapshotId: "release" },
        execution: { planId: "plan-1" },
      });
      if (url.includes("/execution-plans/plan-1")) return json({ executionPlan: {
        plan: { planId: "plan-1", sourceSnapshotId: "snapshot", productLabel: "Panou și litere", inscription: "NORD" },
        progress: { completed: 0, total: 2, inProgress: 1, outside: 0, planned: 1, waitingDependencies: 0, noProvider: 0, varianceCount: 0 },
        tasks: [
          { taskId: "task-1", seqLabel: "01", processLabel: "Debitare", scopeLabel: "Față", status: "IN_PROGRESS", statusLabel: "În lucru", assignmentLabel: "Router", waitingFor: [] },
          { taskId: "task-2", seqLabel: "02", processLabel: "Lipire", scopeLabel: "Corp", status: "PLANNED", statusLabel: "Planificată", assignmentLabel: "Banc", waitingFor: [] },
        ],
      } });
      if (url.includes("/dossier")) return json({ dossier: { taskId: url.includes("task-1") ? "task-1" : "task-2", instructions: [], observations: [], issues: [], files: [], planFiles: [], history: [] } });
      if (url.includes("material-preparation")) return json({ preparation: { jobId: "job-1", planId: "plan-1", lines: [] } });
      if (url.includes("operator") && url.includes("session")) return json({ operator: { personId: "operator", displayName: "Maria" } });
      if (url.endsWith("/files")) return json({ archive: { jobId: "job-1", files: [], history: [] } });
      void init;
      return json({});
    });
    vi.stubGlobal("fetch", fetch);
    window.history.replaceState({}, "", "/lucrari/job-1");
    const user = userEvent.setup();
    render(<App />);
    const progress = await screen.findByRole("progressbar", { name: "Operații finalizate" }, { timeout: 10000 });
    expect(progress).toHaveAttribute("value", "0");
    expect(progress).toHaveAttribute("max", "2");
    await user.click(screen.getByRole("link", { name: "Operații" }));
    expect(screen.getByRole("link", { name: "Deschide în Atelier" })).toHaveAttribute("href", "/atelier?job=job-1&plan=plan-1&task=task-1");
    await user.type(await screen.findByRole("searchbox"), "Debitare");
    await user.click(screen.getByRole("link", { name: "01 · Debitare" }));
    const addObservation = await screen.findByRole("button", { name: "Adaugă observație" });
    await waitFor(() => expect(addObservation).toBeEnabled());
    await user.click(addObservation);
    await user.type(screen.getByLabelText("Observație"), "Verifică muchia");
    await user.click(screen.getByRole("link", { name: "Situație" }));
    expect(screen.queryByRole("textbox", { name: "Observație" })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Operații" }));
    expect(screen.getByRole("searchbox")).toHaveValue("Debitare");
    expect(screen.queryByRole("link", { name: "02 · Lipire" })).toBeNull();
    expect(await screen.findByLabelText("Observație")).toHaveValue("Verifică muchia");
    await act(async () => navigate("/lucrari/job-1?task=task-1&sectiune=fisiere"));
    expect(screen.getByRole("link", { name: "Documente și materiale" })).toHaveAttribute("aria-current", "page");
    await user.selectOptions(await screen.findByLabelText("Operație"), "task-2");
    await waitFor(() => expect(window.location.search).toBe("?task=task-2&sectiune=documente"));
    expect(screen.getByRole("link", { name: "Deschide dosarul operației" })).toHaveAttribute("href", "/lucrari/job-1?task=task-2&sectiune=operatii");
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
});
