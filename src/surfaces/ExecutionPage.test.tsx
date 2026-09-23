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
    canAssignProvider: false,
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
      progress: {
        total: tasks.length,
        completed: tasks.filter((task) => task.status === "COMPLETED").length,
        inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
        planned: tasks.filter((task) => task.status === "PLANNED").length,
        waitingDependencies: 0,
        noProvider: 0,
        varianceCount: 0,
      },
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

    expect(await screen.findAllByText("Realizat: 11,8 m")).not.toHaveLength(0);
    expect(screen.getAllByText("Diferență față de plan: −0,7 m").length).toBeGreaterThan(0);
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

  it("keeps a deep-linked completed task selected so history stays inspectable", async () => {
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
    expect(await screen.findByRole("heading", { name: "01 Debitare foaie CNC" })).toBeInTheDocument();
    expect(document.querySelector(".operational-task--current")).toHaveAttribute(
      "data-task-id",
      "task-cut",
    );
    expect(screen.getByText("Sarcina selectată din plan")).toBeInTheDocument();
    expect(screen.getAllByText("Realizat: 12,5 m").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /04 Cablare electrică/ })).toHaveAttribute(
      "href",
      "/executie/exp%3A1?task=task-wire&job=ord-1",
    );
    expect(screen.queryByText("Prima sarcină eligibilă din acest plan.")).not.toBeInTheDocument();
  });

  it("explains a missing configured machine without creating one", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:andrei", displayName: "Andrei Goghi" },
        });
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
              assignmentLabel: "Nealocat",
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
    expect(await screen.findAllByText("Utilaj / zonă lipsă")).not.toHaveLength(0);
    expect(screen.getAllByText("Lipsește utilajul / zona necesară").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Adaugă utilajul de debitare" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alocă/ })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/organization-providers")),
    ).toBe(false);
  });

  it("lets an owner assign the single eligible provider after seeing its label", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: "Planificat",
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
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              canAssign: true,
              canAssignProvider: true,
              eligibleProviders: [
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC 4020",
                },
              ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByText("Se alocă: Utilaj — CNC 4020")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alocă CNC 4020" }));
    await waitFor(() => {
      const assignCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/provider") && init?.method === "POST",
      );
      expect(assignCall?.[1]?.body).toBe(JSON.stringify({ providerId: "mch:cnc-a" }));
    });
  });

  it("requires an explicit choice when several eligible providers exist", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: "Planificat",
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
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              canAssign: true,
              canAssignProvider: true,
              eligibleProviders: [
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC Alfa",
                },
                {
                  id: "mch:cnc-b",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC Beta",
                },
              ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByLabelText("Utilaj / zonă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alocă utilajul" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Utilaj / zonă"), "mch:cnc-b");
    expect(screen.getByRole("button", { name: "Alocă CNC Beta" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Alocă CNC Beta" }));
    await waitFor(() => {
      const assignCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/provider") && init?.method === "POST",
      );
      expect(assignCall?.[1]?.body).toBe(JSON.stringify({ providerId: "mch:cnc-b" }));
    });
  });

  it("keeps the explicit choice when the first eligible provider is not the chosen one", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              canAssign: true,
              canAssignProvider: true,
              requiresProvider: true,
              eligibleProviders: [
                {
                  id: "mch:cnc-b",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC Beta",
                },
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC Alfa",
                },
              ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await screen.findByLabelText("Utilaj / zonă");
    await user.selectOptions(screen.getByLabelText("Utilaj / zonă"), "mch:cnc-a");
    await user.click(screen.getByRole("button", { name: "Alocă CNC Alfa" }));
    await waitFor(() => {
      const assignCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/provider") && init?.method === "POST",
      );
      expect(assignCall?.[1]?.body).toBe(JSON.stringify({ providerId: "mch:cnc-a" }));
    });
  });

  it("hides assignment action from a member and prefers a task the viewer can start", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: "Planificat",
          progress: { completed: 0, total: 2 },
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
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              canAssign: true,
              canAssignProvider: false,
              canClaimStart: false,
              eligibleProviders: [
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC 4020",
                },
              ],
            },
            {
              ...taskPayload({
                taskId: "task-wire",
                processLabel: "Cablare electrică",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              canAssign: false,
              canAssignProvider: false,
              canClaimStart: true,
              requiresProvider: false,
              eligibleProviders: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByRole("heading", { name: "04 Cablare electrică" })).toBeInTheDocument();
    expect(document.querySelector(".operational-task--current")).toHaveAttribute(
      "data-task-id",
      "task-wire",
    );
    expect(screen.getByRole("button", { name: "Pornește" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Alocă/ })).not.toBeInTheDocument();
  });

  it("shows member-visible task state without an assign action", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              canAssign: true,
              canAssignProvider: false,
              operatorRelation: "missing_provider",
              eligibleProviders: [
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC 4020",
                },
              ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findAllByText("Nealocat")).not.toHaveLength(0);
    expect(screen.getByText("Utilaje eligibile: Utilaj — CNC 4020")).toBeInTheDocument();
    expect(screen.getAllByText("Așteaptă alocarea utilajului / zonei").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /01 Debitare foaie CNC/ })).toHaveTextContent(
      "Așteaptă alocarea utilajului / zonei",
    );
    expect(screen.queryByRole("button", { name: /Alocă/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Utilaj lipsește")).not.toBeInTheDocument();
    expect(screen.queryByText("Lipsește utilajul / zona necesară")).not.toBeInTheDocument();
    expect(screen.queryByText("Utilaj / zonă lipsă")).not.toBeInTheDocument();
  });

  it("reloads the plan after a successful assignment and keeps a failure from looking assigned", async () => {
    const user = userEvent.setup();
    let assigned = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        assigned = true;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              assignmentLabel: assigned ? "CNC 4020" : "Nealocat",
              requiresProvider: true,
              canAssign: !assigned,
              canAssignProvider: !assigned,
              eligibleProviders: assigned
                ? []
                : [
                    {
                      id: "mch:cnc-a",
                      kind: "MACHINE",
                      kindLabel: "Utilaj",
                      label: "CNC 4020",
                    },
                  ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.click(await screen.findByRole("button", { name: "Alocă CNC 4020" }));
    expect(await screen.findAllByText("CNC 4020")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Alocă/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Utilaj lipsește")).not.toBeInTheDocument();
  });

  it("shows the assigned provider label without a missing-provider blocker", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              assignmentLabel: "CNC Zebra",
              requiresProvider: true,
              canAssign: false,
              canAssignProvider: false,
              canClaimStart: true,
              eligibleProviders: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findAllByText("CNC Zebra")).not.toHaveLength(0);
    expect(screen.queryByText("Utilaj lipsește")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alocă/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pornește" })).toBeInTheDocument();
  });

  it("shows an error and does not fake success when assignment fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/provider") && init?.method === "POST") {
        return jsonResponse({ error: "ineligible_provider" }, 422);
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              canAssign: true,
              canAssignProvider: true,
              eligibleProviders: [
                {
                  id: "mch:cnc-a",
                  kind: "MACHINE",
                  kindLabel: "Utilaj",
                  label: "CNC 4020",
                },
              ],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.click(await screen.findByRole("button", { name: "Alocă CNC 4020" }));
    expect(await screen.findByText("Alocarea utilajului nu este permisă pentru această sarcină.")).toBeInTheDocument();
    expect(screen.getAllByText("Nealocat").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Alocă CNC 4020" })).toBeInTheDocument();
  });

  it("shows whole-plan summary, dependency labels, and truthful current-task copy", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: "În lucru",
          progress: {
            total: 4,
            completed: 1,
            inProgress: 1,
            planned: 2,
            waitingDependencies: 1,
            noProvider: 1,
            noExecutor: 2,
            varianceCount: 1,
          },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-done",
                processLabel: "Debitare foaie CNC",
                status: "COMPLETED",
                statusLabel: "Finalizat",
                canComplete: false,
                requiresCompletedQuantity: true,
                plannedValue: 12.5,
                completedQuantityLabel: "Realizat: 12,5 m",
                varianceLabel: "Diferență față de plan: 0 m",
              }),
              seqLabel: "01",
              assignmentLabel: "CNC Zebra",
              startedByLabel: "Andrei Goghi",
              assignedExecutor: { id: "per:andrei", label: "Andrei Goghi" },
            },
            {
              ...taskPayload({
                taskId: "task-live",
                processLabel: "Formare volume",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "02",
              canClaimStart: false,
              startedByLabel: "Andrei Goghi",
              assignedExecutor: { id: "per:andrei", label: "Andrei Goghi" },
            },
            {
              ...taskPayload({
                taskId: "task-wait",
                processLabel: "Cablare electrică",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              requiresProvider: false,
              waitingFor: ["Formare volume"],
              dependsOnLabels: ["Formare volume"],
            },
            {
              ...taskPayload({
                taskId: "task-cut",
                processLabel: "Vopsire",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "04",
              assignmentLabel: "Nealocat",
              requiresProvider: true,
              eligibleProviders: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByLabelText("Starea planului")).toHaveTextContent("Finalizate 1 / 4");
    expect(screen.getByLabelText("Starea planului")).toHaveTextContent("În curs 1");
    expect(screen.getByLabelText("Starea planului")).toHaveTextContent("Așteaptă 1");
    expect(screen.getByLabelText("Starea planului")).toHaveTextContent("Fără utilaj / zonă 1");
    expect(screen.getByLabelText("Starea planului")).toHaveTextContent("Diferențe 1");
    expect(screen.getByLabelText("Starea planului")).not.toHaveTextContent("executor");
    expect(screen.getByText("Următoarea sarcină acționabilă")).toBeInTheDocument();
    expect(screen.queryByText("Prima sarcină eligibilă din acest plan.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /03 Cablare electrică/ })).toBeInTheDocument();
    expect(screen.getAllByText("Așteaptă: Formare volume").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lipsește utilajul / zona necesară").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Andrei Goghi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Realizat: 12,5 m").length).toBeGreaterThan(0);
  });

  it("keeps a deep-linked blocked task selected without calling it eligible", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          progress: {
            total: 2,
            completed: 0,
            inProgress: 0,
            planned: 2,
            waitingDependencies: 1,
            noProvider: 0,
            varianceCount: 0,
          },
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
              canClaimStart: true,
            },
            {
              ...taskPayload({
                taskId: "task-wire",
                processLabel: "Cablare electrică",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              waitingFor: ["Debitare foaie CNC"],
              dependsOnLabels: ["Debitare foaie CNC"],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" taskId="task-wire" />);
    expect(await screen.findByText("Sarcina selectată din plan")).toBeInTheDocument();
    expect(document.querySelector(".operational-task--current")).toHaveAttribute(
      "data-task-id",
      "task-wire",
    );
    expect(screen.getAllByText("Așteaptă: Debitare foaie CNC").length).toBeGreaterThan(0);
    expect(screen.queryByText("Prima sarcină eligibilă din acest plan.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /01 Debitare foaie CNC/ })).toHaveAttribute(
      "href",
      "/executie/exp%3A1?task=task-cut",
    );
  });

  it("keeps the plan readable for an unidentified operator and disables start", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: null });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
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
              canClaimStart: true,
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByText("Operator neidentificat")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "01 Debitare foaie CNC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pornește" })).toBeDisabled();
    expect(screen.getAllByText("Identifică operatorul").length).toBeGreaterThan(0);
  });

  it("keeps completed-plan history visible", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: "Finalizat",
          progress: {
            total: 2,
            completed: 2,
            inProgress: 0,
            planned: 0,
            waitingDependencies: 0,
            noProvider: 0,
            varianceCount: 1,
          },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-cut",
                processLabel: "Debitare foaie CNC",
                status: "COMPLETED",
                statusLabel: "Finalizat",
                canComplete: false,
                requiresCompletedQuantity: true,
                plannedValue: 12.5,
                completedQuantityLabel: "Realizat: 11,8 m",
                varianceLabel: "Diferență față de plan: −0,7 m",
              }),
              assignmentLabel: "CNC Zebra",
              startedByLabel: "Andrei Goghi",
              assignedExecutor: { id: "per:andrei", label: "Andrei Goghi" },
            },
            {
              ...taskPayload({
                taskId: "task-wire",
                processLabel: "Cablare electrică",
                status: "COMPLETED",
                statusLabel: "Finalizat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "04",
              requiresProvider: false,
              assignmentLabel: "Nealocat",
              startedByLabel: "Andrei Goghi",
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByText("Lucrare executată")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /01 Debitare foaie CNC/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /04 Cablare electrică/ })).toBeInTheDocument();
    expect(screen.getAllByText("CNC Zebra").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Andrei Goghi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Realizat: 11,8 m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Diferență față de plan: −0,7 m").length).toBeGreaterThan(0);
  });

  it("does not invent a machine blocker for a manual-only task", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-wire",
                processLabel: "Cablare electrică",
                status: "PLANNED",
                statusLabel: "Planificat",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              requiresProvider: false,
              assignmentLabel: "Nealocat",
              canClaimStart: true,
              eligibleProviders: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByRole("button", { name: "Pornește" })).toBeEnabled();
    expect(screen.queryByText("Utilaj lipsește")).not.toBeInTheDocument();
  });

  it("shows empty actual-consumption inputs for an owned in-progress task with two resources", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: true,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByRole("heading", { name: "Consum efectiv" })).toBeInTheDocument();
    const plexi = screen.getByLabelText("Plexiglas opal 3 mm — consum efectiv");
    const screws = screen.getByLabelText("Șuruburi inox — consum efectiv");
    expect(plexi).toHaveValue("");
    expect(screws).toHaveValue("");
    expect(screen.getByText("Planificat: 0,85 m²")).toBeInTheDocument();
    expect(screen.getByText("Planificat: 12 buc")).toBeInTheDocument();
    expect(screen.queryByText("res:plexi")).not.toBeInTheDocument();
    expect(screen.queryByText("res:screws")).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR|tarif|cost/i)).not.toBeInTheDocument();
  });

  it("posts only the explicit actuals the operator typed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: true,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.type(await screen.findByLabelText("Plexiglas opal 3 mm — consum efectiv"), "0,80");
    await user.type(screen.getByLabelText("Șuruburi inox — consum efectiv"), "11");
    await user.click(screen.getByRole("button", { name: "Închide sarcina" }));
    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/complete") && init?.method === "POST",
      );
      expect(completeCall?.[1]?.body).toBe(
        JSON.stringify({
          actualConsumption: [
            { resourceId: "res:plexi", actualQuantity: 0.8 },
            { resourceId: "res:screws", actualQuantity: 11 },
          ],
        }),
      );
    });
    expect(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/complete"))?.[1]?.body)).not.toContain("unit");
    expect(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/complete"))?.[1]?.body)).not.toContain("0.85");
  });

  it("posts only the one actual line the operator entered", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: true,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.type(await screen.findByLabelText("Plexiglas opal 3 mm — consum efectiv"), "0,80");
    await user.click(screen.getByRole("button", { name: "Închide sarcina" }));
    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/complete") && init?.method === "POST",
      );
      expect(completeCall?.[1]?.body).toBe(
        JSON.stringify({
          actualConsumption: [{ resourceId: "res:plexi", actualQuantity: 0.8 }],
        }),
      );
    });
    expect(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/complete"))?.[1]?.body)).not.toContain("res:screws");
  });

  it("keeps a manual task executable without actual-consumption fields", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-wire",
                processLabel: "Cablare electrică",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              canRecordActualConsumption: false,
              resourceDemands: [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    expect(await screen.findByRole("button", { name: "Închide sarcina" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Consum efectiv" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/consum efectiv/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Închide sarcina" }));
    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/complete") && init?.method === "POST",
      );
      expect(completeCall?.[1]?.body).toBe(JSON.stringify({}));
    });
  });

  it("does not let a non-completing operator edit actual consumption", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: false,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: false,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await screen.findByRole("heading", { name: "03 Montaj LED" });
    expect(screen.queryByLabelText(/consum efectiv/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Închide sarcina" })).not.toBeInTheDocument();
  });

  it("reloads persisted actual history after a successful completion", async () => {
    const user = userEvent.setup();
    let completed = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        completed = true;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          statusLabel: completed ? "Executat" : "În lucru",
          progress: {
            total: 1,
            completed: completed ? 1 : 0,
            inProgress: completed ? 0 : 1,
            planned: 0,
            waitingDependencies: 0,
            noProvider: 0,
            varianceCount: 0,
          },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: completed ? "COMPLETED" : "IN_PROGRESS",
                statusLabel: completed ? "Finalizat" : "În lucru",
                canComplete: !completed,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: !completed,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
              actualConsumption: completed
                ? [
                    {
                      resourceId: "res:plexi",
                      resourceLabel: "Plexiglas opal 3 mm",
                      actualQuantity: 0.8,
                      unit: "m²",
                      note: "Rest din foaie",
                    },
                  ]
                : [],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.type(await screen.findByLabelText("Plexiglas opal 3 mm — consum efectiv"), "0,80");
    await user.click(screen.getByRole("button", { name: "Închide sarcina" }));
    expect(await screen.findByText("Consum înregistrat")).toBeInTheDocument();
    expect(screen.getByText("0,8 m²")).toBeInTheDocument();
    expect(screen.getByText("Rest din foaie")).toBeInTheDocument();
    expect(screen.queryByLabelText(/consum efectiv/i)).not.toBeInTheDocument();
    expect(screen.queryByText("res:plexi")).not.toBeInTheDocument();
  });

  it("keeps the task in progress when completion with actuals is rejected", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: { personId: "per:andrei", displayName: "Andrei Goghi" } });
      }
      if (url.includes("/complete") && init?.method === "POST") {
        return jsonResponse({ error: "invalid_quantity" }, 422);
      }
      return jsonResponse({
        executionPlan: {
          plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS" },
          tasks: [
            {
              ...taskPayload({
                taskId: "task-led",
                processLabel: "Montaj LED",
                status: "IN_PROGRESS",
                statusLabel: "În lucru",
                canComplete: true,
                requiresCompletedQuantity: false,
                plannedValue: null,
                completedQuantityLabel: null,
                varianceLabel: null,
              }),
              seqLabel: "03",
              canRecordActualConsumption: true,
              resourceDemands: [
  {
    resourceId: "res:plexi",
    label: "Plexiglas opal 3 mm",
    quantity: 0.85,
    unit: "m²",
  },
  {
    resourceId: "res:screws",
    label: "Șuruburi inox",
    quantity: 12,
    unit: "buc",
  },
],
            },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionPage planId="exp:1" />);
    await user.type(await screen.findByLabelText("Plexiglas opal 3 mm — consum efectiv"), "0,80");
    await user.click(screen.getByRole("button", { name: "Închide sarcina" }));
    expect(
      await screen.findByText("Cantitatea consumată trebuie să fie un număr valid, zero sau pozitiv."),
    ).toBeInTheDocument();
    expect(screen.queryByText("invalid_quantity")).not.toBeInTheDocument();
    expect(screen.queryByText("Finalizat")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Închide sarcina" })).toBeEnabled();
    expect(screen.getByLabelText("Plexiglas opal 3 mm — consum efectiv")).toHaveValue("0,80");
  });

  it("renders every assembly scope, including Logo and an unexpected extra scope", async () => {
    const tasks = [
      ["01", "Debitare semifabricat metalic", "Panou ACM"],
      ["05", "Debitare foaie CNC", "Litere"],
      ["15", "Probă uniformitate", "Logo"],
      ["25", "Montaj litere pe panou", "Ansamblare"],
      ["26", "Montaj logo pe panou", "Ansamblare"],
      ["30", "Vopsire suplimentară", "Finisaj"],
    ] as const;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({ operator: null });
        }
        return jsonResponse({
          executionPlan: {
            plan: {
              planId: "exp:v2",
              productLabel: "Panou ACM + litere + logo volumetric",
              inscription: "NORD",
              sourceSnapshotId: "aps:v2",
            },
            statusLabel: "Planificat",
            progress: {
              total: tasks.length,
              completed: 0,
              inProgress: 0,
              planned: tasks.length,
              waitingDependencies: 0,
              noProvider: 0,
              varianceCount: 0,
            },
            tasks: tasks.map(([seqLabel, processLabel, scopeLabel], index) => ({
              taskId: `task-${index}`,
              processLabel,
              scopeLabel,
              seqLabel,
              status: "PLANNED",
              statusLabel: "Planificat",
              assignmentLabel: "Nealocat",
              requiresProvider: false,
              canAssign: false,
              canAssignProvider: false,
              canClaimStart: false,
              canComplete: false,
              requiresCompletedQuantity: false,
              measurableQuantity: null,
              completedQuantityLabel: null,
              varianceLabel: null,
              waitingFor: [],
              eligibleProviders: [],
            })),
          },
        });
      }),
    );

    render(<ExecutionPage planId="exp:v2" />);
    expect(
      (await screen.findAllByRole("heading", { name: "Panou ACM" })).length,
    ).toBeGreaterThan(0);
    const groups = [...document.querySelectorAll("[data-execution-scope]")].map(
      (node) => node.getAttribute("data-execution-scope"),
    );
    expect(groups).toEqual(["Panou ACM", "Litere", "Logo", "Ansamblare", "Finisaj"]);
    const logo = document.querySelector('[data-execution-scope="Logo"]');
    expect(logo).not.toBeNull();
    expect(within(logo as HTMLElement).getByText(/Probă uniformitate/)).toBeInTheDocument();
    expect(screen.getByText(/Montaj litere pe panou/)).toBeInTheDocument();
    expect(screen.getByText(/Montaj logo pe panou/)).toBeInTheDocument();
    expect(document.querySelectorAll(".operational-task--compact")).toHaveLength(tasks.length);
  });

  it("keeps a non-assembly plan in one list when scopes differ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({ operator: null });
        }
        return jsonResponse({
          executionPlan: {
            plan: {
              planId: "exp:logo",
              productLabel: "Logo volumetric luminos",
              inscription: "NORD LOGO",
              sourceSnapshotId: "aps:logo",
            },
            statusLabel: "Planificat",
            progress: {
              total: 2,
              completed: 0,
              inProgress: 0,
              planned: 2,
              waitingDependencies: 0,
              noProvider: 0,
              varianceCount: 0,
            },
            tasks: [
              {
                taskId: "task-face",
                processLabel: "Debitare față",
                scopeLabel: "Față",
                seqLabel: "01",
                status: "PLANNED",
                statusLabel: "Planificat",
                assignmentLabel: "Nealocat",
                requiresProvider: false,
                canAssign: false,
                canAssignProvider: false,
                canClaimStart: false,
                canComplete: false,
                requiresCompletedQuantity: false,
                measurableQuantity: null,
                completedQuantityLabel: null,
                varianceLabel: null,
                waitingFor: [],
                eligibleProviders: [],
              },
              {
                taskId: "task-volume",
                processLabel: "Formare profil aluminiu",
                scopeLabel: "Volum",
                seqLabel: "02",
                status: "PLANNED",
                statusLabel: "Planificat",
                assignmentLabel: "Nealocat",
                requiresProvider: false,
                canAssign: false,
                canAssignProvider: false,
                canClaimStart: false,
                canComplete: false,
                requiresCompletedQuantity: false,
                measurableQuantity: null,
                completedQuantityLabel: null,
                varianceLabel: null,
                waitingFor: [],
                eligibleProviders: [],
              },
            ],
          },
        });
      }),
    );

    render(<ExecutionPage planId="exp:1" />);
    expect((await screen.findAllByText(/Debitare față/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Formare profil aluminiu/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-execution-scope]")).toHaveLength(0);
    expect(document.querySelectorAll(".operational-task--compact")).toHaveLength(2);
  });
});
