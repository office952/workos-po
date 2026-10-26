import { jobRecordFixture } from './test/jobRecordFixture';
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("job sheet navigation", { timeout: 15_000 }, () => {
  it("keeps an explicit operation draft across section changes and restores it from the URL", async () => {
    const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
      if (url.endsWith("/api/jobs/job-1/record")) return json({ record: jobRecordFixture });
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
    expect(await screen.findByRole("heading", { name: "Situația lucrării" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Fișierele lucrării" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Dosarul operației selectate" })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Operații" }));
    await user.click(await screen.findByRole("button", { name: "01 · Lipire" }));
    const addObservation = await screen.findByRole("button", { name: "Adaugă observație" });
    await waitFor(() => expect(addObservation).toBeEnabled());
    await user.click(addObservation);
    await user.type(screen.getByLabelText("Observație"), "Verifică muchia");
    await user.click(screen.getByRole("link", { name: "Fișiere" }));
    expect(await screen.findByRole("region", { name: "Fișierele lucrării" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Observație" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Registrul operațiilor" })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Operații" }));
    expect(await screen.findByRole("textbox", { name: "Observație" })).toHaveValue("Verifică muchia");
    expect(new URLSearchParams(window.location.search).get("task")).toBe("task-1");
    expect(new URLSearchParams(window.location.search).get("sectiune")).toBe("operatii");
    // The operation was pushed before Fișiere and Operații: closing replaces, it does not go back there.
    await user.click(screen.getByRole("button", { name: "Închide detaliul" }));
    const toggle = await screen.findByRole("button", { name: "01 · Lipire" });
    await waitFor(() => expect(toggle).toHaveFocus());
    expect(new URLSearchParams(window.location.search).get("sectiune")).toBe("operatii");
    expect(screen.queryByRole("textbox", { name: "Observație" })).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole("textbox", { name: "Observație" })).toHaveValue("Verifică muchia");
    window.history.back();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("task")).toBeNull());
    expect(screen.queryByRole("region", { name: "Dosarul operației selectate" })).toBeNull();
    window.history.forward();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Observație" })).toHaveValue("Verifică muchia"));
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
});
