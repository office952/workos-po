import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { AssemblyOperationCostPanel } from "./AssemblyOperationCostPanel";
import { AssemblyOperationCostPolicyPanel } from "./AssemblyOperationCostPolicyPanel";
import { AssemblyPage } from "./AssemblyPage";
import { presentAssemblyOperationCost } from "../adapters/assemblyOperationCostAdapter";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState(null, "", "/");
});

type FetchCall = [string, RequestInit | undefined];

function stubFetch(handler: (path: string, init?: RequestInit) => { status: number; body: unknown }) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const { status, body } = handler(String(path), init);
    return Promise.resolve({ ok: status < 400, status, json: async () => body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as { mock: { calls: FetchCall[] } };
}

function line(overrides: Record<string, unknown>) {
  return {
    processId: "MOUNT_LETTERS_ON_PANEL",
    label: "Montaj litere",
    outcome: "COSTED",
    statusLabel: "Cost calculat",
    basisLabel: "Timp estimat",
    quantity: 2.5,
    unitLabel: "ore-persoană",
    rate: 30,
    cost: 75,
    currency: "EUR",
    reason: null,
    ...overrides,
  };
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    source: "PREVIEW",
    sourceLabel: "Estimare pentru oferta următoare",
    editable: true,
    policyLabel: "Politica organizației, versiunea 1",
    estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", label: "Montaj litere", personHours: 2.5 }],
    lines: [
      line({}),
      line({
        processId: "INSPECT_FINISHED_ASSEMBLY",
        label: "Verificare finală",
        outcome: "INCLUDED",
        statusLabel: "Cost inclus în alte operații",
        basisLabel: null,
        quantity: null,
        unitLabel: null,
        rate: null,
        cost: 0,
      }),
      line({
        processId: "PACK_PRODUCT",
        label: "Ambalare",
        basisLabel: "Suprafața panoului",
        quantity: 0.5,
        unitLabel: "m²",
        rate: 10,
        cost: 5,
      }),
    ],
    knownTotal: 80,
    currency: "EUR",
    completeness: "COMPLETE",
    completenessLabel: "Cost estimat complet",
    verificationLabel: null,
    notice: "Costul se fixează la înghețarea ofertei. Nu modifică prețul pentru client.",
    ...overrides,
  };
}

function presented(overrides: Record<string, unknown> = {}) {
  const value = presentAssemblyOperationCost(view(overrides));
  if (!value) {
    throw new Error("fixture must be presentable");
  }
  return value;
}

function adminBody(overrides: Record<string, unknown> = {}) {
  return {
    canEdit: true,
    version: 1,
    updatedAt: "2026-10-14T08:00:00.000Z",
    finalInspectionMode: "INCLUDED_IN_OTHER_OPERATIONS",
    finalPackagingMode: "PANEL_FACE_AREA",
    inspectionOptions: [
      { value: "NOT_CONFIGURED", label: "Neconfigurat" },
      { value: "INCLUDED_IN_OTHER_OPERATIONS", label: "Inclus în alte operații" },
      { value: "SEPARATE_LABOR", label: "Manoperă separată (ore estimate)" },
    ],
    packagingOptions: [
      { value: "NOT_CONFIGURED", label: "Neconfigurat" },
      { value: "PANEL_FACE_AREA", label: "Suprafața panoului" },
    ],
    history: [
      {
        version: 1,
        updatedAt: "2026-10-14T08:00:00.000Z",
        finalInspectionLabel: "Inclus în alte operații",
        finalPackagingLabel: "Suprafața panoului",
      },
    ],
    rates: [
      {
        resourceId: "LAB-WORKSHOP-LABOR",
        label: "Manoperă atelier",
        status: "MISSING",
        statusLabel: "Tarif lipsă",
        evidenceRowId: null,
      },
      {
        resourceId: "SVC-PACK-PRODUCT",
        label: "Ambalare produs",
        status: "CONFIRMED",
        statusLabel: "Tarif confirmat",
        evidenceRowId: "cev:pack",
        amount: 10,
        currency: "EUR",
      },
    ],
    futureOnlyNotice: "Modificările se aplică doar ofertelor de ansamblu înghețate de acum înainte.",
    ...overrides,
  };
}

describe("assembly internal operation cost panel", () => {
  it("1/8 lets an authorized user enter hours with the keyboard and sends them to the server", async () => {
    const saved = view({ estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", label: "Montaj litere", personHours: 3 }] });
    const fetchMock = stubFetch(() => ({ status: 200, body: { assembly: { operationCost: saved } } }));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<AssemblyOperationCostPanel assemblyId="asm:1" cost={presented()} onSaved={onSaved} />);

    const hours = screen.getByLabelText("Montaj litere (ore-persoană)");
    expect(hours).toHaveValue("2,5");
    await user.click(hours);
    await user.clear(hours);
    await user.keyboard("3");
    await user.tab();
    const button = screen.getByRole("button", { name: "Salvează orele estimate" });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Ore salvate")).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/assemblies/asm%3A1/operation-estimates");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 3 }],
    });
    expect(onSaved).toHaveBeenCalledWith({ operationCost: saved });
  });

  it("2 shows a frozen cost read-only and hides the panel when the server sends no internal cost", async () => {
    render(
      <AssemblyOperationCostPanel
        assemblyId="asm:1"
        cost={presented({ source: "FROZEN", sourceLabel: "Înghețat în oferta curentă", editable: false })}
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByText("Înghețat în oferta curentă")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(presentAssemblyOperationCost(null)).toBeNull();
  });

  it("3/6 shows missing rate, policy and packaging quantity as unknown, never as zero", () => {
    render(
      <AssemblyOperationCostPanel
        assemblyId="asm:1"
        cost={presented({
          lines: [
            line({
              outcome: "MISSING_RATE",
              statusLabel: "Tarif lipsă",
              quantity: null,
              unitLabel: null,
              rate: null,
              cost: null,
              reason: "Tariful pentru manopera atelierului nu este configurat",
            }),
            line({
              processId: "INSPECT_FINISHED_ASSEMBLY",
              label: "Verificare finală",
              outcome: "MISSING_POLICY",
              statusLabel: "Politică neconfigurată",
              quantity: null,
              unitLabel: null,
              rate: null,
              cost: null,
              reason: "Politica de verificare finală nu este configurată",
            }),
            line({
              processId: "PACK_PRODUCT",
              label: "Ambalare",
              outcome: "MISSING_QUANTITY",
              statusLabel: "Cantitate lipsă",
              quantity: null,
              unitLabel: null,
              rate: null,
              cost: null,
              reason: "Suprafața panoului nu este disponibilă pentru ambalare",
            }),
          ],
          knownTotal: 0,
          completeness: "PARTIAL",
          completenessLabel: "Cost estimat incomplet",
        })}
        onSaved={() => undefined}
      />,
    );
    const lines = within(screen.getByRole("list", { name: "Operații de ansamblare" })).getAllByRole("listitem");
    expect(lines).toHaveLength(3);
    for (const item of lines) {
      expect(within(item).getByText("Necunoscut")).toBeInTheDocument();
      expect(within(item).queryByText(/0,00 EUR/)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Tarif lipsă")).toBeInTheDocument();
    expect(screen.getByText("Tariful pentru manopera atelierului nu este configurat")).toBeInTheDocument();
    expect(screen.getByText("Cantitate lipsă")).toBeInTheDocument();
    expect(screen.getByText("Suprafața panoului nu este disponibilă pentru ambalare")).toBeInTheDocument();
    expect(screen.getByText("Cost estimat incomplet")).toBeInTheDocument();
    expect(screen.getByText("Cost intern cunoscut (parțial)")).toBeInTheDocument();
    expect(screen.queryByText("Cost intern estimat")).not.toBeInTheDocument();
    expect(screen.getByText(/nu sunt tratate ca zero/)).toBeInTheDocument();
  });

  it("4 keeps the unconfirmed-rate status visible next to the cost", () => {
    render(
      <AssemblyOperationCostPanel
        assemblyId="asm:1"
        cost={presented({
          lines: [line({ outcome: "UNCONFIRMED_RATE", statusLabel: "Tarif neconfirmat" })],
          knownTotal: 75,
          verificationLabel: "Conține tarife neconfirmate",
        })}
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByText("Tarif neconfirmat")).toBeInTheDocument();
    expect(screen.getByText("Conține tarife neconfirmate")).toBeInTheDocument();
    expect(screen.getAllByText("75,00 EUR").length).toBeGreaterThan(0);
  });

  it("5/9 shows included final inspection as explicit zero and renders only server amounts", () => {
    render(
      <AssemblyOperationCostPanel
        assemblyId="asm:1"
        cost={presented({ knownTotal: 123.45 })}
        onSaved={() => undefined}
      />,
    );
    const inspection = screen.getByText("Verificare finală").closest("li")!;
    expect(within(inspection).getByText("Cost inclus în alte operații")).toBeInTheDocument();
    expect(within(inspection).getByText("0,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("Timp estimat: 2,5 ore-persoană × 30,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("Suprafața panoului: 0,5 m² × 10,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("123,45 EUR")).toBeInTheDocument();
    expect(screen.queryByText("80,00 EUR")).not.toBeInTheDocument();
  });

  it("7 reports a refused save with the server reason", async () => {
    stubFetch(() => ({
      status: 409,
      body: { error: "estimates_frozen", reasons: ["Orele estimate sunt înghețate în oferta curentă."] },
    }));
    render(<AssemblyOperationCostPanel assemblyId="asm:1" cost={presented()} onSaved={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvează orele estimate" }));
    expect(await screen.findByText("Orele estimate sunt înghețate în oferta curentă.")).toBeInTheDocument();
  });

  it("9 keeps cost arithmetic out of the frontend modules", () => {
    for (const file of [
      "src/surfaces/AssemblyOperationCostPanel.tsx",
      "src/surfaces/AssemblyOperationCostPolicyPanel.tsx",
      "src/adapters/assemblyOperationCostAdapter.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\.quantity\s*\*|\*\s*\w+\.rate|\.reduce\(/);
      expect(source).not.toMatch(/@workos-final\/domain/);
    }
  });
});

describe("assembly page wiring", () => {
  it("renders the internal cost only when the server provides it", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:cost");
    const assembly = {
      assemblyId: "asm:cost",
      customerId: "cus:1",
      requestId: "crq:1",
      label: "Panou ACM + litere volumetrice",
      status: "CONFIRMED",
      statusLabel: "Confirmat",
      stale: false,
      staleReason: null,
      canConfirm: false,
      scopes: [{ id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" }],
      quote: null,
      quoteFreezable: true,
      orderId: null,
      productionId: null,
      executionPlanId: null,
    };
    stubFetch(() => ({ status: 200, body: { assembly: { ...assembly, operationCost: view() } } }));
    const { unmount } = render(<AssemblyPage />);
    expect(await screen.findByText("Cost intern ansamblare")).toBeInTheDocument();
    expect(screen.getByText("80,00 EUR")).toBeInTheDocument();
    unmount();
    resetResourceCache();

    stubFetch(() => ({ status: 200, body: { assembly: { ...assembly, operationCost: null } } }));
    render(<AssemblyPage />);
    expect(await screen.findByRole("button", { name: "Îngheață oferta" })).toBeInTheDocument();
    expect(screen.queryByText("Cost intern ansamblare")).not.toBeInTheDocument();
  });
});

describe("organization assembly cost policy panel", () => {
  it("7 shows loading, then a failed state when the policy cannot be read", async () => {
    stubFetch(() => ({ status: 500, body: { error: "unavailable" } }));
    render(<AssemblyOperationCostPolicyPanel />);
    expect(screen.getByText("Se citește politica de ansamblare")).toBeInTheDocument();
    expect(await screen.findByText("Politica nu este disponibilă")).toBeInTheDocument();
  });

  it("1/3 creates the missing initial workshop rate through the existing cost evidence POST", async () => {
    const fetchMock = stubFetch((_path, init) =>
      init?.method === "POST"
        ? { status: 201, body: { evidence: { evidenceRowId: "cev:labor" } } }
        : { status: 200, body: adminBody() },
    );
    const user = userEvent.setup();
    render(<AssemblyOperationCostPolicyPanel />);
    expect(await screen.findByText("Tarif lipsă")).toBeInTheDocument();
    expect(screen.getByText("Nu există tarif")).toBeInTheDocument();
    expect(screen.getByText("Modificările se aplică doar ofertelor de ansamblu înghețate de acum înainte.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tarif manoperă atelier (EUR / oră-persoană)"), "30,5");
    await user.click(screen.getByRole("button", { name: "Creează tariful inițial" }));
    expect(await screen.findByText("Tarif salvat")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/resources-admin/cost-evidence");
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ resourceId: "LAB-WORKSHOP-LABOR", amount: 30.5 });
  });

  it("1 supersedes an existing workshop rate through the existing PATCH and saves the policy with its version", async () => {
    const body = adminBody({
      rates: [
        {
          resourceId: "LAB-WORKSHOP-LABOR",
          label: "Manoperă atelier",
          status: "UNCONFIRMED",
          statusLabel: "Tarif neconfirmat",
          evidenceRowId: "cev:labor",
          amount: 25,
          currency: "EUR",
        },
      ],
    });
    const fetchMock = stubFetch((_path, init) => {
      if (init?.method === "PATCH") {
        return { status: 200, body: {} };
      }
      if (init?.method === "POST") {
        return { status: 200, body: { ...body, version: 2, alreadyApplied: false, finalInspectionMode: "SEPARATE_LABOR" } };
      }
      return { status: 200, body };
    });
    const user = userEvent.setup();
    render(<AssemblyOperationCostPolicyPanel />);
    expect(await screen.findByText("Tarif neconfirmat")).toBeInTheDocument();
    const rate = screen.getByLabelText("Tarif manoperă atelier (EUR / oră-persoană)");
    expect(rate).toHaveValue("25");
    await user.clear(rate);
    await user.type(rate, "32");
    await user.click(screen.getByRole("button", { name: "Înlocuiește tariful" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/resources-admin/cost-evidence/cev%3Alabor");
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ amount: 32 });

    await user.selectOptions(screen.getByLabelText("Verificare finală"), "SEPARATE_LABOR");
    await user.click(screen.getByRole("button", { name: "Salvează politica" }));
    expect(await screen.findByText("Politică salvată")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/admin/assembly-operation-cost-policy");
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      expectedVersion: 1,
      finalInspectionMode: "SEPARATE_LABOR",
      finalPackagingMode: "PANEL_FACE_AREA",
    });
    expect(await screen.findByText("Versiunea 2")).toBeInTheDocument();
  });

  it("2 is read-only without amounts for a role without financial access", async () => {
    stubFetch(() => ({
      status: 200,
      body: adminBody({
        canEdit: false,
        rates: [
          {
            resourceId: "LAB-WORKSHOP-LABOR",
            label: "Manoperă atelier",
            status: "CONFIRMED",
            statusLabel: "Tarif confirmat",
            evidenceRowId: "cev:labor",
          },
        ],
      }),
    }));
    render(<AssemblyOperationCostPolicyPanel />);
    expect(await screen.findByText("Vizibil doar proprietarului")).toBeInTheDocument();
    expect(screen.getByLabelText("Verificare finală")).toBeDisabled();
    expect(screen.getByLabelText("Ambalare finală")).toBeDisabled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tarif manoperă atelier/)).not.toBeInTheDocument();
  });

  it("7 explains a stale policy write and offers a reload", async () => {
    stubFetch((_path, init) =>
      init?.method === "POST"
        ? { status: 409, body: { error: "stale_policy_version" } }
        : { status: 200, body: adminBody() },
    );
    const user = userEvent.setup();
    render(<AssemblyOperationCostPolicyPanel />);
    await user.selectOptions(await screen.findByLabelText("Ambalare finală"), "NOT_CONFIGURED");
    await user.click(screen.getByRole("button", { name: "Salvează politica" }));
    expect(await screen.findByText("Politica a fost modificată între timp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reîncarcă politica curentă" })).toBeInTheDocument();
  });
});
