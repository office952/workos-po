import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { normalizeCui } from "../src/customers/fiscalLookup.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (body: unknown) => ({ ok: true, json: async () => body });

describe("fiscal lookup", () => {
  it("normalizes CUI for matching and rejects nonnumeric identifiers", () => {
    expect(normalizeCui(" ro 12345678 ")).toBe("12345678");
    expect(normalizeCui("12345678")).toBe("12345678");
    for (const value of ["", "RO", "abc", "12-34", "01234", "12345678901", null]) expect(normalizeCui(value)).toBeNull();
  });
  it("selects an organization customer before external lookup and refuses normalized duplicates on POST/PATCH", async () => {
    const app = createApp(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const create = (body: unknown) => app.request("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const first = await create({ displayName: "Firma A", cui: "RO12345678" });
    const firstId = ((await first.json()) as { customer: { customerId: string } }).customer.customerId;
    const lookup = await app.request("/api/customers/fiscal-lookup?cui=12345678");
    expect(await lookup.json()).toMatchObject({ status: "existing", customers: [{ customerId: firstId }] }); expect(fetchMock).not.toHaveBeenCalled();
    const duplicate = await create({ displayName: "Firma duplicată", cui: "12345678" }); expect(duplicate.status).toBe(409); expect(await duplicate.json()).toMatchObject({ error: "duplicate_cui" });
    const second = await create({ displayName: "Firma B" }); const secondId = ((await second.json()) as { customer: { customerId: string } }).customer.customerId;
    const patch = await app.request(`/api/customers/${secondId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Nu modifica", cui: "RO 12345678" }) }); expect(patch.status).toBe(409);
    expect(await (await app.request(`/api/customers/${secondId}`)).json()).toMatchObject({ customer: { displayName: "Firma B", cui: null } });
    const invalid = await app.request("/api/customers/fiscal-lookup?cui=invalid"); expect(invalid.status).toBe(400);
  });
  it("parses only the requested fiscal profile, caches it and enforces the upstream rate", async () => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const { lookupFiscalProfile } = await import("../src/customers/fiscalLookup.js");
    const fetchMock = vi.fn(async () => json({ cod: 200, found: [{ date_generale: { cui: 12345678, denumire: "Firma test", adresa: "Strada 1" }, adresa_domiciliu_fiscal: { ddenumire_Localitate: "Cluj" } }], notFound: [] })); vi.stubGlobal("fetch", fetchMock);
    expect(await lookupFiscalProfile("12345678")).toEqual({ status: "found", profile: { cui: "12345678", displayName: "Firma test", address: "Strada 1", city: "Cluj" } });
    await lookupFiscalProfile("12345678"); expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(lookupFiscalProfile("98765432")).rejects.toThrow("fiscal_lookup_busy");
    vi.advanceTimersByTime(1000); fetchMock.mockImplementation(async () => json({ cod: 200, found: [], notFound: [98765432] }));
    expect(await lookupFiscalProfile("98765432")).toEqual({ status: "not_found" });
    vi.advanceTimersByTime(1000); fetchMock.mockImplementation(async () => json({ cod: 200, found: [], notFound: [] }));
    await expect(lookupFiscalProfile("11111111")).rejects.toThrow("fiscal_lookup_unavailable");
  });
});
