import { isRecord, readOptionalNotes, readOptionalText } from "./text.js";

/**
 * Commercial identification and agreed terms of a customer. Recorded facts only: they do not
 * feed the quote calculation, they do not rewrite accepted documents, and they are not
 * accounting, collections, invoicing or legal automation. Unknown values stay empty.
 * Every save appends a revision; the current terms are the latest revision.
 */
export const CUSTOMER_TERMS_CURRENCIES = ["RON", "EUR"] as const;
export type CustomerTermsCurrency = (typeof CUSTOMER_TERMS_CURRENCIES)[number];

export const CUSTOMER_TERMS_PAYMENT_DAYS_MAX = 365;

export type CustomerCommercialTermsFields = {
  legalName: string | null;
  registrationNumber: string | null;
  billingAddress: string | null;
  bankAccount: string | null;
  representativeName: string | null;
  representativeRole: string | null;
  commercialContactName: string | null;
  commercialContactPhone: string | null;
  commercialContactEmail: string | null;
  billingContactName: string | null;
  billingContactPhone: string | null;
  billingContactEmail: string | null;
  paymentTermDays: number | null;
  advancePercent: number | null;
  currency: CustomerTermsCurrency | null;
  referenceDocumentId: string | null;
  notes: string | null;
};

export type CustomerCommercialTerms = CustomerCommercialTermsFields & {
  customerId: string;
  revision: number;
  recordedAt: string;
  recordedByAccountId: string;
};

const TEXT_LIMITS: Record<
  Exclude<keyof CustomerCommercialTermsFields, "paymentTermDays" | "advancePercent" | "currency" | "notes">,
  number
> = {
  legalName: 160,
  registrationNumber: 40,
  billingAddress: 240,
  bankAccount: 40,
  representativeName: 80,
  representativeRole: 80,
  commercialContactName: 80,
  commercialContactPhone: 40,
  commercialContactEmail: 120,
  billingContactName: 80,
  billingContactPhone: 40,
  billingContactEmail: 120,
  referenceDocumentId: 120,
};

export const CUSTOMER_TERMS_NOTES_MAX_LENGTH = 2000;

export function emptyCustomerCommercialTerms(): CustomerCommercialTermsFields {
  return {
    legalName: null,
    registrationNumber: null,
    billingAddress: null,
    bankAccount: null,
    representativeName: null,
    representativeRole: null,
    commercialContactName: null,
    commercialContactPhone: null,
    commercialContactEmail: null,
    billingContactName: null,
    billingContactPhone: null,
    billingContactEmail: null,
    paymentTermDays: null,
    advancePercent: null,
    currency: null,
    referenceDocumentId: null,
    notes: null,
  };
}

function readOptionalNumber(value: unknown, min: number, max: number, integer: boolean): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return { ok: false };
  if (integer && !Number.isInteger(number)) return { ok: false };
  if (number < min || number > max) return { ok: false };
  return { ok: true, value: integer ? number : Math.round(number * 100) / 100 };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A partial update over the current terms: keys absent from the body keep their value,
 * `null`/"" clears. Returns the complete next field set.
 */
export function readCustomerCommercialTermsPatch(
  body: unknown,
  current: CustomerCommercialTermsFields,
): { ok: true; fields: CustomerCommercialTermsFields } | { ok: false; field: string } {
  if (!isRecord(body)) return { ok: false, field: "body" };
  const next: CustomerCommercialTermsFields = { ...current };
  for (const [key, max] of Object.entries(TEXT_LIMITS) as Array<[keyof typeof TEXT_LIMITS, number]>) {
    if (!(key in body)) continue;
    const read = readOptionalText(body[key], max);
    if (!read.ok) return { ok: false, field: key };
    if (read.value && key.endsWith("Email") && !EMAIL.test(read.value)) return { ok: false, field: key };
    next[key] = read.value;
  }
  if ("paymentTermDays" in body) {
    const read = readOptionalNumber(body.paymentTermDays, 0, CUSTOMER_TERMS_PAYMENT_DAYS_MAX, true);
    if (!read.ok) return { ok: false, field: "paymentTermDays" };
    next.paymentTermDays = read.value;
  }
  if ("advancePercent" in body) {
    const read = readOptionalNumber(body.advancePercent, 0, 100, false);
    if (!read.ok) return { ok: false, field: "advancePercent" };
    next.advancePercent = read.value;
  }
  if ("currency" in body) {
    const value = body.currency;
    if (value === null || value === "" || value === undefined) next.currency = null;
    else if (typeof value === "string" && (CUSTOMER_TERMS_CURRENCIES as readonly string[]).includes(value)) {
      next.currency = value as CustomerTermsCurrency;
    } else return { ok: false, field: "currency" };
  }
  if ("notes" in body) {
    const read = readOptionalNotes(body.notes, CUSTOMER_TERMS_NOTES_MAX_LENGTH);
    if (!read.ok) return { ok: false, field: "notes" };
    next.notes = read.value;
  }
  return { ok: true, fields: next };
}

export function customerCommercialTermsChanged(
  left: CustomerCommercialTermsFields,
  right: CustomerCommercialTermsFields,
): boolean {
  return (Object.keys(emptyCustomerCommercialTerms()) as Array<keyof CustomerCommercialTermsFields>).some(
    (key) => left[key] !== right[key],
  );
}

/** Labels for the operator; the order is the reading order of the form. */
export const CUSTOMER_COMMERCIAL_TERMS_LABELS: Record<keyof CustomerCommercialTermsFields, string> = {
  legalName: "Denumire legală",
  registrationNumber: "Nr. Registrul Comerțului",
  billingAddress: "Adresă de facturare",
  bankAccount: "Cont bancar (IBAN)",
  representativeName: "Reprezentant",
  representativeRole: "Calitatea reprezentantului",
  commercialContactName: "Contact comercial",
  commercialContactPhone: "Telefon contact comercial",
  commercialContactEmail: "Email contact comercial",
  billingContactName: "Contact facturare",
  billingContactPhone: "Telefon contact facturare",
  billingContactEmail: "Email contact facturare",
  paymentTermDays: "Termen de plată (zile)",
  advancePercent: "Avans convenit (%)",
  currency: "Monedă",
  referenceDocumentId: "Contract de referință",
  notes: "Observații",
};
