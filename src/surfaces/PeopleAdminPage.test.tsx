import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeopleAdminPage } from "./PeopleAdminPage";

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

const cncSkill = {
  skillId: "skl:operational:cnc-operator",
  code: "SK_CNC_OPERATOR",
  displayLabel: "CNC",
  status: "ACTIVE",
};

const assemblySkill = {
  skillId: "skl:operational:assembly",
  code: "SK_ASSEMBLY",
  displayLabel: "Ansamblare",
  status: "ACTIVE",
};

function personRow(overrides: Record<string, unknown> = {}) {
  return {
    personId: "per:operator-test",
    displayName: "Operator Test",
    roleLabel: "Operator",
    status: "ACTIVE",
    statusLabel: "Activ",
    availability: "AVAILABLE",
    availabilityLabel: "Disponibil",
    unavailableReason: null,
    unavailableUntil: null,
    skills: [{ skillId: cncSkill.skillId, displayLabel: "CNC", status: "ACTIVE" }],
    operatorPinConfigured: false,
    ...overrides,
  };
}

function adminPayload(overrides: Record<string, unknown> = {}) {
  const person = personRow(
    (overrides.person as Record<string, unknown> | undefined) ?? {},
  );
  return {
    canEdit: true,
    people: [person],
    skills: [cncSkill, assemblySkill],
    registry: {
      summary: { total: 1, active: 1, available: 1, temporarilyUnavailable: 0, retired: 0 },
      people: [person],
    },
    ...overrides,
    person,
  };
}

describe("PeopleAdminPage", () => {
  it("shows the empty owner state and the Oameni rail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          canEdit: true,
          people: [],
          skills: [cncSkill],
          registry: { summary: { total: 0 }, people: [] },
        }),
      ),
    );

    render(<PeopleAdminPage />);
    expect(await screen.findByText("Nu există oameni operaționali")).toBeInTheDocument();
    expect(screen.getAllByText("Oameni").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Produse oferite" })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.getByRole("button", { name: "Adaugă persoana" })).toBeDisabled();
    expect(screen.queryByText(/per:/)).not.toBeInTheDocument();
  });

  it("keeps the member page read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...adminPayload(), canEdit: false })),
    );

    render(<PeopleAdminPage />);
    expect(await screen.findAllByText("Operator Test")).not.toHaveLength(0);
    expect(screen.getByText("CNC")).toBeInTheDocument();
    expect(screen.getAllByText("PIN neconfigurat").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Adaugă persoana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează persoana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retrage persoana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atribuie calificarea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurează PIN" })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Editarea nu este disponibilă pentru acest rol.").length,
    ).toBeGreaterThan(0);
  });

  it("creates a person, assigns a skill, and configures PIN without disclosing it", async () => {
    const empty = {
      canEdit: true,
      people: [],
      skills: [cncSkill],
      registry: { summary: { total: 0 }, people: [] },
    };
    const created = adminPayload({
      person: personRow({ skills: [], operatorPinConfigured: false }),
    });
    const assigned = adminPayload();
    const pinned = adminPayload({
      person: personRow({ operatorPinConfigured: true }),
    });
    let stage: "empty" | "created" | "assigned" | "pinned" = "empty";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.endsWith("/api/people") && method === "POST") {
        stage = "created";
        return jsonResponse(created, 201);
      }
      if (url.includes("/skills") && method === "POST") {
        stage = "assigned";
        return jsonResponse(assigned);
      }
      if (url.includes("/operator-pin") && method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { pin?: string };
        expect(body.pin).toBe("1234");
        stage = "pinned";
        return jsonResponse({ ok: true });
      }
      if (stage === "pinned") {
        return jsonResponse(pinned);
      }
      if (stage === "assigned") {
        return jsonResponse(assigned);
      }
      if (stage === "created") {
        return jsonResponse(created);
      }
      return jsonResponse(empty);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PeopleAdminPage />);
    await screen.findByText("Nu există oameni operaționali");
    await user.type(screen.getByLabelText("Nume"), "Operator Test");
    await user.type(screen.getByLabelText("Rol"), "Operator");
    await user.click(screen.getByRole("button", { name: "Adaugă persoana" }));
    expect(await screen.findAllByText("Operator Test")).not.toHaveLength(0);
    expect(screen.getByText("Fără calificări · PIN neconfigurat")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Calificare"), cncSkill.skillId);
    await user.click(screen.getByRole("button", { name: "Atribuie calificarea" }));
    expect(await screen.findByText("CNC")).toBeInTheDocument();

    await user.type(screen.getByLabelText("PIN"), "1234");
    await user.type(screen.getByLabelText("Confirmă PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Configurează PIN" }));
    expect(await screen.findAllByText("PIN configurat")).not.toHaveLength(0);
    expect(screen.getByLabelText("PIN")).toHaveValue("");
    expect(screen.queryByDisplayValue("1234")).not.toBeInTheDocument();
    expect(screen.queryByText("1234")).not.toBeInTheDocument();
  });

  it("edits availability, retires a safe person, and presents an active-task block", async () => {
    const current = adminPayload();
    const unavailable = adminPayload({
      person: personRow({
        availability: "TEMPORARILY_UNAVAILABLE",
        availabilityLabel: "Indisponibil temporar",
        unavailableReason: "Concediu",
      }),
    });
    const retired = adminPayload({
      person: personRow({ status: "RETIRED", statusLabel: "Retras" }),
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/api/people/") && url.includes("operator-test") && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
        if (body.status === "RETIRED") {
          return jsonResponse({ error: "has_active_task" }, 409);
        }
        return jsonResponse(unavailable);
      }
      return jsonResponse(current);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PeopleAdminPage />);
    await screen.findByLabelText("Disponibilitate");
    await user.selectOptions(screen.getByLabelText("Disponibilitate"), "TEMPORARILY_UNAVAILABLE");
    await user.type(screen.getByLabelText("Motiv"), "Concediu");
    await user.click(screen.getByRole("button", { name: "Salvează persoana" }));
    expect(await screen.findByText("Indisponibil temporar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retrage persoana" }));
    expect(
      await screen.findByText("Persoana are o sarcină în lucru și nu poate fi retrasă."),
    ).toBeInTheDocument();
    expect(screen.queryByText(retired.person.displayName + " missing")).not.toBeInTheDocument();
  });

  it("retires a skill assignment and does not list it twice after a second assign", async () => {
    const withCnc = adminPayload();
    const withoutCnc = adminPayload({
      person: personRow({ skills: [] }),
    });
    let assigned = true;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/skills/") && method === "PATCH") {
        assigned = false;
        return jsonResponse(withoutCnc);
      }
      if (url.includes("/skills") && method === "POST") {
        assigned = true;
        return jsonResponse(withCnc);
      }
      return jsonResponse(assigned ? withCnc : withoutCnc);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PeopleAdminPage />);
    expect(await screen.findByText("CNC")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retrage calificarea" }));
    expect(await screen.findByText("Nu are calificări atribuite.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Atribuie calificarea" }));
    expect(await screen.findAllByText("CNC")).toHaveLength(1);
  });
});
