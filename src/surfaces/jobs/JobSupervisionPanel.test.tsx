import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionTaskTransport } from "../../api/types";
import { TransportError } from "../../api/http";
import { JobSupervisionPanel } from "./JobSupervisionPanel";

/** Assembly & Production Supervision Coherence V1 · F-03 · supervision without operator PIN. */

const lifecycle = vi.hoisted(() => ({
  assignExternalProvider: vi.fn(() => Promise.resolve({})),
  closeReworkEpisode: vi.fn(() => Promise.resolve({})),
  confirmTaskMaterial: vi.fn(() => Promise.resolve({})),
  handOffExternalTask: vi.fn(() => Promise.resolve({})),
  markTaskExternal: vi.fn(() => Promise.resolve({})),
  recordExternalReturn: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../api/lifecycle", () => lifecycle);

afterEach(() => {
  vi.clearAllMocks();
});

function task(overrides: Record<string, unknown>): ExecutionTaskTransport {
  return {
    taskId: "task-1",
    seqLabel: "01",
    processLabel: "Debitare CNC",
    scopeLabel: "Litere",
    status: "PLANNED",
    statusLabel: "Planificată",
    materialLines: [],
    qualityAttempts: [],
    ...overrides,
  } as unknown as ExecutionTaskTransport;
}

function show(tasks: ExecutionTaskTransport[], selected: ExecutionTaskTransport | null, plan: Record<string, unknown> = {}) {
  return render(
    <JobSupervisionPanel
      jobId="ord:1"
      planId="plan:1"
      plan={{
        tasks,
        canConfirmMaterial: true,
        externalProviderChoices: [{ providerId: "prov:1", name: "Vopsitorie Nord" }],
        ...plan,
      }}
      selectedTask={selected}
      roleLabel="Producție"
      operationHref={(taskId) => `/lucrari/ord%3A1?sectiune=operatii&operatie=${taskId}`}
    />,
  );
}

const blocked = task({
  materialBlockLabel: "Material neconfirmat",
  materialLines: [{ resourceId: "MAT-PLEXI", label: "Plexiglas 3 mm", status: "UNCONFIRMED", statusLabel: "Neconfirmat" }],
});

describe("JobSupervisionPanel", () => {
  it("renders nothing when the server offers no supervisory action", () => {
    const { container } = show([task({})], null);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists what waits for Producție from server flags and states that no PIN is asked", () => {
    const rejected = task({ taskId: "task-2", seqLabel: "02", processLabel: "Control", canCloseReworkEpisode: true });
    show([blocked, rejected], null);
    const panel = screen.getByTestId("job-supervision");
    expect(panel).toHaveTextContent("Contul tău: Producție. Fără PIN de operator.");
    expect(panel).toHaveTextContent("Necesită Producția · 2");
    expect(within(panel).getByRole("link", { name: "01 · Debitare CNC" })).toHaveAttribute(
      "href",
      "/lucrari/ord%3A1?sectiune=operatii&operatie=task-1",
    );
    expect(panel).toHaveTextContent("Material de confirmat");
    expect(panel).toHaveTextContent("Corecție de închis");
    expect(screen.queryByLabelText(/PIN/i)).not.toBeInTheDocument();
    // Execution stays in Atelier: no start / complete / control here.
    expect(screen.queryByRole("button", { name: /Pornește|Finalizează|Control/ })).not.toBeInTheDocument();
  });

  it("confirms a blocking material from the signed-in account, without quantity", async () => {
    const user = userEvent.setup();
    show([blocked], blocked);
    const block = screen.getByTestId("job-supervision-material");
    expect(block).toHaveTextContent("Plexiglas 3 mm");
    expect(within(block).queryByRole("spinbutton")).not.toBeInTheDocument();
    await user.click(within(block).getByRole("button", { name: "Confirmă disponibil" }));
    await waitFor(() => expect(lifecycle.confirmTaskMaterial).toHaveBeenCalledWith("task-1", "MAT-PLEXI", "AVAILABLE"));
  });

  it("does not offer material confirmation to an account the server does not allow", () => {
    const { container } = show([blocked], blocked, { canConfirmMaterial: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("walks the external steps the server allows: provider, hand-off, return", async () => {
    const user = userEvent.setup();
    const external = task({ executionMode: "EXTERNAL", canAssignExternalProvider: true });
    const first = show([external], external);
    const block = screen.getByTestId("job-supervision-external");
    expect(within(block).getByRole("button", { name: "Alocă furnizorul" })).toBeDisabled();
    await user.selectOptions(within(block).getByRole("combobox", { name: "Furnizor extern" }), "prov:1");
    await user.click(within(block).getByRole("button", { name: "Alocă furnizorul" }));
    await waitFor(() => expect(lifecycle.assignExternalProvider).toHaveBeenCalledWith("task-1", "prov:1"));
    first.unmount();

    const handOff = task({ executionMode: "EXTERNAL", externalProviderLabel: "Vopsitorie Nord", canHandOffExternal: true });
    const second = show([handOff], handOff);
    await user.click(screen.getByRole("button", { name: "Predă către furnizor" }));
    await waitFor(() => expect(lifecycle.handOffExternalTask).toHaveBeenCalledWith("task-1"));
    second.unmount();

    const back = task({ executionMode: "EXTERNAL", externalProviderLabel: "Vopsitorie Nord", canRecordExternalReturn: true });
    show([back], back);
    expect(screen.getByTestId("job-supervision-external")).toHaveTextContent("Predarea nu înseamnă finalizare");
    await user.click(screen.getByRole("button", { name: "Înregistrează revenirea" }));
    await waitFor(() => expect(lifecycle.recordExternalReturn).toHaveBeenCalledWith("task-1"));
  });

  it("closes a rejected control only with a correction note", async () => {
    const user = userEvent.setup();
    const rejected = task({
      canCloseReworkEpisode: true,
      latestQualityResult: "FAIL",
      qualityAttempts: [{ result: "FAIL", note: "Muchie nefinisată" }],
    });
    show([rejected], rejected);
    const block = screen.getByTestId("job-supervision-correction");
    expect(block).toHaveTextContent("Muchie nefinisată");
    const close = within(block).getByRole("button", { name: "Închide corecția" });
    expect(close).toBeDisabled();
    await user.type(within(block).getByRole("textbox", { name: "Notă de corecție" }), "Muchie refinisată");
    await user.click(close);
    await waitFor(() => expect(lifecycle.closeReworkEpisode).toHaveBeenCalledWith("task-1", "Muchie refinisată"));
  });

  it("shows the server refusal and claims nothing was saved", async () => {
    lifecycle.confirmTaskMaterial.mockRejectedValueOnce(
      new TransportError("forbidden", 403, { error: "forbidden", reasons: ["Rolul tău nu poate confirma materialul."] }),
    );
    const user = userEvent.setup();
    show([blocked], blocked);
    await user.click(screen.getByRole("button", { name: "Confirmă disponibil" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Acțiunea nu a fost salvată");
    expect(alert).toHaveTextContent("Rolul tău nu poate confirma materialul.");
  });
});
