import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { RequestProductSelection } from "./RequestProductSelection";
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const read = (url: RequestInfo) => String(url).includes("product-catalog") ? json({ tree: [{ kind: "product", code: "PRD-LETTERS", label: "Litere" }] }) : json({ canCreate: true, offerings: [{ kind: "ASM-KIND", label: "Panou și litere", available: true, members: [] }] });
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); window.history.replaceState({}, "", "/"); });
it("selects a product in the request context", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => read(input))); render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  expect(await screen.findByRole("heading", { name: "Produs compus" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: /Litere.*Alege/ }));
  expect(window.location.pathname).toBe("/configurator");
  expect(new URLSearchParams(window.location.search).get("request")).toBe("req-A");
  expect(new URLSearchParams(window.location.search).get("customer")).toBe("cus-A");
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
