import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { resetResourceCache } from "./data/resourceCache";
import { jobRecordFixture } from "./test/jobRecordFixture";

// N-018 · review regressions for the operation viewer: Esc, focus return, history, one download.

function json(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 300, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body });
}

const pdfRecordFile = (artifactId: string, supersedes: string | null, taskId: string | null) => ({
  artifactId, originalFileName: "desen.pdf", mimeType: "application/pdf", sizeLabel: "3 KB", purpose: "WORKING", purposeLabel: "Fișier de lucru",
  note: null, preview: "PDF", supersedesArtifactId: supersedes, authorLabel: "Elena", uploadedAt: "2026-10-20T07:00:00Z",
  downloadHref: `/api/execution-artifacts/${artifactId}/download`,
  usages: taskId ? [{ taskId, taskLabel: "01 · Lipire", linkedAt: "2026-10-20T07:10:00Z", usedAt: null, usedByLabel: null }] : [],
});

const record = { ...jobRecordFixture, files: [pdfRecordFile("pdf-1", null, "task-1"), pdfRecordFile("pdf-2", "pdf-1", null)] };

const dossierFile = {
  artifactId: "pdf-1", originalFileName: "desen.pdf", mimeType: "application/pdf", sizeLabel: "3 KB", category: "WORKING", purpose: "WORKING",
  purposeLabel: "Fișier de lucru", note: null, usedAt: null, preview: "PDF", uploadedAt: "2026-10-20T07:00:00Z",
  downloadHref: "/api/execution-artifacts/pdf-1/download", linkedToTask: true, supersedesArtifactId: null,
};

function serve() {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/download")) {
      // jsdom's Response.blob() drops the MIME type; answer with a typed Blob like a browser does.
      return Promise.resolve({ ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), blob: async () => new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }) });
    }
    if (url.endsWith("/api/health")) return json({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
    if (url.endsWith("/api/jobs/job-1/record")) return json({ record });
    if (url.endsWith("/api/jobs/job-1")) return json({
      job: { jobId: "job-1", kind: "ASSEMBLY", productCode: "assembly", productLabel: "Panou și litere", inscription: "NORD", customerDisplayName: "Client sintetic", stage: "EXECUTION_IN_PROGRESS", stageLabel: "În lucru", nextAction: "CONTINUE_EXECUTION", orderSnapshotId: "order", releaseSnapshotId: "release" },
      execution: { planId: "plan-1" },
    });
    if (url.includes("/execution-plans/plan-1")) return json({ executionPlan: { plan: { planId: "plan-1" }, progress: { completed: 2, total: 2 }, tasks: [
      { taskId: "task-1", seqLabel: "01", processLabel: "Lipire", scopeLabel: "Litere", status: "COMPLETED", statusLabel: "Finalizat", waitingFor: [] },
      { taskId: "task-2", seqLabel: "02", processLabel: "Control", scopeLabel: "Ansamblu", status: "COMPLETED", statusLabel: "Finalizat", waitingFor: [] },
    ] } });
    if (url.includes("/dossier")) return json({ dossier: { taskId: url.includes("task-1") ? "task-1" : "task-2", instructions: [], observations: [], issues: [], files: url.includes("task-1") ? [dossierFile] : [], planFiles: [], history: [] } });
    return json({});
  }));
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:synthetic");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const viewer = () => screen.queryByRole("complementary", { name: "Vizor fișier desen.pdf" });

async function openViewer() {
  serve();
  window.history.replaceState({}, "", "/lucrari/job-1?sectiune=operatii");
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "01 · Lipire" }));
  const opener = await screen.findByRole("button", { name: "desen.pdf" });
  await user.click(opener);
  await waitFor(() => expect(param("fisier")).toBe("pdf-1"));
  expect(await screen.findByRole("complementary", { name: "Vizor fișier desen.pdf" })).toBeInTheDocument();
  return { user, opener: () => screen.getByRole("button", { name: "desen.pdf" }) };
}

describe("N-018 review · operation viewer: Esc and focus", () => {
  it("Esc closes only the viewer: fisier leaves the URL, the same operation stays open", async () => {
    const { user, opener } = await openViewer();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(viewer()).toBeNull();
    expect(param("task")).toBe("task-1");
    expect(screen.getByRole("navigation", { name: "Comutator operații" })).toBeInTheDocument();
    await waitFor(() => expect(opener()).toHaveFocus());
  });

  it("closing from the button returns focus to the file that opened the viewer", async () => {
    const { user, opener } = await openViewer();
    await user.click(within(viewer()!).getByRole("button", { name: "Închide ×" }));
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(param("task")).toBe("task-1");
    await waitFor(() => expect(opener()).toHaveFocus());
  });

  it("after another version and Extinde/Restrânge, Esc still closes only the viewer and focus returns to the opener", async () => {
    const { user, opener } = await openViewer();
    await user.click(within(viewer()!).getByRole("button", { name: "v2 · ulterioară" }));
    await waitFor(() => expect(param("fisier")).toBe("pdf-2"));
    await user.click(within(viewer()!).getByRole("button", { name: "Extinde vizorul" }));
    await user.click(within(viewer()!).getByRole("button", { name: "Restrânge vizorul" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(param("task")).toBe("task-1");
    await waitFor(() => expect(opener()).toHaveFocus());
  });

  it("browser Back closes the viewer to the same operation, with focus on the opener", async () => {
    const { opener } = await openViewer();
    window.history.back();
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(param("task")).toBe("task-1");
    expect(viewer()).toBeNull();
    await waitFor(() => expect(opener()).toHaveFocus());
  });

  it("after a direct link (or a refresh) closing replaces the entry and focus falls back to the operation title", async () => {
    serve();
    window.history.replaceState({}, "", "/lucrari/job-1?task=task-1&sectiune=operatii&fisier=pdf-2");
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("complementary", { name: "Vizor fișier desen.pdf" })).toBeInTheDocument();
    const depth = window.history.length;
    await user.keyboard("{Escape}");
    await waitFor(() => expect(param("fisier")).toBeNull());
    expect(param("task")).toBe("task-1");
    expect(window.history.length).toBe(depth);
    await waitFor(() => expect(screen.getByRole("heading", { name: "01 · Lipire" })).toHaveFocus());
  });

  it("keeps the same iframe through Extinde/Restrânge and offers one download action for the consulted version", async () => {
    const { user } = await openViewer();
    const frame = await waitFor(() => {
      const element = viewer()!.querySelector("iframe");
      expect(element).not.toBeNull();
      return element!;
    });
    await user.click(within(viewer()!).getByRole("button", { name: "Extinde vizorul" }));
    expect(viewer()!.querySelector("iframe")).toBe(frame);
    await user.click(within(viewer()!).getByRole("button", { name: "Restrânge vizorul" }));
    expect(viewer()!.querySelector("iframe")).toBe(frame);
    const downloads = within(viewer()!).getAllByRole("link").filter((link) => /descarc/i.test(link.textContent ?? ""));
    expect(downloads.map((link) => link.textContent)).toEqual(["Descarcă această versiune"]);
  });
});
