import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { RequestProductSelection } from "./RequestProductSelection";
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const read = (url: RequestInfo) => String(url).includes("product-catalog") ? json({ tree: [{ kind: "product", code: "PRD-LETTERS", label: "Litere" }] }) : json({ canCreate: true, offerings: [{ kind: "ASM-KIND", label: "Panou și litere", available: true, members: [] }] });
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); window.history.replaceState({}, "", "/"); });
const variant = { variantId: "var-A", requestId: "req-A", productCode: "PRD-LETTERS", indexLabel: "01", version: 1, state: "IN_PROGRESS", stateLabel: "În lucru", action: "CONTINUE", actionLabel: "Continuă" };
it("creates the saved quote variant when a product is selected and opens the Configurator on it", async () => {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ variant }, 201) : read(input));
  vi.stubGlobal("fetch", fetchMock); render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  expect(await screen.findByRole("heading", { name: "Produs compus" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: /Litere.*Configurează/ }));
  await waitFor(() => expect(window.location.pathname).toBe("/configurator"));
  const params = new URLSearchParams(window.location.search);
  expect(params.get("request")).toBe("req-A");
  expect(params.get("customer")).toBe("cus-A");
  expect(params.get("varianta")).toBe("var-A");
  expect(posts(fetchMock)).toHaveLength(1);
  expect(String(posts(fetchMock)[0]?.[0])).toContain("/api/requests/req-A/variants");
});
it("keeps the earlier path on an environment without variants, and shows a refusal instead of navigating", async () => {
  const unavailable = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ error: "variants_unavailable", reasons: [] }, 409) : read(input));
  vi.stubGlobal("fetch", unavailable); const first = render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  await userEvent.click(await screen.findByRole("button", { name: /Litere.*Configurează/ }));
  await waitFor(() => expect(window.location.pathname).toBe("/configurator"));
  expect(new URLSearchParams(window.location.search).get("varianta")).toBeNull();
  first.unmount(); resetResourceCache(); window.history.replaceState({}, "", "/");
  const refused = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ error: "request_closed", reasons: ["Cererea este închisă comercial."] }, 409) : read(input));
  vi.stubGlobal("fetch", refused); render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  await userEvent.click(await screen.findByRole("button", { name: /Litere.*Configurează/ }));
  expect(await screen.findByText("Cererea este închisă comercial.")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
});
it("guards repeated assembly clicks, recovers after failure and ignores abandoned responses", async () => {
  let release!: (value: unknown) => void;
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? new Promise(resolve => { release = resolve; }) : read(input));
  vi.stubGlobal("fetch", fetchMock); const view = render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  const button = await screen.findByRole("button", { name: "Începe: Panou și litere" }); await userEvent.click(button); expect(button).toBeDisabled();
  expect(posts(fetchMock)).toHaveLength(1);
  await act(async () => release(await json({}, 503))); await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button); view.unmount(); window.history.replaceState({}, "", "/cereri/req-B");
  await act(async () => release(await json({ assembly: { assemblyId: "old-response" } }, 201)));
  expect(window.location.pathname).toBe("/cereri/req-B");
});
it("routes a server duplicate refusal to the existing assembly instead of creating another", async () => {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST"
    ? json({ error: "assembly_exists", assemblyId: "asm-existing", reasons: ["Cererea are deja ansamblul „Panou și litere”."] }, 409)
    : read(input));
  vi.stubGlobal("fetch", fetchMock); render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  await userEvent.click(await screen.findByRole("button", { name: "Începe: Panou și litere" }));
  expect(await screen.findByText("Există deja lucru comercial")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Deschide ansamblul existent" })).toHaveAttribute("href", "/ansamblu?assembly=asm-existing");
  expect(window.location.pathname).toBe("/");
});
it("starts a commercial alternative only after explicit confirmation and declares the intent", async () => {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? json({ assembly: { assemblyId: "asm-alt" } }, 201) : read(input));
  vi.stubGlobal("fetch", fetchMock);
  render(<RequestProductSelection customerId="cus-A" requestId="req-A" mode="additional" existingLabel="Panou și litere" />);
  await userEvent.click(await screen.findByText("Adaugă altă lucrare la această cerere"));
  expect(screen.queryByRole("button", { name: /^Începe/ })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Creează variantă nouă: Panou și litere" }));
  expect(posts(fetchMock)).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Renunță" }));
  expect(posts(fetchMock)).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Creează variantă nouă: Panou și litere" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmă varianta nouă" }));
  await waitFor(() => expect(window.location.search).toBe("?assembly=asm-alt"));
  const [, init] = posts(fetchMock)[0] as [RequestInfo, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({ requestId: "req-A", kind: "ASM-KIND", commercialIntent: "COMMERCIAL_ALTERNATIVE" });
});
