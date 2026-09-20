import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionPage } from "./ExecutionPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

type TaskFixture = {
  taskId: string;
  processLabel: string;
  status: string;
  statusLabel: string;
  canComplete: boolean;
  requiresCompletedQuantity: boolean;
  plannedValue: number | null;
  completedQuantityLabel: string | null;
  varianceLabel: string | null;
};

function taskPayload(task: TaskFixture): Record<string, unknown> {
  return {
    taskId: task.taskId,
    processLabel: task.processLabel,
    scopeLabel: "Spate",
    seqLabel: task.taskId === "task-cut" ? "01" : "04",
    status: task.status,
    statusLabel: task.statusLabel,
    assignmentLabel: "CNC 4020",
    requiresProvider: false,
    canAssign: false,
    canClaimStart: false,
    canComplete: task.canComplete,
    requiresCompletedQuantity: task.requiresCompletedQuantity,
    measurableQuantity:
      task.plannedValue === null
        ? null
        : { label: "Lungime", value: task.plannedValue, unit: "m" },
    completedQuantityLabel: task.completedQuantityLabel,
    varianceLabel: task.varianceLabel,
    waitingFor: [],
    eligibleProviders: [],
  };
}

function planPayload(tasks: readonly TaskFixture[]): Record<string, unknown> {
  return {
    executionPlan: {
      plan: {
        planId: "exp:1",
        productLabel: "Litere",
        inscription: "WORKOS GOLDEN",
        sourceSnapshotId: "aps:1",
      },
      statusLabel: "În lucru",
      progress: { completed: tasks.filter((task) => task.status === "COMPLETED").length, total: 2 },
      tasks: tasks.map(taskPayload),
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("ExecutionPage", () => {
  it("captures operator actual quantity and displays server variance after reload", async () => {
    const measurable: TaskFixture = {
      taskId: "task-cut",
      processLabel: "Debitare foaie CNC",
      status: "IN_PROGRESS",
      statusLabel: "În lucru",
      canComplete: true,
      requiresCompletedQuantity: true,
      plannedValue: 12.5,
      completedQuantityLabel: null,
      varianceLabel: null,
    };
    const nonMeasurable: TaskFixture = {
      taskId: "task-wire",
      processLabel: "Cablare electrică",
      status: "PLANNED",
      statusLabel: "Planificat",
      canComplete: true,
      requiresCompletedQuantity: false,
      plannedValue: null,
      completedQuantityLabel: null,
      varianceLabel: null,
    };
    let tasks: TaskFixture[] = [measurable, nonMeasurable];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
        });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        tasks = [
          {
            ...measurable,
            status: "COMPLETED",
            statusLabel: "Finalizat",
            canComplete: false,
            completedQuantityLabel: "Realizat: 11,8 m",
            varianceLabel: "Diferență față de plan: −0,7 m",
          },
          nonMeasurable,
        ];
        return jsonResponse({ ok: true });
      }
      return jsonResponse(planPayload(tasks));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);

    await screen.findByRole("heading", { name: "01 Debitare foaie CNC" });
    const measurableArticle = document.querySelector('[data-task-id="task-cut"]');
    const wiringArticle = document.querySelector('[data-task-id="task-wire"]');
    expect(measurableArticle).not.toBeNull();
    expect(wiringArticle).not.toBeNull();
    const actualField = within(measurableArticle as HTMLElement).getByLabelText(
      "Cantitate realizată",
    );
    expect(actualField).toHaveValue("12,5");
    expect(
      within(wiringArticle as HTMLElement).queryByLabelText("Cantitate realizată"),
    ).toBeNull();

    await userEvent.setup().clear(actualField);
    await userEvent.setup().type(actualField, "11,8");
    expect(actualField).toHaveValue("11,8");

    await userEvent.setup().click(
      within(measurableArticle as HTMLElement).getByRole("button", { name: "Închide sarcina" }),
    );

    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/complete") && init?.method === "POST",
      );
      expect(completeCall?.[1]?.body).toBe(JSON.stringify({ completedQuantity: 11.8 }));
      expect(String(completeCall?.[1]?.body)).not.toContain("12.5");
    });

    expect(await screen.findByText("Realizat: 11,8 m")).toBeInTheDocument();
    expect(screen.getByText("Diferență față de plan: −0,7 m")).toBeInTheDocument();
    expect(
      within(document.querySelector('[data-task-id="task-cut"]') as HTMLElement).queryByLabelText(
        "Cantitate realizată",
      ),
    ).toBeNull();
  });

  it("blocks completion when the operator actual is invalid", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
        });
      }
      return jsonResponse(
        planPayload([
          {
            taskId: "task-cut",
            processLabel: "Debitare foaie CNC",
            status: "IN_PROGRESS",
            statusLabel: "În lucru",
            canComplete: true,
            requiresCompletedQuantity: true,
            plannedValue: 12.5,
            completedQuantityLabel: null,
            varianceLabel: null,
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    const actualField = await screen.findByLabelText("Cantitate realizată");
    await userEvent.setup().clear(actualField);
    await userEvent.setup().type(actualField, "abc");
    await userEvent.setup().click(screen.getByRole("button", { name: "Închide sarcina" }));

    expect(
      await screen.findByText(
        "Cantitatea realizată trebuie să fie un număr valid, zero sau pozitiv.",
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url, init]) => String(url).includes("/complete") && init?.method === "POST"),
    ).toBe(false);
    expect(screen.getByLabelText("Cantitate realizată")).toHaveValue("abc");
    expect(screen.getByRole("button", { name: "Închide sarcina" })).toBeEnabled();
  });

  it("completes a non-measurable task without sending a quantity", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
        });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(
        planPayload([
          {
            taskId: "task-wire",
            processLabel: "Cablare electrică",
            status: "IN_PROGRESS",
            statusLabel: "În lucru",
            canComplete: true,
            requiresCompletedQuantity: false,
            plannedValue: null,
            completedQuantityLabel: null,
            varianceLabel: null,
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByRole("button", { name: "Închide sarcina" })).toBeEnabled();
    expect(screen.queryByLabelText("Cantitate realizată")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Închide sarcina" }));
    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/complete") && init?.method === "POST",
      );
      expect(completeCall?.[1]?.body).toBe(JSON.stringify({}));
    });
  });

  it("does not treat an unresolved session as unidentified", async () => {
    let releaseSession!: () => void;
    const sessionGate = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return sessionGate.then(() => jsonResponse({ operator: null }));
        }
        return jsonResponse(
          planPayload([
            {
              taskId: "task-cut",
              processLabel: "Debitare foaie CNC",
              status: "IN_PROGRESS",
              statusLabel: "În lucru",
              canComplete: true,
              requiresCompletedQuantity: true,
              plannedValue: 12.5,
              completedQuantityLabel: null,
              varianceLabel: null,
            },
          ]),
        );
      }),
    );

    render(<ExecutionPage planId="exp:1" />);
    await screen.findByRole("heading", { name: "01 Debitare foaie CNC" });
    expect(screen.queryByText("Operator neidentificat")).not.toBeInTheDocument();
    expect(screen.getByText("Se identifică")).toBeInTheDocument();

    releaseSession();
    expect(await screen.findByText("Operator neidentificat")).toBeInTheDocument();
    expect(screen.queryByText("Se identifică")).not.toBeInTheDocument();
  });

  it("honors the task query and keeps the job back-link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({
            operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
          });
        }
        return jsonResponse({
          ...planPayload([
            {
              taskId: "task-cut",
              processLabel: "Debitare foaie CNC",
              status: "IN_PROGRESS",
              statusLabel: "În lucru",
              canComplete: true,
              requiresCompletedQuantity: true,
              plannedValue: 12.5,
              completedQuantityLabel: null,
              varianceLabel: null,
            },
            {
              taskId: "task-wire",
              processLabel: "Cablare electrică",
              status: "PLANNED",
              statusLabel: "Planificat",
              canComplete: false,
              requiresCompletedQuantity: false,
              plannedValue: null,
              completedQuantityLabel: null,
              varianceLabel: null,
            },
          ]),
          job: { jobId: "ord-1", href: "/jobs/ord-1" },
        });
      }),
    );

    render(<ExecutionPage planId="exp:1" taskId="task-wire" jobId="ord-1" />);
    expect(await screen.findByRole("heading", { name: "04 Cablare electrică" })).toBeInTheDocument();
    expect(document.querySelector(".operational-task--current")).toHaveAttribute(
      "data-task-id",
      "task-wire",
    );
    expect(screen.getByRole("link", { name: "Revino la lucrare" })).toHaveAttribute(
      "href",
      "/lucrari/ord-1",
    );
    expect(screen.getByRole("link", { name: /01 Debitare foaie CNC/ })).toHaveAttribute(
      "href",
      "/executie/exp%3A1?task=task-cut&job=ord-1",
    );
  });

  it("advances past a completed task query to the next actionable task", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({
            operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
          });
        }
        return jsonResponse(
          planPayload([
            {
              taskId: "task-cut",
              processLabel: "Debitare foaie CNC",
              status: "COMPLETED",
              statusLabel: "Finalizat",
              canComplete: false,
              requiresCompletedQuantity: true,
              plannedValue: 12.5,
              completedQuantityLabel: "Realizat: 12,5 m",
              varianceLabel: "Conform planului",
            },
            {
              taskId: "task-wire",
              processLabel: "Cablare electrică",
              status: "IN_PROGRESS",
              statusLabel: "În lucru",
              canComplete: true,
              requiresCompletedQuantity: false,
              plannedValue: null,
              completedQuantityLabel: null,
              varianceLabel: null,
            },
          ]),
        );
      }),
    );

    render(<ExecutionPage planId="exp:1" taskId="task-cut" jobId="ord-1" />);
    expect(await screen.findByRole("heading", { name: "04 Cablare electrică" })).toBeInTheDocument();
    expect(document.querySelector(".operational-task--current")).toHaveAttribute(
      "data-task-id",
      "task-wire",
    );
    expect(screen.getByRole("button", { name: "Închide sarcina" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /01 Debitare foaie CNC/ })).toHaveAttribute(
      "href",
      "/executie/exp%3A1?task=task-cut&job=ord-1",
    );
  });

  it("asks the API for a capability machine instead of inventing a provider id", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
        });
      }
      if (url.includes("/organization-providers/capability") && init?.method === "POST") {
        return jsonResponse({ machineId: "mch:org-cnc-routing", alreadyApplied: false });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: {
            planId: "exp:1",
            productLabel: "Litere",
            inscription: "WORKOS GOLDEN",
            sourceSnapshotId: "aps:1",
          },
          statusLabel: "În lucru",
          progress: { completed: 0, total: 1 },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-cut",
                processLabel: "Debitare foaie CNC",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              requiresProvider: true,
              requiredCapabilityId: "CNC_ROUTING",
              eligibleProviders: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Adaugă utilajul de debitare" }));
    await waitFor(() => {
      const capability = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes("/organization-providers/capability") && init?.method === "POST",
      );
      expect(capability?.[1]?.body).toBe(
        JSON.stringify({ capabilityId: "CNC_ROUTING", label: "Utilaj de producție" }),
      );
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/execution-tasks/task-cut/provider") &&
            init?.method === "POST" &&
            String(init.body).includes("mch:org-cnc-routing"),
        ),
      ).toBe(true);
    });
  });
});
