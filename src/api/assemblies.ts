import { getJson, postJson } from "./http";
import { asRecord, asString } from "../adapters/record";

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
export async function createAssembly(requestId: string, kind: string): Promise<string> {
  const result = asRecord(await postJson("/api/assemblies", { requestId, kind }));
  const id = asString(asRecord(result?.assembly)?.assemblyId);
  if (!id) throw new Error("unpresentable_assembly");
  return id;
}

export type RequestAssembly = { assemblyId: string; label: string; statusLabel: string };
export async function loadRequestAssemblies(requestId: string): Promise<RequestAssembly[]> {
  const body = asRecord(await getJson(`/api/assemblies?request=${encodeURIComponent(requestId)}`));
  if (!body || !Array.isArray(body.assemblies)) throw new Error("unpresentable_assemblies");
  return body.assemblies.flatMap(item => { const row = asRecord(item); return row && typeof row.assemblyId === "string" && typeof row.label === "string" ? [{ assemblyId: row.assemblyId, label: row.label, statusLabel: asString(row.statusLabel) ?? "" }] : []; });
}
export async function loadAssemblyMember(input: { assemblyId: string; role: string; customerId: string | null; requestId: string | null; productCode: string | null }): Promise<Record<string, string>> {
  const body = asRecord(await getJson(`/api/assemblies/${encodeURIComponent(input.assemblyId)}/members/${encodeURIComponent(input.role)}`));
  if (!body || body.customerId !== input.customerId || body.requestId !== input.requestId || body.productCode !== input.productCode) throw new Error("member_context_mismatch");
  const values = asRecord(body.values);
  return Object.fromEntries(Object.entries(values ?? {}).flatMap(([key, value]) => typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : []));
}
