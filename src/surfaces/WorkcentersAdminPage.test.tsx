import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkcentersAdminPage } from "./WorkcentersAdminPage";

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

const cncCapability = {
  id: "CNC_ROUTING",
  label: "Debitare CNC",
  coverage: "NO_PROVIDER",
  coverageLabel: "Fără furnizor",
  providers: [],
};

function workcenterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wc:zone-cnc",
    label: "Zonă CNC",
    description: "Zonă de debitare",
    lifecycle: "ACTIVE",
    lifecycleLabel: "Activ",
    capabilityIds: [],
    capabilityLabels: [],
    machineLabels: ["Router CNC"],
    ...overrides,
  };
}

function machineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mch:router",
    label: "Router CNC",
    description: "Utilaj CNC",
    workcenterId: "wc:zone-cnc",
    workcenterLabel: "Zonă CNC",
    lifecycle: "ACTIVE",
    lifecycleLabel: "Activ",
    capabilityIds: ["CNC_ROUTING"],
    capabilityLabels: ["Debitare CNC"],
    ...overrides,
  };
}

function adminPayload(overrides: Record<string, unknown> = {}) {
  const workcenter = workcenterRow(
    (overrides.workcenter as Record<string, unknown> | undefined) ?? {},
  );
  const machine = machineRow((overrides.machine as Record<string, unknown> | undefined) ?? {});
  const capabilities = Array.isArray(overrides.capabilities)
    ? overrides.capabilities
    : [
        {
          ...cncCapability,
          coverage: "COVERED",
          coverageLabel: "Acoperită",
          providers: [{ id: machine.id, label: machine.label }],
        },
      ];
  return {
    canEdit: true,
    workcenters: Array.isArray(overrides.workcenters) ? overrides.workcenters : [workcenter],
    machines: Array.isArray(overrides.machines) ? overrides.machines : [machine],
    capabilities,
    workcenter,
    machine,
    ...overrides,
  };
}

describe("WorkcentersAdminPage", () => {
  it("shows the empty owner state and the Zone și utilaje rail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          canEdit: true,
          workcenters: [],
          machines: [],
          capabilities: [cncCapability],
        }),
      ),
    );

    render(<WorkcentersAdminPage />);
    expect(await screen.findByText("Nu există zone de lucru")).toBeInTheDocument();
    expect(screen.getAllByText("Zone și utilaje").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Oameni" })).toHaveAttribute("href", "/admin/people");
    expect(screen.getByRole("button", { name: "Adaugă zona" })).toBeDisabled();
    expect(screen.queryByText(/wc:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mch:/)).not.toBeInTheDocument();
  });

  it("keeps the member page read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...adminPayload(), canEdit: false })),
    );

    render(<WorkcentersAdminPage />);
    expect(await screen.findAllByText("Zonă CNC")).not.toHaveLength(0);
    expect(screen.getAllByText("Router CNC").length).toBeGreaterThan(0);
    expect(screen.getByText("Debitare CNC")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă zona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă utilajul" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează zona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retrage utilajul" })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Editarea nu este disponibilă pentru acest rol.").length,
    ).toBeGreaterThan(0);
  });

  it("creates a workcenter and a machine, then assigns CNC coverage", async () => {
    const empty = {
      canEdit: true,
      workcenters: [],
      machines: [],
      capabilities: [cncCapability],
    };
    const createdWorkcenter = adminPayload({
      workcenter: workcenterRow({
        lifecycle: "PLANNED",
        lifecycleLabel: "Planificat",
        machineLabels: [],
      }),
      machines: [],
      capabilities: [cncCapability],
    });
    const createdMachine = adminPayload({
      workcenter: workcenterRow({
        capabilityIds: ["CNC_ROUTING"],
        capabilityLabels: ["Debitare CNC"],
        machineLabels: ["Router CNC"],
      }),
      machine: machineRow({ capabilityIds: [], capabilityLabels: [] }),
      capabilities: [cncCapability],
    });
    const assigned = adminPayload();
    let stage: "empty" | "workcenter" | "machine" | "assigned" = "empty";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.endsWith("/api/workcenters") && method === "POST") {
        stage = "workcenter";
        return jsonResponse(createdWorkcenter, 201);
      }
      if (url.endsWith("/api/machines") && method === "POST") {
        stage = "machine";
        return jsonResponse(createdMachine, 201);
      }
      if (url.includes("/api/machines/") && method === "PATCH") {
        stage = "assigned";
        return jsonResponse(assigned);
      }
      if (stage === "assigned") {
        return jsonResponse(assigned);
      }
      if (stage === "machine") {
        return jsonResponse(createdMachine);
      }
      if (stage === "workcenter") {
        return jsonResponse(createdWorkcenter);
      }
      return jsonResponse(empty);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<WorkcentersAdminPage />);
    await screen.findByText("Nu există zone de lucru");
    await user.type(screen.getByLabelText("Nume"), "Zonă CNC");
    await user.click(screen.getByRole("button", { name: "Adaugă zona" }));
    expect(await screen.findAllByText("Zonă CNC")).not.toHaveLength(0);

    await user.type(screen.getByLabelText("Nume utilaj"), "Router CNC");
    await user.click(screen.getByRole("button", { name: "Adaugă utilajul" }));
    expect(await screen.findAllByText("Router CNC")).not.toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Capabilitate utilaj"), "CNC_ROUTING");
    await user.click(screen.getByRole("button", { name: "Atribuie capabilitatea" }));
    expect(await screen.findByText(/Debitare CNC: Acoperită/)).toBeInTheDocument();
    expect(screen.queryByText("wc:zone-cnc")).not.toBeInTheDocument();
    expect(screen.queryByText("mch:router")).not.toBeInTheDocument();
  });

  it("retires an unused machine in admin history and presents a conflict", async () => {
    const current = adminPayload();
    const retired = adminPayload({
      machine: machineRow({ lifecycle: "RETIRED", lifecycleLabel: "Retras" }),
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/api/machines/") && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
        if (body.status === "RETIRED") {
          return jsonResponse({ error: "has_open_assignment" }, 409);
        }
        return jsonResponse(retired);
      }
      return jsonResponse(current);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<WorkcentersAdminPage />);
    expect(await screen.findByRole("button", { name: "Retrage utilajul" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retrage utilajul" }));
    expect(
      await screen.findByText(
        "Furnizorul este atribuit unei sarcini deschise și nu poate fi retras.",
      ),
    ).toBeInTheDocument();
  });
});
