import type { CommercialTermsModel } from "../../../../adapters/customerDossierAdapter";
import type { CustomerTransport } from "../../../../api/types";

/** One person of the client with the ways to reach them; links only for values that exist. */
export type ClientContact = {
  key: "principal" | "commercial" | "billing";
  label: string;
  name: string | null;
  role: string | null;
  phone: { value: string; href: string } | null;
  email: { value: string; href: string } | null;
};

export type ClientContacts = {
  principal: ClientContact | null;
  /** Every contact that has at least a name, a phone or an e-mail, principal first. */
  all: ClientContact[];
  address: string | null;
  /** Fields of the client record that are still empty (named for the operator). */
  missing: string[];
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function phone(value: string | null) {
  return value ? { value, href: `tel:${value.replace(/\s+/g, "")}` } : null;
}

function email(value: string | null) {
  return value ? { value, href: `mailto:${value}` } : null;
}

function present(contact: ClientContact): boolean {
  return Boolean(contact.name || contact.phone || contact.email);
}

/**
 * N-020 · the header contacts (Figma 574:2203 / 579:5369): the principal contact comes from the
 * client record; the commercial and billing contacts come from the commercial terms when they are
 * recorded. The principal's role is shown only when the commercial terms name the same person as
 * the representative; nothing is guessed. The number on "Toate contactele" counts these people.
 */
export function clientContacts(customer: CustomerTransport | null, terms: CommercialTermsModel | null): ClientContacts {
  if (!customer) return { principal: null, all: [], address: null, missing: [] };
  const fields = terms?.fields ?? {};
  const representative = text(fields.representativeName);
  const principalName = text(customer.contactName);
  const principal: ClientContact = {
    key: "principal",
    label: "Contact principal",
    name: principalName,
    role: principalName && representative && representative === principalName ? text(fields.representativeRole) : null,
    phone: phone(text(customer.phone)),
    email: email(text(customer.email)),
  };
  const commercial: ClientContact = {
    key: "commercial",
    label: "Contact comercial",
    name: text(fields.commercialContactName),
    role: null,
    phone: phone(text(fields.commercialContactPhone)),
    email: email(text(fields.commercialContactEmail)),
  };
  const billing: ClientContact = {
    key: "billing",
    label: "Contact facturare",
    name: text(fields.billingContactName),
    role: null,
    phone: phone(text(fields.billingContactPhone)),
    email: email(text(fields.billingContactEmail)),
  };
  const address = [text(customer.address), text(customer.city)].filter(Boolean).join(", ") || null;
  const missing = [
    principalName ? null : "persoană de contact",
    principal.phone ? null : "telefon",
    principal.email ? null : "e-mail",
    text(customer.address) ? null : "adresă",
    text(customer.city) ? null : "localitate",
  ].filter((value): value is string => value !== null);
  return { principal: present(principal) ? principal : null, all: [principal, commercial, billing].filter(present), address, missing };
}
