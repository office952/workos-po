import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { JobOperationFiles } from "./JobOperationFiles";

const plan = presentExecutionPlan({ executionPlan: {
  plan: { planId: "plan", sourceSnapshotId: "source" },
  tasks: [{ taskId: "one", processLabel: "Debitare", seqLabel: "01" }, { taskId: "two", processLabel: "Lipire", seqLabel: "02" }],
} })!;

afterEach(() => vi.unstubAllGlobals());

describe("JobOperationFiles", () => {
  it("warns about a newer general revision while retaining the assigned original", async () => {
    const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const body = String(input).endsWith("/files")
        ? { archive: { jobId: "job", files: [{ artifactId: "new", originalFileName: "revision.txt", supersedesArtifactId: "old" }], history: [] } }
        : { dossier: { taskId: "one", files: [{ artifactId: "old", originalFileName: "assigned.txt", sizeLabel: "1 KB", downloadHref: "/api/execution-artifacts/old/download" }], planFiles: [] } };
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
    vi.stubGlobal("fetch", fetch);
    render(<JobOperationFiles jobId="job" plan={plan} task={plan.tasks[0]} onSelect={() => {}} />);
    expect(await screen.findByText(/Există o versiune mai nouă/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descarcă fișierul" })).toHaveAttribute("href", "/api/execution-artifacts/old/download");
    expect(screen.queryByRole("button", { name: /Asociază|folosit/ })).toBeNull();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("loads only the selected dossier and prevents an old response from replacing its files", async () => {
    let resolveFirst!: (value: unknown) => void;
    const response = (taskId: string, name: string) => ({ ok: true, status: 200, json: async () => ({ dossier: {
      taskId, files: [{ artifactId: name, originalFileName: name, purposeLabel: null, sizeLabel: "1 KB", downloadHref: `/api/execution-artifacts/${name}/download` }],
    } }) });
    const fetch = vi.fn((input: RequestInfo) => String(input).endsWith("/files")
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ archive: { jobId: "job", files: [], history: [] } }) })
      : String(input).includes("/one/")
      ? new Promise(resolve => { resolveFirst = resolve; })
      : Promise.resolve(response("two", "new.txt")));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<JobOperationFiles jobId="job" plan={plan} task={plan.tasks[0]} onSelect={() => {}} />);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/dossier"))).toHaveLength(1);
    rerender(<JobOperationFiles jobId="job" plan={plan} task={plan.tasks[1]} onSelect={() => {}} />);
    expect(await screen.findByRole("link", { name: "Descarcă fișierul" })).toHaveAttribute("href", "/api/execution-artifacts/new.txt/download");
    await act(async () => resolveFirst(response("one", "old.txt")));
    expect(screen.queryByText("old.txt")).toBeNull();
    expect(screen.getByRole("link", { name: "Deschide dosarul operației" })).toHaveAttribute("href", "/lucrari/job?task=two&sectiune=operatii");
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/dossier"))).toHaveLength(2);
  });

  it("does not call a failed dossier an empty file list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<JobOperationFiles jobId="job" plan={plan} task={plan.tasks[0]} onSelect={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Fișierele nu au putut fi actualizate");
    expect(screen.queryByText("Operația nu are încă fișiere asociate.")).toBeNull();
  });
});
