import type { CommercialTermsModel, CustomerDossierModel } from "../../../adapters/customerDossierAdapter";
import type { CustomerTransport } from "../../../api/types";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { asRecord } from "../../../adapters/record";
import { draftConflictRows, resumeDraftOnCurrent, type DraftConflictRow } from "../dossier/draftConflict";
import { clientListHref, EMPTY_LIST_CONTEXT } from "../dossier/listContext";

/**
 * N-020 etapa 8 · Date comerciale (Figma 720:185 · 720:651 / 734:185 · 721:412 · 754:26442 →
 * 754:26646 → 754:26844 → 754:27045 → 767:185; telefon 726:412 → 783:31001 → 755:241 → 755:297 →
 * 783:31053 → 783:31110 · 783:31352). The 17 fields, their labels, the currencies, the revision,
 * `canEdit` and the validation are the server's: this file only says where each field sits on the
 * page and how a recorded value reads. CUI and the principal contact come from the client record
 * and are not part of the commercial terms; the billing address is not a site.
 */

export type TermsDraft = Record<string, string>;
export type TermsVersion = { revision: number; recordedAt: string | null; fields: Record<string, string | number | null> };

/** How a field is typed in; a hint under it when the design names one. */
export type FormField = { key: string; input?: "number" | "currency" | "document" | "notes" | "email" | "tel"; hint?: string };

/** The form (734:185): four panels, one row of fields per line. */
export const FORM_GROUPS: Array<{ title: string; rows: FormField[][] }> = [
  { title: "Identificare firmă", rows: [[{ key: "legalName" }, { key: "registrationNumber" }], [{ key: "billingAddress" }, { key: "bankAccount" }]] },
  { title: "Reprezentant", rows: [[{ key: "representativeName" }, { key: "representativeRole" }]] },
  {
    title: "Contacte",
    rows: [
      [{ key: "commercialContactName" }, { key: "commercialContactPhone", input: "tel" }, { key: "commercialContactEmail", input: "email" }],
      [{ key: "billingContactName" }, { key: "billingContactPhone", input: "tel" }, { key: "billingContactEmail", input: "email" }],
    ],
  },
  {
    title: "Condiții comerciale",
    rows: [
      [
        { key: "paymentTermDays", input: "number", hint: "Număr întreg, 0–365" },
        { key: "advancePercent", input: "number", hint: "0–100" },
        { key: "currency", input: "currency" },
      ],
      [{ key: "referenceDocumentId", input: "document", hint: "Din contractele și actele adiționale ale clientului" }],
      [{ key: "notes", input: "notes" }],
    ],
  },
];

/** The reading order of the form, for messages and the comparison. */
export const FORM_ORDER = FORM_GROUPS.flatMap((group) => group.rows.flat().map((field) => field.key));

/** Where the value already says the unit, the read view drops it from the label. */
const READ_LABELS: Record<string, string> = { paymentTermDays: "Termen de plată", advancePercent: "Avans convenit" };

export function readLabel(model: Pick<CommercialTermsModel, "labels">, key: string): string {
  return READ_LABELS[key] ?? model.labels[key] ?? key;
}

/** How a recorded value reads; the value itself is the one the server keeps. */
export function readValue(key: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (key === "paymentTermDays") {
    const days = Number(value);
    if (!Number.isFinite(days)) return String(value);
    if (days === 1) return "1 zi";
    return days % 100 >= 1 && days % 100 <= 19 ? `${days} zile` : `${days} de zile`;
  }
  if (key === "advancePercent") return `${value}%`;
  return String(value);
}

export function termsDraft(fields: Record<string, string | number | null>): TermsDraft {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === null ? "" : String(value)]));
}

/** The PUT body: every field as typed (an empty one clears it) and the revision the draft starts from. */
export function termsPayload(draft: TermsDraft, revision: number): Record<string, unknown> {
  const payload: Record<string, unknown> = { expectedRevision: revision };
  for (const [key, value] of Object.entries(draft)) payload[key] = value.trim() === "" ? null : value.trim();
  return payload;
}

export function sameDraft(left: TermsDraft, right: TermsDraft): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (left[key] ?? "") === (right[key] ?? ""));
}

/** The fields of the server, in the reading order of the form (any field it adds goes last). */
export function termsFields(model: Pick<CommercialTermsModel, "fields">): string[] {
  const keys = Object.keys(model.fields);
  return [...FORM_ORDER.filter((key) => keys.includes(key)), ...keys.filter((key) => !FORM_ORDER.includes(key))];
}

export type TermsConflictRow = DraftConflictRow<string>;

/** The fields both people changed come first (754:26844), then the form's order. */
export function termsConflictRows(fields: string[], base: TermsDraft, draft: TermsDraft, current: TermsDraft): TermsConflictRow[] {
  const both = (row: TermsConflictRow) => (row.mineChanged && row.currentChanged ? 0 : 1);
  return draftConflictRows(fields, base, draft, current).sort((left, right) => both(left) - both(right));
}

export function resumeTermsOnCurrent(fields: string[], base: TermsDraft, draft: TermsDraft, current: TermsDraft) {
  return resumeDraftOnCurrent(fields, base, draft, current);
}

/** What the server said about a refused save. */
export type SaveFailure =
  | { kind: "conflict"; current: unknown }
  | { kind: "invalid"; field: string }
  | { kind: "error" };

export function readSaveFailure(caught: unknown): SaveFailure {
  if (caught instanceof TransportError) {
    const code = readTransportErrorCode(caught.body);
    const body = asRecord(caught.body);
    if (caught.status === 409 && code === "stale_revision") return { kind: "conflict", current: body?.terms ?? null };
    if (caught.status === 400 && code === "invalid_payload" && typeof body?.field === "string") return { kind: "invalid", field: body.field };
    if (code === "reference_document_not_of_customer") return { kind: "invalid", field: "referenceDocumentId" };
  }
  return { kind: "error" };
}

/** The message under a field the server refused (721:412); the rule itself stays the server's. */
export function fieldError(key: string): string {
  if (key.endsWith("Email")) return "Adresa de email nu este completă (ex. nume@firma.ro).";
  if (key === "paymentTermDays") return "Scrie un număr întreg de zile, de la 0 la 365.";
  if (key === "advancePercent") return "Scrie un procent de la 0 la 100.";
  if (key === "currency") return "Alege o monedă din listă.";
  if (key === "referenceDocumentId") return "Alege un contract sau un act adițional al acestui client.";
  return "Textul este prea lung pentru acest câmp.";
}

/** One line of the header: the revision and when it was saved, only when they exist. */
export function versionLine(version: { revision: number; recordedAt: string | null }, format: (value: string) => string | null, older: number, editing: boolean): string {
  if (version.revision <= 0) return editing ? "nicio versiune salvată · în completare" : "nicio versiune salvată";
  return [`revizia ${version.revision}`, version.recordedAt ? format(version.recordedAt) : null, editing ? "în modificare" : null, !editing && older > 0 ? `${older} ${older === 1 ? "versiune anterioară păstrată" : "versiuni anterioare păstrate"}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function hasAnyValue(fields: Record<string, string | number | null>): boolean {
  return Object.values(fields).some((value) => value !== null && value !== "");
}

/** The principal contact and the CUI, from the client record (not from the commercial terms). */
export function clientRecordFacts(customer: CustomerTransport | null) {
  const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    cui: text(customer?.cui),
    contactName: text(customer?.contactName),
    phone: text(customer?.phone),
    email: text(customer?.email),
  };
}

const CONTRACT_KINDS = "CONTRACT,ADDENDUM";

/** The contracts and addenda of the client, and the Documente list that shows exactly them. */
export function contractDocuments(customerId: string, dossier: CustomerDossierModel | null) {
  const documents = dossier?.documents ?? [];
  const contracts = documents.filter((document) => document.kind === "CONTRACT");
  const addenda = documents.filter((document) => document.kind === "ADDENDUM");
  const parts = [
    contracts.length ? `${contracts.length} ${contracts.length === 1 ? "contract" : "contracte"}` : null,
    addenda.length ? `${addenda.length} ${addenda.length === 1 ? "act adițional" : "acte adiționale"}` : null,
  ].filter(Boolean);
  return {
    choices: [...contracts, ...addenda],
    summary: parts.length
      ? `Contractele și actele adiționale ale clientului sunt în Documente: ${parts.join(" · ")}.`
      : "Niciun contract sau act adițional încărcat. Se încarcă din Documente.",
    // Always both kinds, even when there is none yet: Documente opens on the contractual documents
    // (zero results, with the filter in view), never on every document of the client.
    href: clientListHref(customerId, "documente", { ...EMPTY_LIST_CONTEXT, kind: CONTRACT_KINDS }),
  };
}

/** "Termen de plată 45 de zile (valoarea ta) · Telefon contact facturare 0700 900 119 (din revizia 2)" */
export function savedDetail(model: Pick<CommercialTermsModel, "labels">, version: TermsVersion, kept: string[], taken: Record<string, number>): string {
  const shown = (key: string) => {
    const value = readValue(key, version.fields[key]) ?? "necompletat";
    return value.length > 60 ? `${value.slice(0, 57).trimEnd()}…` : value;
  };
  const part = (key: string, note: string) => `${readLabel(model, key)} ${shown(key)} (${note})`;
  return [...kept.map((key) => part(key, "valoarea ta")), ...Object.entries(taken).map(([key, revision]) => part(key, `din revizia ${revision}`))].join(" · ");
}
