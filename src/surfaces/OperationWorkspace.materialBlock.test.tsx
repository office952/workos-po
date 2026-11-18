import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { OperationWorkspace } from "./OperationWorkspace";

/**
 * Assembly & Production Supervision Coherence V1 · F-03 / F-04 · the Atelier account at a material
 * block: who resolves it, an honest escalation, and no supervisory action in the PIN workspace.
 */

const session = vi.hoisted(() => ({ capabilities: ["execution.operate"] as string[], role: "workshop" }));

vi.mock("../session/CloudSessionContext", () => ({
  useCloudSession: () => ({
    ready: true,
    unavailable: false,
    mode: "cloud",
    user: { email: "atelier@pilot-demo.test" },
    organization: { organizationId: "org-test", membershipRole: session.role, capabilities: session.capabilities },
    memberships: [],
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  session.capabilities = ["execution.operate"];
  session.role = "workshop";
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function server() {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/operator-session")) {
      return jsonResponse({ operator: { personId: "per:ana", displayName: "Ana Pilot CNC" } });
    }
    if (init?.method === "POST" && url.endsWith("/issues")) {
      return jsonResponse({ dossier: { taskId: "task-cut", entries: [] } });
    }
    return jsonResponse({
      executionPlan: {
        plan: { planId: "exp:1", productLabel: "Litere", inscription: "WORKOS", sourceSnapshotId: "aps:1" },
        statusLabel: "Planificat",
        progress: { total: 1, completed: 0, inProgress: 0, planned: 1, waitingDependencies: 0, noProvider: 0, varianceCount: 0 },
        tasks: [
          {
            taskId: "task-cut",
            processLabel: "Debitare foaie CNC",
            scopeLabel: "Față",
            seqLabel: "01",
            status: "PLANNED",
            statusLabel: "Planificat",
            assignmentLabel: "CNC 4020",
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
            startBlockReason: "Materialul nu este confirmat disponibil: Plexiglas 3 mm.",
            materialBlockLabel: "Materialul nu este confirmat disponibil: Plexiglas 3 mm.",
            materialBlockResolverLabel: "Proprietar sau Producție",
            materialLines: [{ resourceId: "MAT-PLEXI", label: "Plexiglas 3 mm", status: "UNCONFIRMED", statusLabel: "Neconfirmat" }],
            canConfirmMaterial: false,
          },
        ],
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("OperationWorkspace · material block for the Atelier account", () => {
  it("names who resolves the block from the server, asks nothing of the operator and escalates honestly", async () => {
    const fetchMock = server();
    const user = userEvent.setup();
    render(<OperationWorkspace planId="exp:1" taskId="task-cut" />);
    const block = await screen.findByTestId("material-block-owner");
    expect(block).toHaveTextContent("Cine rezolvă");
    expect(block).toHaveTextContent("Materialul îl confirmă Proprietar sau Producție");
    expect(block).toHaveTextContent("Tu nu ai nimic de completat aici.");
    // No quantity, no availability decision and no supervision link for the Atelier account.
    expect(within(block).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Disponibil$|^Indisponibil$|Confirmă disponibil/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deschide supervizarea în fișa lucrării" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("supervision-pointer")).not.toBeInTheDocument();

    await user.click(within(block).getByRole("button", { name: "Anunță Producția" }));
    const status = await screen.findByTestId("material-escalated");
    expect(status).toHaveTextContent("vizibilă pentru Producție în fișa lucrării și pe Start");
    expect(status).toHaveTextContent("Nu s-a trimis o notificare separată.");
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0]?.[0])).toBe("/api/execution-tasks/task-cut/issues");
    const sent = JSON.parse(String(posts[0]?.[1]?.body)) as { reason: string; text: string };
    expect(sent.reason).toBe("MATERIAL");
    expect(sent.text).toContain("Plexiglas 3 mm");
    expect(sent).not.toHaveProperty("quantity");
    await waitFor(() => expect(within(block).queryByRole("button", { name: "Anunță Producția" })).not.toBeInTheDocument());
  });

  it("sends a supervising account to the job sheet instead of offering the decision here", async () => {
    session.role = "production";
    session.capabilities = ["execution.operate", "execution.supervise", "planning.manage", "materials.decide"];
    server();
    render(<OperationWorkspace planId="exp:1" taskId="task-cut" />);
    const block = await screen.findByTestId("material-block-owner");
    expect(block).toHaveTextContent("Poți confirma materialul");
    expect(within(block).queryByRole("button", { name: "Anunță Producția" })).not.toBeInTheDocument();
  });
});
