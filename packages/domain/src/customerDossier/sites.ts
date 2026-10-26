import { isRecord, readOptionalNotes, readOptionalText, readRequiredText } from "./text.js";

/**
 * A customer site (sediu): a place where the customer receives work. It is not the billing
 * address (that lives in the commercial terms) and not HostContext (a supplied support panel).
 * A site is never deleted; INACTIVE keeps every historical link readable.
 */
export const CUSTOMER_SITE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CustomerSiteStatus = (typeof CUSTOMER_SITE_STATUSES)[number];

export const CUSTOMER_SITE_NAME_MAX_LENGTH = 80;
export const CUSTOMER_SITE_ADDRESS_MAX_LENGTH = 200;
export const CUSTOMER_SITE_CITY_MAX_LENGTH = 80;
export const CUSTOMER_SITE_CONTACT_MAX_LENGTH = 80;
export const CUSTOMER_SITE_PHONE_MAX_LENGTH = 40;
export const CUSTOMER_SITE_NOTES_MAX_LENGTH = 2000;

export type CustomerSite = {
  siteId: string;
  customerId: string;
  name: string;
  address: string | null;
  city: string | null;
  contactName: string | null;
  phone: string | null;
  accessNotes: string | null;
  status: CustomerSiteStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSiteFields = Pick<
  CustomerSite,
  "name" | "address" | "city" | "contactName" | "phone" | "accessNotes"
>;

export type CustomerSitePatch = Partial<CustomerSiteFields> & { status?: CustomerSiteStatus };

/** What a work or request remembers of its site at link time. */
export type CustomerSiteSnapshot = {
  siteId: string;
  name: string;
  address: string | null;
  city: string | null;
};

export const CUSTOMER_SITE_SUBJECT_KINDS = ["REQUEST", "JOB"] as const;
export type CustomerSiteSubjectKind = (typeof CUSTOMER_SITE_SUBJECT_KINDS)[number];

export function generateCustomerSiteId(): string {
  return `site:${crypto.randomUUID()}`;
}

export function customerSiteStatusLabel(status: CustomerSiteStatus): string {
  return status === "ACTIVE" ? "Activ" : "Inactiv";
}

export function snapshotCustomerSite(site: CustomerSite): CustomerSiteSnapshot {
  return { siteId: site.siteId, name: site.name, address: site.address, city: site.city };
}

export function customerSiteLine(site: Pick<CustomerSite, "name" | "address" | "city">): string {
  const place = [site.address, site.city].filter(Boolean).join(", ");
  return place ? `${site.name} · ${place}` : site.name;
}

export function readCustomerSiteFields(body: unknown): { ok: true; fields: CustomerSiteFields } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const name = readRequiredText(body.name, CUSTOMER_SITE_NAME_MAX_LENGTH);
  const address = readOptionalText(body.address, CUSTOMER_SITE_ADDRESS_MAX_LENGTH);
  const city = readOptionalText(body.city, CUSTOMER_SITE_CITY_MAX_LENGTH);
  const contactName = readOptionalText(body.contactName, CUSTOMER_SITE_CONTACT_MAX_LENGTH);
  const phone = readOptionalText(body.phone, CUSTOMER_SITE_PHONE_MAX_LENGTH);
  const accessNotes = readOptionalNotes(body.accessNotes, CUSTOMER_SITE_NOTES_MAX_LENGTH);
  if (!name.ok || !address.ok || !city.ok || !contactName.ok || !phone.ok || !accessNotes.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    fields: {
      name: name.value ?? "",
      address: address.value,
      city: city.value,
      contactName: contactName.value,
      phone: phone.value,
      accessNotes: accessNotes.value,
    },
  };
}

/** Only the keys present in the body change; `null` or "" clears an optional field. */
export function readCustomerSitePatch(body: unknown): { ok: true; patch: CustomerSitePatch } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const patch: CustomerSitePatch = {};
  if ("name" in body) {
    const name = readRequiredText(body.name, CUSTOMER_SITE_NAME_MAX_LENGTH);
    if (!name.ok) return { ok: false };
    patch.name = name.value ?? "";
  }
  const optional: Array<[keyof Omit<CustomerSiteFields, "name">, number, boolean]> = [
    ["address", CUSTOMER_SITE_ADDRESS_MAX_LENGTH, false],
    ["city", CUSTOMER_SITE_CITY_MAX_LENGTH, false],
    ["contactName", CUSTOMER_SITE_CONTACT_MAX_LENGTH, false],
    ["phone", CUSTOMER_SITE_PHONE_MAX_LENGTH, false],
    ["accessNotes", CUSTOMER_SITE_NOTES_MAX_LENGTH, true],
  ];
  for (const [key, max, notes] of optional) {
    if (!(key in body)) continue;
    const read = notes ? readOptionalNotes(body[key], max) : readOptionalText(body[key], max);
    if (!read.ok) return { ok: false };
    patch[key] = read.value;
  }
  if ("status" in body) {
    if (body.status !== "ACTIVE" && body.status !== "INACTIVE") return { ok: false };
    patch.status = body.status;
  }
  return Object.keys(patch).length ? { ok: true, patch } : { ok: false };
}

export function applyCustomerSitePatch(
  site: CustomerSite,
  patch: CustomerSitePatch,
  updatedAt: string,
): { site: CustomerSite; changed: boolean } {
  const next: CustomerSite = { ...site, ...patch };
  const changed = (Object.keys(patch) as Array<keyof CustomerSitePatch>).some((key) => site[key] !== next[key]);
  if (!changed) return { site, changed: false };
  return { site: { ...next, revision: site.revision + 1, updatedAt }, changed: true };
}
