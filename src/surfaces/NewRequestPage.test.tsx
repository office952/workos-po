import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { NewRequestPage } from "./NewRequestPage";

const customer = { customerId: "cus-1", displayName: "Client test", cui: "RO12345678", status: "ACTIVE" };
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
function reads(input: RequestInfo) {
  const url = String(input);
  if (url.endsWith("/product-catalog")) return json({ tree: [{ kind: "product", code: "PRD-TEST", label: "Litere test" }] });
  if (url.endsWith("/workspace")) return json({ workspace: { customer, canCreateRequest: true, summary: {}, requests: [], quotes: [], jobs: [] } });
  return json({ customers: [customer] });
}
async function brief() { await userEvent.type(screen.getByLabelText("Titlu cerere"), "Litere atelier"); await userEvent.type(screen.getByLabelText("Descriere"), "Semnalistică la intrare"); }
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("request intake", () => {
  it.each([false, true])("creates the request first, then opens its product or its undecided detail (product=%s)", async (product) => {
    window.history.replaceState({}, "", "/cereri/noua?customer=cus-1");
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ request: { requestId: "req-new" } }, 201) : reads(input));
    vi.stubGlobal("fetch", fetchMock); render(<NewRequestPage />); await brief();
    if (product) await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    const button = screen.getByRole("button", { name: product ? "Creează cererea și configurează" : "Salvează cererea" });
    await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
    await waitFor(() => expect(window.location.pathname).toBe(product ? "/configurator" : "/cereri/req-new"));
    expect(fetchMock).toHaveBeenCalledWith("/api/requests", expect.objectContaining({ method: "POST", body: JSON.stringify({ customerId: "cus-1", title: "Litere atelier", description: "Semnalistică la intrare" }) }));
    if (product) { const params = new URLSearchParams(window.location.search); expect(params.get("customer")).toBe("cus-1"); expect(params.get("request")).toBe("req-new"); expect(params.get("product")).toBe("PRD-TEST"); }
  });
  it("detects an existing CUI and selects that customer without a customer POST", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => String(input).includes("fiscal-lookup") ? json({ status: "existing", customers: [customer] }) : init?.method === "POST" ? json({ request: { requestId: "req-new" } }, 201) : reads(input));
    vi.stubGlobal("fetch", fetchMock); render(<NewRequestPage />);
    await userEvent.click(screen.getByRole("button", { name: "Adaugă client rapid" })); await userEvent.type(screen.getByLabelText("CUI"), "RO12345678");
    await userEvent.click(screen.getByRole("button", { name: "Preia datele după CUI" }));
    expect(await screen.findByText(/Clientul există deja în sistem/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Client existent" })).toHaveValue("cus-1");
    await brief(); await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cereri/req-new"));
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/customers" && init?.method === "POST")).toHaveLength(0);
  });
  it("prefills fiscal data and reuses a saved customer if request creation must be retried", async () => {
    let requestAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("fiscal-lookup")) return json({ status: "found", profile: { cui: "12345678", displayName: "Client test", address: "Strada test 1", city: "Cluj" } });
      if (init?.method === "POST" && String(input) === "/api/customers") return json({ customer }, 201);
      if (init?.method === "POST") return ++requestAttempts === 1 ? json({}, 503) : json({ request: { requestId: "req-new" } }, 201);
      return reads(input);
    });
    vi.stubGlobal("fetch", fetchMock); render(<NewRequestPage />);
    await userEvent.click(screen.getByRole("button", { name: "Adaugă client rapid" })); await userEvent.type(screen.getByLabelText("CUI"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Preia datele după CUI" }));
    await waitFor(() => expect(screen.getByLabelText("Denumire client")).toHaveValue("Client test"));
    expect(screen.getByLabelText("Adresă")).toHaveValue("Strada test 1"); await brief();
    await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    await screen.findByText(/Cererea nu a putut fi salvată/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvează cererea" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cereri/req-new"));
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/customers" && init?.method === "POST")).toHaveLength(1);
  });
  it("does not navigate from an abandoned pending request or submit twice", async () => {
    window.history.replaceState({}, "", "/cereri/noua?customer=cus-1"); let release!: (value: unknown) => void;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? new Promise(resolve => { release = resolve; }) : reads(input));
    vi.stubGlobal("fetch", fetchMock); const view = render(<NewRequestPage />); await brief();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvează cererea" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    expect(screen.getByRole("button", { name: "Se salvează…" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    view.unmount(); window.history.replaceState({}, "", "/cereri");
    await act(async () => release(await json({ request: { requestId: "req-old" } }, 201)));
    expect(window.location.pathname).toBe("/cereri");
  });

  it("returns from a chosen product to undecided and updates the continuation", async () => {
    window.history.replaceState({}, "", "/cereri/noua?customer=cus-1");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ request: { requestId: "req-undecided" } }, 201) : reads(input)));
    render(<NewRequestPage />); await brief();
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.getByRole("button", { name: "Creează cererea și configurează" })).toBeEnabled();
    expect(screen.queryByLabelText("Caută produs")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Momentan indecis/ }));
    await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cereri/req-undecided"));
  });

  it("allows manual client registration after an unavailable CUI lookup", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("fiscal-lookup")) return json({}, 503);
      if (init?.method === "POST") { calls.push(url); return url === "/api/customers" ? json({ customer }, 201) : json({ request: { requestId: "req-manual" } }, 201); }
      return reads(input);
    }));
    render(<NewRequestPage />);
    await userEvent.click(screen.getByRole("button", { name: "Adaugă client rapid" }));
    await userEvent.type(screen.getByLabelText("CUI"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Preia datele după CUI" }));
    await screen.findByText(/Verificarea CUI nu este disponibilă/);
    await userEvent.type(screen.getByLabelText("Denumire client"), "Client manual");
    await brief(); await userEvent.click(screen.getByRole("button", { name: "Salvează cererea" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cereri/req-manual"));
    expect(calls).toEqual(["/api/customers", "/api/requests"]);
  });

  it("does not allow the selected client's summary to bypass server permission", async () => {
    window.history.replaceState({}, "", "/cereri/noua?customer=cus-1");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => String(input).endsWith("/workspace") ? json({ workspace: { customer, canCreateRequest: false, summary: {}, requests: [], quotes: [], jobs: [] } }) : reads(input)));
    render(<NewRequestPage />); await brief();
    expect(screen.getByLabelText("Client selectat")).toHaveTextContent("Client test");
    expect(screen.getByRole("button", { name: "Salvează cererea" })).toBeDisabled();
    expect(screen.getByText("Nu poți crea o cerere pentru acest client.")).toBeInTheDocument();
  });
});
