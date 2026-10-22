import { getJson, postJson, readTransportErrorCode, readTransportReasons, sendJson, TransportError } from "./http";
import { asNumber, asRecord, asString } from "../adapters/record";

/** Transport intent the server requires before it opens a second assembly on the same request. */
export const COMMERCIAL_ALTERNATIVE_INTENT = "COMMERCIAL_ALTERNATIVE";
/** Transport intent the server requires before it freezes a standalone quote for a product already in a request assembly. */
export const SEPARATE_QUOTE_INTENT = "SEPARATE_QUOTE";

export type AssemblyOffering = { kind: string; label: string; summary: string; members: { role: string; productCode: string; label: string }[] };
export async function loadAssemblyOfferings(): Promise<{ canCreate: boolean; offerings: AssemblyOffering[] }> {
  const body = asRecord(await getJson("/api/assemblies/offering"));
  if (!body || !Array.isArray(body.offerings)) throw new Error("unpresentable_assembly_offerings");
  return { canCreate: body.canCreate === true, offerings: body.offerings.flatMap(item => {
    const row = asRecord(item);
    if (!row || row.available !== true || typeof row.kind !== "string" || typeof row.label !== "string") return [];
    return [{ kind: row.kind, label: row.label, summary: asString(row.summary) ?? "", members: Array.isArray(row.members) ? row.members.flatMap(value => { const member = asRecord(value); return member && typeof member.role === "string" && typeof member.productCode === "string" && typeof member.label === "string" ? [{ role: member.role, productCode: member.productCode, label: member.label }] : []; }) : [] }];
  }) };
}

/** The server refused because the request already holds commercial work for this scope. */
export class ExistingCommercialWorkError extends Error {
  readonly assemblyId: string;
  readonly reason: string;
  constructor(assemblyId: string, reason: string) {
    super("existing_commercial_work");
    this.assemblyId = assemblyId;
    this.reason = reason;
  }
}

/** Maps a 409 continuation refusal to a typed error; other failures pass through unchanged. */
export function existingCommercialWork(error: unknown): ExistingCommercialWorkError | null {
  if (error instanceof ExistingCommercialWorkError) return error;
  if (!(error instanceof TransportError) || error.status !== 409) return null;
  const body = asRecord(error.body);
  const assemblyId = asString(body?.assemblyId);
  if (!assemblyId || (body?.error !== "assembly_exists" && body?.error !== "request_assembly_overlap")) return null;
  return new ExistingCommercialWorkError(assemblyId, readTransportReasons(error.body)[0] ?? "");
}

export async function createAssembly(requestId: string, kind: string, options: { alternative?: boolean } = {}): Promise<string> {
  let result: Record<string, unknown> | null;
  try {
    result = asRecord(await postJson("/api/assemblies", { requestId, kind, ...(options.alternative ? { commercialIntent: COMMERCIAL_ALTERNATIVE_INTENT } : {}) }));
  } catch (error) {
    throw existingCommercialWork(error) ?? error;
  }
  const id = asString(asRecord(result?.assembly)?.assemblyId);
  if (!id) throw new Error("unpresentable_assembly");
  return id;
}

export type AssemblyQuoteAcceptanceResult =
  | { ok: true; orderSnapshotId: string }
  | { ok: false; kind: "superseded"; reason: string; currentQuoteSnapshotId: string | null }
  | { ok: false; kind: "already_accepted"; reason: string; orderSnapshotId: string | null }
  | { ok: false; kind: "refused"; reason: string };

/** Accepts exactly the reviewed frozen snapshot; the server refuses any other identity before creating an order. */
export async function acceptAssemblyQuote(assemblyId: string, quoteSnapshotId: string): Promise<AssemblyQuoteAcceptanceResult> {
  let result: Awaited<ReturnType<typeof sendJson>>;
  try {
    result = await sendJson("POST", `/api/assemblies/${encodeURIComponent(assemblyId)}/accept`, { quoteSnapshotId });
  } catch {
    return { ok: false, kind: "refused", reason: "Serverul nu a putut fi contactat. Reîncarcă oferta și verifică starea ei înainte de a reîncerca." };
  }
  const body = asRecord(result.body);
  if (result.ok) {
    const orderSnapshotId = asString(asRecord(body?.order)?.orderSnapshotId);
    return orderSnapshotId
      ? { ok: true, orderSnapshotId }
      : { ok: false, kind: "refused", reason: "Răspunsul serverului nu confirmă comanda. Reîncarcă oferta." };
  }
  const reason = readTransportReasons(result.body)[0];
  switch (readTransportErrorCode(result.body)) {
    case "assembly_quote_superseded":
      return { ok: false, kind: "superseded", reason: reason ?? "Oferta nu mai este curentă.", currentQuoteSnapshotId: asString(body?.currentQuoteSnapshotId) };
    case "assembly_quote_already_accepted":
      return { ok: false, kind: "already_accepted", reason: reason ?? "Oferta este deja acceptată.", orderSnapshotId: asString(body?.orderSnapshotId) };
    default:
      return {
        ok: false,
        kind: "refused",
        reason: reason ?? (result.status === 403 ? "Doar proprietarul poate accepta oferta și crea comanda." : "Oferta nu a putut fi acceptată."),
      };
  }
}

export type RequestAssembly = { assemblyId: string; label: string; statusLabel: string };
export async function loadRequestAssemblies(requestId: string): Promise<RequestAssembly[]> {
  const body = asRecord(await getJson(`/api/assemblies?request=${encodeURIComponent(requestId)}`));
  if (!body || !Array.isArray(body.assemblies)) throw new Error("unpresentable_assemblies");
  return body.assemblies.flatMap(item => { const row = asRecord(item); return row && typeof row.assemblyId === "string" && typeof row.label === "string" ? [{ assemblyId: row.assemblyId, label: row.label, statusLabel: asString(row.statusLabel) ?? "" }] : []; });
}

export type ConfirmedAssemblyMember = {
  confirmedAt: string;
  inscription: string;
  customerPrice: { netPrice: number; vatAmount: number; grossPrice: number; currency: string; markupPercent: number; discountPercent: number; adjustmentAmount: number } | null;
  internalCost: { total: number; currency: string; completeness: string; completenessLabel: string } | null;
};
export type AssemblyMemberState = {
  values: Record<string, string>;
  confirmed: ConfirmedAssemblyMember | null;
  membersEditable: boolean;
};

export async function loadAssemblyMember(input: { assemblyId: string; role: string; customerId: string | null; requestId: string | null; productCode: string | null }): Promise<AssemblyMemberState> {
  const body = asRecord(await getJson(`/api/assemblies/${encodeURIComponent(input.assemblyId)}/members/${encodeURIComponent(input.role)}`));
  if (!body || body.customerId !== input.customerId || body.requestId !== input.requestId || body.productCode !== input.productCode) throw new Error("member_context_mismatch");
  const values = asRecord(body.values);
  return {
    values: Object.fromEntries(Object.entries(values ?? {}).flatMap(([key, value]) => typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [])),
    confirmed: presentConfirmedMember(body.confirmed),
    membersEditable: body.membersEditable !== false,
  };
}

function presentConfirmedMember(value: unknown): ConfirmedAssemblyMember | null {
  const row = asRecord(value);
  const confirmedAt = asString(row?.confirmedAt);
  if (!row || !confirmedAt) return null;
  const price = asRecord(row.customerPrice);
  const cost = asRecord(row.internalCost);
  const net = asNumber(price?.netPrice); const vat = asNumber(price?.vatAmount); const gross = asNumber(price?.grossPrice);
  const total = asNumber(cost?.total);
  return {
    confirmedAt,
    inscription: asString(row.inscription) ?? "",
    customerPrice: price && net !== null && vat !== null && gross !== null ? {
      netPrice: net, vatAmount: vat, grossPrice: gross, currency: asString(price.currency) ?? "EUR",
      markupPercent: asNumber(price.markupPercent) ?? 0, discountPercent: asNumber(price.discountPercent) ?? 0, adjustmentAmount: asNumber(price.adjustmentAmount) ?? 0,
    } : null,
    internalCost: cost && total !== null ? { total, currency: asString(cost.currency) ?? "EUR", completeness: asString(cost.completeness) ?? "", completenessLabel: asString(cost.completenessLabel) ?? "" } : null,
  };
}

export function presentSavedAssemblyMember(payload: unknown, assemblyId: string, role: string): ConfirmedAssemblyMember | null {
  const body = asRecord(payload);
  if (asRecord(body?.assembly)?.assemblyId !== assemblyId || body?.role !== role) return null;
  return presentConfirmedMember(body.confirmed);
}
