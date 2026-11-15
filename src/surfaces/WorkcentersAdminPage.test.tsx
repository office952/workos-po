import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentWorkcentersAdmin } from "../adapters/workcentersAdapter";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
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
    expect(screen.getByText(/nu blochează clienții și ofertele/)).toBeInTheDocument();
    expect(screen.queryByText(/Organizația nouă/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Zone și utilaje").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Oameni" })).toHaveAttribute("href", "/admin/people");
    await userEvent.click(screen.getByRole("button", { name: "Zonă nouă" }));
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
    expect(screen.getAllByText("Debitare CNC").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Zonă nouă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă zona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă utilajul" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează zona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retrage utilajul" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Editarea nu este disponibilă pentru acest rol."),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Zonă nouă" }));
    const zoneDialog = screen.getByRole("dialog", { name: "Zonă nouă" });
    await user.type(within(zoneDialog).getByLabelText("Nume"), "Zonă CNC");
    await user.click(within(zoneDialog).getByRole("button", { name: "Adaugă zona" }));
    expect(await screen.findAllByText("Zonă CNC")).not.toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: "Zonă nouă" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Utilaj nou" }));
    const machineDialog = screen.getByRole("dialog", { name: "Utilaj nou" });
    await user.type(within(machineDialog).getByLabelText("Nume utilaj"), "Router CNC");
    await user.click(within(machineDialog).getByRole("button", { name: "Adaugă utilajul" }));
    expect(await screen.findAllByText("Router CNC")).not.toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Capabilitate utilaj"), "CNC_ROUTING");
    await user.click(screen.getByRole("button", { name: "Atribuie capabilitatea" }));
    expect(await screen.findByText(/Debitare CNC: Acoperită/)).toBeInTheDocument();
    expect(screen.queryByText("wc:zone-cnc")).not.toBeInTheDocument();
    expect(screen.queryByText("mch:router")).not.toBeInTheDocument();
  });

  it("keeps capability editing open without an authoritative history flag and explains the server protection", async () => {
    const profileCapability = {
      id: "PROFILE_FORMING",
      label: "Fălțuire profil",
      coverage: "NO_PROVIDER",
      coverageLabel: "Fără furnizor",
      providers: [],
    };
    const current = adminPayload({
      machine: machineRow({ usedBy: ["Litere volumetrice · Debitare"] }),
      capabilities: [
        {
          ...cncCapability,
          coverage: "COVERED",
          coverageLabel: "Acoperită",
          providers: [{ id: "mch:router", label: "Router CNC" }],
        },
        profileCapability,
      ],
    });
    const patches: unknown[] = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/api/machines/") && method === "PATCH") {
        patches.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ error: "provider_referenced" }, 409);
      }
      return jsonResponse(current);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<WorkcentersAdminPage />);
    const machineCapability = await screen.findByLabelText("Capabilitate utilaj");
    expect(machineCapability).toBeEnabled();
    const assignButtons = screen.getAllByRole("button", { name: "Atribuie capabilitatea" });
    const machineAssign = assignButtons[assignButtons.length - 1];
    expect(machineAssign).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retrage capabilitatea" })).toBeEnabled();

    await user.selectOptions(machineCapability, "PROFILE_FORMING");
    await user.click(machineAssign);

    expect(await screen.findByText("Protejat de istoricul de execuție")).toBeInTheDocument();
    expect(
      screen.getByText(/adaugă o zonă nouă sau un utilaj nou cu acea capabilitate/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Modificarea a eșuat")).not.toBeInTheDocument();
    expect(patches).toEqual([{ capabilityIds: ["CNC_ROUTING", "PROFILE_FORMING"] }]);
    expect(screen.getByLabelText("Capabilitate utilaj")).toBeEnabled();
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
    // Retiring always asks first; nothing is sent before the confirmation.
    const ask = screen.getByRole("dialog", { name: "Retragi utilajul Router CNC?" });
    expect(within(ask).getByRole("button", { name: "Anulează" })).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, init]) => String((init as RequestInit | undefined)?.method) === "PATCH")).toBe(false);
    await user.click(within(ask).getByRole("button", { name: "Retrage utilajul" }));
    expect(
      await within(ask).findByText(
        "Furnizorul este atribuit unei sarcini deschise și nu poate fi retras.",
      ),
    ).toBeInTheDocument();
  });

  it("asks before another zone or machine replaces an unsaved name (R1 · F2)", async () => {
    const second = workcenterRow({ id: "wc:paint", label: "Vopsitorie", machineLabels: [] });
    const payload = adminPayload({ workcenters: [workcenterRow(), second] });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      if (String(init?.method ?? "GET") === "PATCH") {
        return jsonResponse(payload);
      }
      return jsonResponse(payload);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage />);
    const name = await screen.findByLabelText("Nume", { selector: "#workcenter-name" });
    await user.clear(name);
    await user.type(name, "Zonă CNC nouă");
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toHaveTextContent(
      "Zona: Zonă CNC → Zonă CNC nouă",
    );
    await user.click(screen.getByRole("button", { name: /Vopsitorie/ }));
    const ask = screen.getByRole("dialog", { name: "Ai modificări nesalvate la Zonă CNC" });
    await user.click(within(ask).getByRole("button", { name: "Rămâi aici" }));
    expect(screen.getByLabelText("Nume", { selector: "#workcenter-name" })).toHaveValue("Zonă CNC nouă");
    await user.click(screen.getByRole("button", { name: /Vopsitorie/ }));
    await user.click(screen.getByRole("button", { name: "Renunță și deschide" }));
    expect(screen.getByLabelText("Nume", { selector: "#workcenter-name" })).toHaveValue("Vopsitorie");
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => String((init as RequestInit | undefined)?.method) === "PATCH")).toBe(false);
  });

  it("has one save action: the change bar saves the zone being edited", async () => {
    const patches: unknown[] = [];
    let label = "Zonă CNC";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/workcenters/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}")) as { label?: string };
        patches.push(body);
        label = body.label ?? label;
      }
      return jsonResponse(adminPayload({ workcenters: [workcenterRow({ label })] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage />);
    const name = await screen.findByLabelText("Nume", { selector: "#workcenter-name" });
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "Zonă CNC 2");
    const bar = screen.getByRole("region", { name: "Modificări nesalvate" });
    expect(screen.getAllByRole("button", { name: /^Salvează/ })).toHaveLength(1);
    await user.click(within(bar).getByRole("button", { name: "Salvează zona" }));
    expect(await screen.findByText("Modificarea a fost salvată")).toBeInTheDocument();
    expect(patches).toEqual([{ label: "Zonă CNC 2", description: "Zonă de debitare" }]);
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
  });
});

/**
 * R3 safety fix · P1-01. A zone and its machine are separate objects with separate saves: the result of
 * one save never replaces the other object's draft, a refused machine keeps its typed values, the
 * saved zone is not rolled back, and nothing claims a complete success.
 */
describe("WorkcentersAdminPage · combined zone and machine save (P1-01)", () => {
  type Server = { zone: string; machine: string; refuseMachine: boolean; refuseZone: boolean; patches: string[] };

  function stub(server: Server) {
    const payload = () =>
      adminPayload({
        workcenters: [workcenterRow({ label: server.zone, machineLabels: [server.machine] })],
        machines: [machineRow({ label: server.machine, workcenterLabel: server.zone })],
      });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (method === "PATCH" && url.includes("/api/workcenters/")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { label: string };
        server.patches.push(`zone:${body.label}`);
        if (server.refuseZone) return jsonResponse({ error: "invalid_label" }, 400);
        server.zone = body.label;
        return jsonResponse(payload());
      }
      if (method === "PATCH" && url.includes("/api/machines/")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { label: string };
        server.patches.push(`machine:${body.label}`);
        if (server.refuseMachine) return jsonResponse({ error: "provider_referenced" }, 409);
        server.machine = body.label;
        return jsonResponse(payload());
      }
      return jsonResponse(payload());
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const zoneField = () => screen.getByLabelText("Nume", { selector: "#workcenter-name" });
  const machineField = () => screen.getByLabelText("Nume", { selector: "#machine-name" });
  const bar = () => screen.queryByRole("region", { name: "Modificări nesalvate" });

  async function editBoth(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByLabelText("Nume", { selector: "#workcenter-name" });
    await user.clear(zoneField());
    await user.type(zoneField(), "Zonă CNC 2");
    await user.clear(machineField());
    await user.type(machineField(), "Router CNC 2");
  }

  function server(overrides: Partial<Server> = {}): Server {
    return { zone: "Zonă CNC", machine: "Router CNC", refuseMachine: false, refuseZone: false, patches: [], ...overrides };
  }

  it("1 · zone and machine both saved: one save each, both drafts closed, full success", async () => {
    const state = server();
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    expect(await screen.findByText("Modificarea a fost salvată")).toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2", "machine:Router CNC 2"]);
    expect(zoneField()).toHaveValue("Zonă CNC 2");
    expect(machineField()).toHaveValue("Router CNC 2");
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByText("Salvare parțială")).not.toBeInTheDocument();
  });

  it("2 · zone saved, machine refused: zone stays saved, machine draft stays, partial notice, no success", async () => {
    const state = server({ refuseMachine: true });
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    expect(await screen.findByText("Salvare parțială")).toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2", "machine:Router CNC 2"]);
    expect(state.zone).toBe("Zonă CNC 2");
    // The refused machine values are still in the form; the saved zone no longer counts as unsaved.
    expect(machineField()).toHaveValue("Router CNC 2");
    expect(zoneField()).toHaveValue("Zonă CNC 2");
    expect(bar()).toHaveTextContent("Utilajul: Router CNC → Router CNC 2");
    expect(bar()).not.toHaveTextContent("Zona:");
    expect(within(bar()!).getByRole("button", { name: "Salvează utilajul" })).toBeInTheDocument();
    expect(screen.getByText(/Zona a fost salvată\. Modificările utilajului nu au fost salvate/)).toBeInTheDocument();
    expect(screen.queryByText("Modificarea a fost salvată")).not.toBeInTheDocument();
  });

  it("3 · zone refused: the machine is not sent and both drafts stay", async () => {
    const state = server({ refuseZone: true });
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    expect(await screen.findByText("Modificarea a eșuat")).toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2"]);
    expect(zoneField()).toHaveValue("Zonă CNC 2");
    expect(machineField()).toHaveValue("Router CNC 2");
    expect(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" })).toBeInTheDocument();
    expect(screen.queryByText("Salvare parțială")).not.toBeInTheDocument();
  });

  it("4 · only the zone edited: only the zone is sent", async () => {
    const state = server();
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await screen.findByLabelText("Nume", { selector: "#workcenter-name" });
    await user.clear(zoneField());
    await user.type(zoneField(), "Zonă CNC 2");
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona" }));
    expect(await screen.findByText("Modificarea a fost salvată")).toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2"]);
    expect(machineField()).toHaveValue("Router CNC");
  });

  it("5 · only the machine edited: only the machine is sent", async () => {
    const state = server();
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await screen.findByLabelText("Nume", { selector: "#machine-name" });
    await user.clear(machineField());
    await user.type(machineField(), "Router CNC 2");
    await user.click(within(bar()!).getByRole("button", { name: "Salvează utilajul" }));
    expect(await screen.findByText("Modificarea a fost salvată")).toBeInTheDocument();
    expect(state.patches).toEqual(["machine:Router CNC 2"]);
    expect(zoneField()).toHaveValue("Zonă CNC");
  });

  it("6 · after a partial success, „Renunță” drops only the remaining machine draft; the zone stays saved", async () => {
    const state = server({ refuseMachine: true });
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    await screen.findByText("Salvare parțială");
    await user.click(within(bar()!).getByRole("button", { name: "Renunță" }));
    expect(machineField()).toHaveValue("Router CNC");
    expect(zoneField()).toHaveValue("Zonă CNC 2");
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByText("Salvare parțială")).not.toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2", "machine:Router CNC 2"]);
  });

  it("7 · after a partial success, correcting the machine and saving again sends only the machine, once", async () => {
    const state = server({ refuseMachine: true });
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    await screen.findByText("Salvare parțială");
    state.refuseMachine = false;
    await user.clear(machineField());
    await user.type(machineField(), "Router CNC 3");
    await user.click(within(bar()!).getByRole("button", { name: "Salvează utilajul" }));
    expect(await screen.findByText("Modificarea a fost salvată")).toBeInTheDocument();
    expect(state.patches).toEqual(["zone:Zonă CNC 2", "machine:Router CNC 2", "machine:Router CNC 3"]);
    expect(machineField()).toHaveValue("Router CNC 3");
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByText("Salvare parțială")).not.toBeInTheDocument();
  });

  it("keeps the remaining machine draft across a data refresh after a partial success", async () => {
    const state = server({ refuseMachine: true });
    stub(state);
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    await screen.findByText("Salvare parțială");
    // Another change writes a fresh copy of the same resource (the path every mutation uses).
    act(() => {
      writeResource(
        resourceKeys.workcentersAdmin(),
        presentWorkcentersAdmin(
          adminPayload({
            workcenters: [workcenterRow({ label: state.zone, description: "Descriere nouă" })],
            machines: [machineRow({ label: state.machine })],
          }),
        ),
      );
    });
    expect(machineField()).toHaveValue("Router CNC 2");
    expect(zoneField()).toHaveValue("Zonă CNC 2");
    expect(bar()).toHaveTextContent("Utilajul: Router CNC → Router CNC 2");
  });

  it("asks before another zone replaces a machine draft left by a partial success", async () => {
    const state = server({ refuseMachine: true });
    const second = workcenterRow({ id: "wc:paint", label: "Vopsitorie", machineLabels: [] });
    const fetchMock = stub(state);
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const method = String(init?.method ?? "GET");
      const url = String(input);
      const payload = () =>
        adminPayload({
          workcenters: [workcenterRow({ label: state.zone }), second],
          machines: [machineRow({ label: state.machine })],
        });
      if (method === "PATCH" && url.includes("/api/workcenters/")) {
        state.zone = (JSON.parse(String(init?.body ?? "{}")) as { label: string }).label;
        state.patches.push(`zone:${state.zone}`);
        return jsonResponse(payload());
      }
      if (method === "PATCH" && url.includes("/api/machines/")) {
        state.patches.push("machine");
        return jsonResponse({ error: "provider_referenced" }, 409);
      }
      return jsonResponse(payload());
    });
    const user = userEvent.setup();
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    await editBoth(user);
    await user.click(within(bar()!).getByRole("button", { name: "Salvează zona și utilajul" }));
    await screen.findByText("Salvare parțială");
    await user.click(screen.getByRole("button", { name: /Vopsitorie/ }));
    const ask = screen.getByRole("dialog", { name: "Ai modificări nesalvate la Router CNC" });
    await user.click(within(ask).getByRole("button", { name: "Rămâi aici" }));
    expect(machineField()).toHaveValue("Router CNC 2");
    expect(state.patches).toEqual(["zone:Zonă CNC 2", "machine"]);
  });

  it("keeps a member read-only: no fields to edit, no change bar, no save", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ ...adminPayload(), canEdit: false })));
    render(<WorkcentersAdminPage workcenterId="wc:zone-cnc" machineId="mch:router" />);
    expect(await screen.findByLabelText("Nume", { selector: "#workcenter-name" })).toBeDisabled();
    expect(machineField()).toBeDisabled();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
  });
});
