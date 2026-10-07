// ANAF v9: official contract https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
// Lookup is advisory and read-only. It never creates a customer or changes a fiscal status.
export function normalizeCui(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim().toUpperCase().replace(/^RO\s*/, "").replace(/\s/g, "");
  return /^[1-9]\d{1,9}$/.test(digits) ? digits : null;
}

type FiscalProfile = { displayName: string; cui: string; address: string; city: string };
type LookupResult = { status: "found"; profile: FiscalProfile } | { status: "not_found" };
const cache = new Map<string, { expires: number; result: LookupResult }>();
let nextRequestAt = 0;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function lookupFiscalProfile(cui: string): Promise<LookupResult> {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const key = `${cui}:${date}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  if (Date.now() < nextRequestAt) throw new Error("fiscal_lookup_busy");
  nextRequestAt = Date.now() + 1000;
  const response = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ cui: Number(cui), data: date }]), signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("fiscal_lookup_unavailable");
  const payload = record(await response.json());
  if (!payload || payload.cod !== 200 || !Array.isArray(payload.found) || !Array.isArray(payload.notFound)) throw new Error("fiscal_lookup_unavailable");
  const found = payload.found.map(record).find(row => {
    const general = record(row?.date_generale);
    return normalizeCui(String(general?.cui ?? "")) === cui;
  });
  let result: LookupResult;
  if (found) {
    const general = record(found.date_generale);
    const address = record(found.adresa_domiciliu_fiscal);
    if (!text(general?.denumire)) throw new Error("fiscal_lookup_unavailable");
    result = { status: "found", profile: { displayName: text(general?.denumire), cui, address: text(general?.adresa), city: text(address?.ddenumire_Localitate) } };
  } else if (payload.notFound.some(value => normalizeCui(String(value)) === cui)) {
    result = { status: "not_found" };
  } else throw new Error("fiscal_lookup_unavailable");
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 15 * 60_000, result });
  return result;
}
