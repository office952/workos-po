import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsWorkload } from "./JobsWorkload";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function workloadPayload(overrides: Record<string, unknown> = {}) {
  return {
    workload: {
      canEditEffort: true,
      providers: [
        {
          provider: { kind: "MACHINE", kindLabel: "Utilaj", id: "mch:cnc", label: "CNC Router" },
          knownQueuedMinutes: 180,
          unknownEffortCount: 1,
          tasks: [
            {
              taskId: "task:known",
              executionPlanId: "exp:1",
              status: "PLANNED",
              statusLabel: "Planificat",
              processLabel: "Debitare CNC",
              requiredCapabilityLabel: "Debitare CNC",
              productLabel: "Litere ALPHA DEMO",
              inscription: "Litere ALPHA DEMO",
              jobId: "job-1",
              jobHref: "/lucrari/job-1",
              executionHref: "/executie/exp:1?task=task:known",
              assignedProvider: { id: "mch:cnc", kind: "MACHINE", label: "CNC Router" },
              plannedEffortMinutes: 45,
              requiresProvider: true,
              canEditEffort: true,
            },
            {
              taskId: "task:unknown",
              executionPlanId: "exp:1",
              status: "PLANNED",
              statusLabel: "Planificat",
              processLabel: "Debitare CNC",
              requiredCapabilityLabel: "Debitare CNC",
              productLabel: "Litere URBAN DEMO",
              inscription: "Litere URBAN DEMO",
              jobId: "job-1",
              jobHref: "/lucrari/job-1",
              executionHref: "/executie/exp:1?task=task:unknown",
              assignedProvider: { id: "mch:cnc", kind: "MACHINE", label: "CNC Router" },
              plannedEffortMinutes: null,
              requiresProvider: true,
              canEditEffort: true,
            },
          ],
        },
      ],
      unassigned: [
        {
          taskId: "task:open",
          executionPlanId: "exp:1",
          status: "PLANNED",
          statusLabel: "Planificat",
          processLabel: "Ansamblare",
          requiredCapabilityLabel: "Ansamblare",
          productLabel: "Litere ALPHA DEMO",
          inscription: "Litere ALPHA DEMO",
          jobId: "job-1",
          jobHref: "/lucrari/job-1",
          executionHref: "/executie/exp:1?task=task:open&job=job-1",
              assignedProvider: null,
              plannedEffortMinutes: null,
              requiresProvider: true,
              canEditEffort: true,
              customerDisplayName: "Client Ansamblu",
              priorityLabel: "Urgentă",
              targetDateLabel: "15.10.2026",
              scopeLabel: "Ansamblare",
            },
      ],
      ...overrides,
    },
  };
}

async function showEstimates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Estimări opționale", { selector: "summary" }));
  await user.click(screen.getByRole("checkbox", { name: "Afișează estimările" }));
}

describe("JobsWorkload", () => {
  it("shows work and resources without demanding estimates or mutating tasks", async () => {
    const payload = workloadPayload();
    const task = payload.workload.providers[0]!.tasks[1]!;
    Object.assign(task, { assignedProvider: null, providerBindingState: "UNIQUE_PENDING", providerBindingLabel: "Se asociază automat: CNC Router" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);
    render(<JobsWorkload />);
    expect(await screen.findByRole("heading", { name: "Pe utilaje și zone" })).toBeInTheDocument();
    expect(await screen.findByText("CNC Router")).toBeInTheDocument();
    expect(screen.getByText("Se asociază automat: CNC Router")).toBeInTheDocument();
    expect(screen.queryByText("Fără estimare")).not.toBeInTheDocument();
    expect(screen.queryByText("Timp cunoscut 3h")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "45 min" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alocă în execuție" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deschide operația · Ansamblare/ })).toHaveAttribute("href", "/executie/exp:1?task=task:open&job=job-1");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("keeps an optional estimate draft through search and switching registry views", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(workloadPayload()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { rerender } = render(<JobsWorkload />);
    await screen.findByText("CNC Router");
    await showEstimates(user);
    await user.click(screen.getByRole("button", { name: "45 min" }));
    await user.clear(screen.getByLabelText("Ore"));
    await user.type(screen.getByLabelText("Ore"), "2");
    const search = screen.getByRole("searchbox", { name: "Caută în utilaje și zone" });
    await user.type(search, "Client Ansamblu");
    expect(screen.queryByText("CNC Router")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "CNC Router");
    expect(screen.getByLabelText("Ore")).toHaveValue("2");
    expect(screen.getByText("Întregul utilaj / zonă: Timp cunoscut 3h")).toBeInTheDocument();
    await user.clear(search);
    rerender(<JobsWorkload active={false} />);
    expect(screen.queryByRole("heading", { name: "Pe utilaje și zone" })).not.toBeInTheDocument();
    rerender(<JobsWorkload />);
    expect(await screen.findByLabelText("Ore")).toHaveValue("2");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("lets the owner explicitly open, edit and clear an optional estimate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(workloadPayload()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<JobsWorkload />);
    await screen.findByText("CNC Router");
    await showEstimates(user);
    await user.click(screen.getByRole("button", { name: "45 min" }));
    await user.clear(screen.getByLabelText("Ore"));
    await user.type(screen.getByLabelText("Ore"), "1");
    await user.clear(screen.getByLabelText("Minute"));
    await user.type(screen.getByLabelText("Minute"), "30");
    await user.click(screen.getByRole("button", { name: "Salvează" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/execution-tasks/task%3Aknown/planned-effort", expect.objectContaining({ method: "POST", body: JSON.stringify({ plannedEffortMinutes: 90 }) }));
    await user.click(screen.getByRole("button", { name: "45 min" }));
    await user.clear(screen.getByLabelText("Ore"));
    await user.clear(screen.getByLabelText("Minute"));
    await user.click(screen.getByRole("button", { name: "Salvează" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/execution-tasks/task%3Aknown/planned-effort", expect.objectContaining({ method: "POST", body: JSON.stringify({ plannedEffortMinutes: null }) }));
  });

  it("keeps a member's optional estimate view read-only", async () => {
    const payload = workloadPayload();
    payload.workload.canEditEffort = false;
    payload.workload.providers[0]!.tasks.forEach(task => { task.canEditEffort = false; });
    payload.workload.unassigned.forEach(task => { task.canEditEffort = false; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));
    render(<JobsWorkload />);
    await screen.findByText("CNC Router");
    await showEstimates(userEvent.setup());
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "45 min" })).not.toBeInTheDocument();
  });

  it("shows manual-only work without asking for a machine", async () => {
    const task = workloadPayload().workload.unassigned[0]!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(workloadPayload({ providers: [], unassigned: [], manual: [{ ...task, requiresProvider: false, providerBindingLabel: "Fără utilaj sau zonă obligatorie." }] }))));
    render(<JobsWorkload />);
    expect(await screen.findByRole("heading", { name: "Operații fără utilaj obligatoriu" })).toBeInTheDocument();
    expect(screen.queryByText("Resurse de verificat")).not.toBeInTheDocument();
    expect(screen.queryByText("Fără estimare")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deschide operația/ })).toBeInTheDocument();
  });
});
