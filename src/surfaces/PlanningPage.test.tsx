import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningPage } from "./PlanningPage";

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
        },
      ],
      ...overrides,
    },
  };
}

describe("PlanningPage", () => {
  it("shows the planner floorplan without priority or weekly total language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(workloadPayload())));

    render(<PlanningPage />);

    expect(await screen.findByRole("heading", { name: "Planificare" })).toBeInTheDocument();
    expect(screen.getByText("CNC Router")).toBeInTheDocument();
    expect(screen.getByText("Timp cunoscut 3h")).toBeInTheDocument();
    expect(screen.getByText("Fără estimare 1 sarcină")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alocă în Execuție/ })).toHaveAttribute(
      "href",
      "/executie/exp:1?task=task:open&job=job-1",
    );
    expect(screen.queryByText(/Prioritate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total =/i)).not.toBeInTheDocument();
  });

  it("lets the owner edit estimated time on a planned task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(workloadPayload()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<PlanningPage />);
    await screen.findByText("CNC Router");
    await user.click(screen.getByRole("button", { name: /45 min/ }));
    await user.clear(screen.getByLabelText("Ore"));
    await user.type(screen.getByLabelText("Ore"), "1");
    await user.clear(screen.getByLabelText("Minute"));
    await user.type(screen.getByLabelText("Minute"), "30");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/execution-tasks/task%3Aknown/planned-effort",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("keeps a member view read-only", async () => {
    const payload = workloadPayload();
    const workload = payload.workload as {
      canEditEffort: boolean;
      providers: Array<{ tasks: Array<{ canEditEffort: boolean }> }>;
      unassigned: Array<{ canEditEffort: boolean }>;
    };
    workload.canEditEffort = false;
    workload.providers[0]!.tasks.forEach((task) => {
      task.canEditEffort = false;
    });
    workload.unassigned.forEach((task) => {
      task.canEditEffort = false;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    render(<PlanningPage />);
    expect(await screen.findByText("45 min")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /45 min/ })).not.toBeInTheDocument();
  });
});
