import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { readConfiguratorSession, writeConfiguratorSession } from "../session/configuratorSession";
import { CatalogPage } from "./CatalogPage";

const model = { canEdit: true, products: [{ code: "PRD-TEST", label: "Litere test", displayRevision: 2, familyLabel: "Semnalistică", categoryLabel: "Litere", description: "Construcție luminoasă", composition: [{ role: "FACE", roleLabel: "Față", typeId: "PLEXIGLAS_FACE", typeLabel: "Plexiglas" }] }], types: [{ typeId: "PLEXIGLAS_FACE", label: "Plexiglas", description: "Față opal", configurations: [{ productCode: "PRD-TEST", attributes: [{ label: "Material", valueDisplay: "Plexiglas opal", ownershipLabel: "Definiție" }] }], calculationInputs: [{ label: "Arie", value: "Confirmată în lucrare" }], resourceReferences: [{ id: "res-face", label: "Placă plexiglas" }], processReferences: [{ id: "cut", label: "Decupare" }] }] };
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("Catalog definitions", () => {
  it("reads definitions without customer/request IO or session context and exposes component settings", async () => {
    window.history.replaceState({}, "", "/catalog");
    writeConfiguratorSession({ customerId: "cus-A", requestId: "req-A", productCode: "OTHER", drafts: { inscription: "A" }, draftContext: { customerId: "cus-A", requestId: "req-A", productCode: "OTHER" }, lastQuote: null });
    const before = readConfiguratorSession();
    const fetchMock = vi.fn((input: RequestInfo) => { void input; return json(model); }); vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.getByText("Plexiglas opal")).toBeInTheDocument();
    expect(screen.getByText("Confirmată în lucrare")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Formulele acestei componente" })).toHaveAttribute("href", "/admin/formulas?component=PLEXIGLAS_FACE");
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/product-system-admin");
    expect(window.location.pathname).toBe("/catalog");
    expect(readConfiguratorSession()).toEqual(before);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/creează cererea/i)).not.toBeInTheDocument();
  });
  it("uses the existing revisioned label endpoint, without a commercial mutation", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => json(init?.method === "PATCH" ? {} : model)); vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("button", { name: "Editează denumirea" }));
    await userEvent.clear(screen.getByLabelText("Denumire produs"));
    await userEvent.type(screen.getByLabelText("Denumire produs"), "Litere noi");
    await userEvent.click(screen.getByRole("button", { name: "Salvează denumirea" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/product-system/entities/PRODUCT_TEMPLATE/PRD-TEST/display-label", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ displayLabel: "Litere noi", revision: 2 }) }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("fails closed for editing when canEdit is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ ...model, canEdit: undefined })));
    render(<CatalogPage />); await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
  });
  it("recovers from unreadable definitions", async () => {
    const fetchMock = vi.fn(() => json({}, 503)); vi.stubGlobal("fetch", fetchMock); render(<CatalogPage />);
    await screen.findByText("Definițiile produselor nu au putut fi citite"); fetchMock.mockImplementation(() => json(model));
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("button", { name: /Litere test/ })).toBeInTheDocument();
  });
});
