import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { RequestProductSelection } from "./RequestProductSelection";
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const read = (url: RequestInfo) => String(url).includes("product-catalog") ? json({ tree: [{ kind: "product", code: "PRD-LETTERS", label: "Litere" }] }) : String(url).includes("?request=") ? json({ assemblies: [{ assemblyId: "asm-old", label: "Ansamblu început", statusLabel: "În lucru" }] }) : json({ canCreate: true, offerings: [{ kind: "ASM-KIND", label: "Panou și litere", available: true, members: [] }] });
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); window.history.replaceState({}, "", "/"); });
it("selects a product in the request context and offers reopening existing assemblies", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => read(input))); render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  expect(await screen.findByRole("link", { name: "Ansamblu început" })).toHaveAttribute("href", "/ansamblu?assembly=asm-old");
  await userEvent.click(await screen.findByRole("button", { name: /Litere.*Alege/ }));
  expect(window.location.pathname).toBe("/configurator");
  expect(new URLSearchParams(window.location.search).get("request")).toBe("req-A");
  expect(new URLSearchParams(window.location.search).get("customer")).toBe("cus-A");
});
it("guards repeated assembly clicks, recovers after failure and ignores abandoned responses", async () => {
  let release!: (value: unknown) => void;
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => init?.method === "POST" ? new Promise(resolve => { release = resolve; }) : read(input));
  vi.stubGlobal("fetch", fetchMock); const view = render(<RequestProductSelection customerId="cus-A" requestId="req-A" />);
  const button = await screen.findByRole("button", { name: "Configurează Panou și litere" }); await userEvent.click(button); expect(button).toBeDisabled();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => release(await json({}, 503))); await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button); view.unmount(); window.history.replaceState({}, "", "/cereri/req-B");
  await act(async () => release(await json({ assembly: { assemblyId: "old-response" } }, 201)));
  expect(window.location.pathname).toBe("/cereri/req-B");
});
