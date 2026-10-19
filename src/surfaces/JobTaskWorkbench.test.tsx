import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardResourceCache } from "../data/resourceCache";
import { advanceCloudBoundaryVersion } from "../session/sessionExpiryBridge";
import { TransportError } from "../api/http";
import type { DossierFile, TaskDossier } from "../api/taskDossier";
import type {
  ExecutionPlanTransport,
  ExecutionTaskTransport,
} from "../api/types";
import { JobTaskWorkbench } from "./JobTaskWorkbench";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  observe: vi.fn(),
  issue: vi.fn(),
  instruct: vi.fn(),
  link: vi.fn(),
  use: vi.fn(),
  upload: vi.fn(),
  archive: vi.fn(),
  operator: { personId: "operator", displayName: "Ana" } as {
    personId: string;
    displayName: string;
  } | null,
  cloud: {
    ready: true,
    unavailable: false,
    mode: "cloud",
    user: { email: "owner@example.test" },
    organization: { organizationId: "org-a", membershipRole: "owner" },
  },
}));
vi.mock("../session/CloudSessionContext", () => ({
  useCloudSession: () => mocks.cloud,
}));
vi.mock("../data/routeLoaders", () => ({
  loadOperatorSession: () => Promise.resolve(mocks.operator),
}));
vi.mock("../api/jobFiles", () => ({
  loadJobFiles: (...args: unknown[]) => mocks.archive(...args),
}));
vi.mock("../api/taskDossier", () => ({
  loadTaskDossier: (...args: unknown[]) => mocks.load(...args),
  addTaskObservation: (...args: unknown[]) => mocks.observe(...args),
  reportTaskIssue: (...args: unknown[]) => mocks.issue(...args),
  addTaskInstruction: (...args: unknown[]) => mocks.instruct(...args),
  linkTaskArtifact: (...args: unknown[]) => mocks.link(...args),
  markTaskArtifactUsed: (...args: unknown[]) => mocks.use(...args),
  uploadTaskArtifact: (...args: unknown[]) => mocks.upload(...args),
}));
vi.mock("./JobArtifactPreview", () => ({
  JobArtifactPreview: ({ file }: { file: DossierFile | null }) => (
    <div data-testid="preview">
      {file?.originalFileName ?? "Niciun document"}
    </div>
  ),
}));

function task(seq: number): ExecutionTaskTransport {
  return {
    taskId: `task-${seq}`,
    processLabel: `Operația ${seq}`,
    scopeLabel: seq < 3 ? "Litere" : "Panou",
    seqLabel: String(seq).padStart(2, "0"),
    status: "PLANNED",
    statusLabel: "Planificată",
    assignmentLabel: "Router",
    requiresProvider: true,
    requiredCapabilityId: null,
    requiredCapabilityLabel: null,
    canAssign: false,
    canAssignProvider: false,
    canClaimStart: false,
    canComplete: false,
    requiresCompletedQuantity: false,
    plannedQuantity: null,
    plannedQuantityLabel: null,
    completedQuantityLabel: null,
    varianceLabel: null,
    waitingFor: [],
    dependsOnLabels: [],
    eligibleProviders: [],
    startBlockReason: null,
    operatorRelation: null,
    startedByLabel: null,
    executorLabel: null,
    canRecordActualConsumption: false,
    plannedResources: [],
    actualConsumption: [],
    plannedEffortMinutes: null,
    plannedTimeLabel: "Necunoscut",
    actualDurationMinutes: null,
    actualDurationLabel: "Necunoscut",
    timeVarianceMinutes: null,
    timeVarianceLabel: null,
    machineRuns: [],
    machineRunTotalMinutes: null,
    machineRunTotalLabel: null,
    canStartMachineRun: false,
    canStopMachineRun: false,
    completionBlockedByActiveMachineRun: false,
    activeMachineRunLabel: null,
    activeMachineRunStartedLabel: null,
  };
}
function plan(count = 3): ExecutionPlanTransport {
  return {
    planId: "plan-1",
    productLabel: "Litere",
    inscription: "EXEMPLU",
    priorityLabel: null,
    targetDateLabel: null,
    statusLabel: "Planificat",
    progressLabel: "0 / 3",
    progress: null,
    sourceSnapshotId: "snapshot",
    jobId: "job-1",
    tasks: Array.from({ length: count }, (_, index) => task(index + 1)),
    externalProviderChoices: [],
    timeSummary: null,
    siteInstallation: null,
  };
}
function file(id: string): DossierFile {
  return {
    artifactId: id,
    originalFileName: `${id}.cdr`,
    mimeType: "application/octet-stream",
    sizeLabel: "2 KB",
    category: "TECHNICAL",
    purpose: null,
    purposeLabel: null,
    note: null,
    usedAt: null,
    preview: "NONE",
    uploadedAt: "2026-10-17T10:00:00Z",
    downloadHref: `/api/execution-artifacts/${id}/download`,
    linkedToTask: true,
  };
}
function dossier(id: string, files: DossierFile[] = []): TaskDossier {
  return {
    taskId: id,
    instructions: [],
    observations: [],
    issues: [],
    files,
    planFiles: [],
    history: [],
  };
}
function Harness({ count = 3 }: { count?: number }) {
  const [selected, select] = useState("task-1");
  return (
    <JobTaskWorkbench
      jobId="job-1"
      plan={plan(count)}
      taskId={selected}
      onSelect={select}
    />
  );
}
const values: Record<string, TaskDossier> = {};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.operator = { personId: "operator", displayName: "Ana" };
  mocks.cloud.organization.organizationId = "org-a";
  mocks.cloud.organization.membershipRole = "owner";
  for (const key of Object.keys(values)) delete values[key];
  values["task-1"] = dossier("task-1", [file("drawing-a"), file("drawing-b")]);
  values["task-2"] = dossier("task-2", [file("drawing-a")]);
  mocks.load.mockImplementation(
    async (id: string) => values[id] ?? dossier(id),
  );
  mocks.archive.mockResolvedValue({ jobId: "job-1", files: [], history: [] });
  mocks.observe.mockImplementation(async (id: string, body: string) => {
    const next = {
      ...values[id],
      observations: [
        ...values[id].observations,
        {
          entryId: "observation-1",
          kind: "OBSERVATION",
          body,
          reasonCode: null,
          reasonLabel: null,
          authorLabel: "Ana",
          createdAt: "2026-10-17T10:20:00Z",
        },
      ],
    };
    values[id] = next;
    return next;
  });
});

describe("JobTaskWorkbench", () => {
  it("keeps the recorded executor visible and searchable when only the start record names them", async () => {
    const selected = vi.fn();
    const current = plan(2);
    current.tasks[0] = { ...current.tasks[0], startedByLabel: "Ștefan Ionescu" };
    render(<JobTaskWorkbench jobId="job-1" plan={current} taskId="task-1" onSelect={selected} />);
    await screen.findByTestId("preview");
    expect(within(screen.getByRole("region", { name: "Operația selectată" })).getByText("Executant înregistrat: Ștefan Ionescu")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  stefan  " } });
    const list = within(screen.getByRole("region", { name: "Lista operațiilor" }));
    expect(list.getByRole("button", { name: /01 Operația 1/ })).toBeInTheDocument();
    expect(list.queryByRole("button", { name: /02 Operația 2/ })).toBeNull();
    expect(selected).not.toHaveBeenCalled();
    expect(mocks.load.mock.calls.every(([id]) => id === "task-1")).toBe(true);
  });

  it("loads only the selected dossier for 100 tasks and retains selection during search", async () => {
    const user = userEvent.setup();
    render(<Harness count={100} />);
    expect(await screen.findByTestId("preview")).toHaveTextContent(
      "drawing-a.cdr",
    );
    expect(mocks.load.mock.calls.every(([id]) => id === "task-1")).toBe(true);
    expect(mocks.load.mock.calls.length).toBeLessThanOrEqual(2);
    expect(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getAllByRole("button"),
    ).toHaveLength(100);
    await user.type(screen.getByRole("searchbox"), "100");
    expect(screen.getByTestId("preview")).toHaveTextContent("drawing-a.cdr");
    expect(
      screen.getByText(/Operația selectată rămâne deschisă/),
    ).toBeInTheDocument();
    expect(mocks.load.mock.calls.every(([id]) => id === "task-1")).toBe(true);
    expect(mocks.load.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it("preserves task scroll and remembers each task's document", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    const list = document.querySelector(".job-task-navigator__list")!;
    list.scrollTop = 190;
    await user.click(screen.getByRole("button", { name: /drawing-b.cdr/ }));
    const nav = screen.getByRole("region", { name: "Lista operațiilor" });
    await user.click(
      within(nav).getByRole("button", { name: /02 Operația 2/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview")).toHaveTextContent("drawing-a.cdr"),
    );
    await user.click(
      within(nav).getByRole("button", { name: /01 Operația 1/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview")).toHaveTextContent("drawing-b.cdr"),
    );
    expect(document.querySelector(".job-task-navigator__list")).toBe(list);
    expect(list.scrollTop).toBe(190);
  });
  it("keeps separate drafts per task and category, retaining text on save failure", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(
      screen.getByLabelText("Observație"),
      "Muchia trebuie verificată",
    );
    await user.click(
      screen.getByRole("button", { name: "Închide formularul" }),
    );
    await user.click(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /02 Operația 2/ }),
    );
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    expect(screen.getByLabelText("Observație")).toHaveValue("");
    await user.click(
      screen.getByRole("button", { name: "Închide formularul" }),
    );
    await user.click(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /01 Operația 1/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Semnalează problemă" }),
    );
    expect(screen.getByLabelText("Descrierea problemei")).toHaveValue("");
    await user.click(
      screen.getByRole("button", { name: "Închide formularul" }),
    );
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    expect(screen.getByLabelText("Observație")).toHaveValue(
      "Muchia trebuie verificată",
    );
    mocks.observe.mockRejectedValueOnce(
      new TransportError("failed", 422, { error: "invalid_text" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvează mesajul" }));
    expect(
      await screen.findByText(
        "Textul trebuie să aibă între 1 și 2000 de caractere.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Observație")).toHaveValue(
      "Muchia trebuie verificată",
    );
  });
  it("keeps late save results on their original task and updates only known counters", async () => {
    const user = userEvent.setup();
    let resolve!: (value: TaskDossier) => void;
    mocks.observe.mockImplementation(
      () =>
        new Promise<TaskDossier>((done) => {
          resolve = done;
        }),
    );
    render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(screen.getByLabelText("Observație"), "Pentru primul task");
    await user.click(screen.getByRole("button", { name: "Salvează mesajul" }));
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /02 Operația 2/ }),
    );
    const next = dossier("task-1");
    next.observations.push({
      entryId: "saved",
      kind: "OBSERVATION",
      body: "Pentru primul task",
      reasonCode: null,
      reasonLabel: null,
      authorLabel: "Ana",
      createdAt: "2026-10-17T10:30:00Z",
    });
    values["task-1"] = next;
    resolve(next);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Pentru primul task")).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /01 Operația 1/ }),
    ).toHaveTextContent("1 observații");
    expect(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /03 Operația 3/ }),
    ).toHaveTextContent("Dosar la selectare");
  });
  it("shows a lone instruction outside the observation count", async () => {
    values["task-1"] = {
      ...dossier("task-1"),
      instructions: [
        {
          entryId: "ins-1",
          kind: "INSTRUCTION",
          body: "Taie pe contur",
          reasonCode: null,
          reasonLabel: null,
          authorLabel: "Owner",
          createdAt: "2026-10-18T01:00:00Z",
        },
      ],
    };
    render(<Harness />);
    expect(
      await screen.findByRole("region", { name: "Instrucțiuni pentru această operație" }),
    ).toHaveTextContent("Taie pe contur");
    expect(screen.getByText(/0 observații · 0 probleme semnalate/)).toBeInTheDocument();
  });
  it("requires an operator for reports even for Owner, while preserving upload and instruction access", async () => {
    mocks.operator = null;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    expect(
      screen.getByRole("button", { name: "Adaugă observație" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Semnalează problemă" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Adaugă fișier +" }),
    ).toBeEnabled();
    await user.click(
      screen.getByText(/Observații și probleme/, { selector: "summary" }),
    );
    expect(
      screen.getByRole("button", { name: "Adaugă instrucțiune" }),
    ).toBeInTheDocument();
  });
  it("sends issue reason without execution lifecycle commands", async () => {
    mocks.issue.mockResolvedValue(dossier("task-1"));
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(
      screen.getByRole("button", { name: "Semnalează problemă" }),
    );
    await user.selectOptions(screen.getByLabelText("Motiv"), "DRAWING");
    await user.type(
      screen.getByLabelText("Descrierea problemei"),
      "Revizie de clarificat",
    );
    await user.click(screen.getByRole("button", { name: "Salvează mesajul" }));
    await waitFor(() =>
      expect(mocks.issue).toHaveBeenCalledWith(
        "task-1",
        "DRAWING",
        "Revizie de clarificat",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Operația 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Deschide Execuția/ }),
    ).toHaveAttribute("href", "/executie/plan-1?task=task-1&job=job-1");
  });
  it("shows real supersedes warnings without auto-selecting the newer file", async () => {
    mocks.archive.mockResolvedValue({
      jobId: "job-1",
      files: [
        {
          artifactId: "next",
          originalFileName: "revizie-noua.cdr",
          supersedesArtifactId: "drawing-a",
        },
      ],
      history: [],
    });
    render(<Harness />);
    await screen.findByTestId("preview");
    expect(
      await screen.findByText(/Există o versiune ulterioară/),
    ).toHaveTextContent("revizie-noua.cdr");
    expect(screen.getByTestId("preview")).toHaveTextContent("drawing-a.cdr");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Deschide revizie-noua.cdr" }),
    );
    expect(screen.getByTestId("preview")).toHaveTextContent("revizie-noua.cdr");
    expect(mocks.link).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Revino la documentul asociat" }),
    );
    expect(screen.getByTestId("preview")).toHaveTextContent("drawing-a.cdr");
  });
  it("searches all files and retains a selection outside the first three", async () => {
    values["task-1"] = dossier(
      "task-1",
      Array.from({ length: 12 }, (_, index) => file(`doc-${index}`)),
    );
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(
      screen.getByRole("button", { name: "Toate fișierele · 12" }),
    );
    await user.type(screen.getByLabelText("Caută fișier"), "doc-11");
    await user.click(screen.getByRole("button", { name: /doc-11.cdr/ }));
    expect(screen.getByTestId("preview")).toHaveTextContent("doc-11.cdr");
    expect(screen.getByRole("button", { name: /doc-11.cdr/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("does not let an older dossier GET erase a message returned by POST", async () => {
    let resolveInitial!: (value: TaskDossier) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise<TaskDossier>((resolve) => {
          resolveInitial = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Adaugă observație" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(
      screen.getByLabelText("Observație"),
      "Mesaj salvat înainte de GET",
    );
    await user.click(screen.getByRole("button", { name: "Salvează mesajul" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByText(/Observații și probleme/, { selector: "summary" }),
    );
    expect(screen.getByText("Mesaj salvat înainte de GET")).toBeInTheDocument();
    await act(async () => resolveInitial(dossier("task-1")));
    expect(screen.getByText("Mesaj salvat înainte de GET")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Lista operațiilor" }),
      ).getByRole("button", { name: /01 Operația 1/ }),
    ).toHaveTextContent("1 observații");
  });
  it("selects the returned uploaded artifact, including beyond the three-file shelf", async () => {
    values["task-1"] = dossier("task-1", [
      file("old-a"),
      file("old-b"),
      file("old-c"),
    ]);
    mocks.upload.mockImplementation(async (id: string) => {
      values[id] = {
        ...values[id],
        files: [...values[id].files, file("new-artifact")],
      };
      return values[id];
    });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(screen.getByRole("button", { name: "Adaugă fișier +" }));
    await user.upload(
      screen.getByLabelText("Fișier nou · cel mult 50 MB"),
      new File(["CDR bytes"], "new-artifact.cdr", {
        type: "application/octet-stream",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Încarcă fișierul" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("preview")).toHaveTextContent("new-artifact.cdr");
    expect(
      screen.getByRole("button", { name: /new-artifact.cdr/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.upload).toHaveBeenCalledWith("task-1", expect.any(File), {
      purpose: "",
      note: "",
      supersedesArtifactId: "",
    });
  });
  it("clears local drafts on a cloud organization boundary", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await screen.findByTestId("preview");
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(
      screen.getByLabelText("Observație"),
      "Ciornă privată organizației A",
    );
    await user.click(
      screen.getByRole("button", { name: "Închide formularul" }),
    );
    await act(async () => {
      mocks.cloud.organization.organizationId = "org-b";
      advanceCloudBoundaryVersion();
      discardResourceCache();
      view.rerender(<Harness />);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Adaugă observație" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    expect(screen.getByLabelText("Observație")).toHaveValue("");
  });
  it("consecrates usage only on the selected task, with no unmark action", async () => {
    mocks.use.mockImplementation(async (id: string, artifactId: string) => {
      values[id] = {
        ...values[id],
        files: values[id].files.map((item) =>
          item.artifactId === artifactId
            ? { ...item, usedAt: "2026-10-17T12:00:00Z" }
            : item,
        ),
      };
      return values[id];
    });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByTestId("preview");
    expect(screen.getByRole("region", { name: "Istoricul operației" })).toBeInTheDocument();
    await user.click(
      screen.getByText("Detalii și utilizare", {
        selector: "summary",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Am folosit acest fișier" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Am folosit acest fișier" }),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.use).toHaveBeenCalledWith("task-1", "drawing-a");
    expect(values["task-2"].files[0].usedAt).toBeNull();
  });
});
