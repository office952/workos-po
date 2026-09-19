export const CUSTOMER_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_DISPLAY_NAME_MAX_LENGTH = 80;
export const CUSTOMER_CUI_MAX_LENGTH = 32;
export const CUSTOMER_CONTACT_NAME_MAX_LENGTH = 80;
export const CUSTOMER_PHONE_MAX_LENGTH = 40;
export const CUSTOMER_EMAIL_MAX_LENGTH = 120;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 200;
export const CUSTOMER_CITY_MAX_LENGTH = 80;
export const CUSTOMER_NOTES_MAX_LENGTH = 2000;

export type CustomerProfile = {
  cui: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
};

export type Customer = {
  customerId: string;
  displayName: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
} & CustomerProfile;

export const CUSTOMER_MUTATION_ERRORS = [
  "invalid_name",
  "invalid_profile",
  "not_found",
  "already_retired",
] as const;
export type CustomerMutationError = (typeof CUSTOMER_MUTATION_ERRORS)[number];

export type CustomerMutationResult =
  | { ok: true; customer: Customer; alreadyApplied: boolean }
  | { ok: false; error: CustomerMutationError };

export type FrozenCustomerIdentity = {
  customerId: string;
  displayName: string;
};

export type CustomerProfilePatch = {
  displayName?: string;
  cui?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
};

export function emptyCustomerProfile(): CustomerProfile {
  return {
    cui: null,
    contactName: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    notes: null,
  };
}

export function generateCustomerId(): string {
  return `cus:${crypto.randomUUID()}`;
}

export function createCustomer(
  displayName: string,
  options?: { customerId?: string; createdAt?: string; profile?: CustomerProfilePatch },
): CustomerMutationResult {
  const name = readDisplayName(displayName);
  if (!name) {
    return { ok: false, error: "invalid_name" };
  }
  const profile = readProfile(options?.profile ?? {});
  if (!profile) {
    return { ok: false, error: "invalid_profile" };
  }
  const createdAt = options?.createdAt ?? new Date().toISOString();
  return {
    ok: true,
    alreadyApplied: false,
    customer: {
      customerId: options?.customerId ?? generateCustomerId(),
      displayName: name,
      status: "ACTIVE",
      createdAt,
      updatedAt: createdAt,
      retiredAt: null,
      ...profile,
    },
  };
}

export function renameCustomer(
  customer: Customer,
  displayName: string,
  updatedAt = new Date().toISOString(),
): CustomerMutationResult {
  return updateCustomer(customer, { displayName }, updatedAt);
}

export function updateCustomer(
  customer: Customer,
  patch: CustomerProfilePatch,
  updatedAt = new Date().toISOString(),
): CustomerMutationResult {
  let next: Customer = customer;
  if (patch.displayName !== undefined) {
    const name = readDisplayName(patch.displayName);
    if (!name) {
      return { ok: false, error: "invalid_name" };
    }
    next = { ...next, displayName: name };
  }
  const profile = readProfile(patch, next);
  if (!profile) {
    return { ok: false, error: "invalid_profile" };
  }
  next = { ...next, ...profile };
  if (sameCurrentProfile(customer, next)) {
    return { ok: true, customer, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    customer: { ...next, updatedAt },
  };
}

export function retireCustomer(
  customer: Customer,
  retiredAt: string,
): CustomerMutationResult {
  if (customer.status === "RETIRED") {
    return { ok: true, customer, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    customer: {
      ...customer,
      status: "RETIRED",
      updatedAt: retiredAt,
      retiredAt,
    },
  };
}

export function isCustomerStatus(value: string): value is CustomerStatus {
  return value === "ACTIVE" || value === "RETIRED";
}

export function customerFromRow(
  customerId: string,
  displayName: string,
  status: string,
  createdAt: string,
  updatedAt: string,
  retiredAt: string | null,
  profile?: Partial<CustomerProfile> | null,
): Customer | null {
  if (
    !customerId ||
    !displayName ||
    !isCustomerStatus(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    customerId,
    displayName,
    status,
    createdAt,
    updatedAt,
    retiredAt,
    ...emptyCustomerProfile(),
    ...normalizeStoredProfile(profile),
  };
}

export function activeCustomers(customers: readonly Customer[]): Customer[] {
  return customers
    .filter((customer) => customer.status === "ACTIVE")
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ro"));
}

export function findCustomer(
  customers: readonly Customer[],
  customerId: string,
): Customer | undefined {
  return customers.find((customer) => customer.customerId === customerId);
}

export function customerStatusLabel(status: CustomerStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Activ";
    case "RETIRED":
      return "Retras";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function freezeCustomerIdentity(
  customer: Pick<Customer, "customerId" | "displayName">,
): FrozenCustomerIdentity | null {
  const customerId = customer.customerId.trim();
  const displayName = customer.displayName.trim();
  if (!customerId || !displayName) {
    return null;
  }
  return { customerId, displayName };
}

export function copyFrozenCustomerIdentity(
  customer: FrozenCustomerIdentity | undefined,
): FrozenCustomerIdentity | undefined {
  if (!customer) {
    return undefined;
  }
  return {
    customerId: customer.customerId,
    displayName: customer.displayName,
  };
}

function sameCurrentProfile(left: Customer, right: Customer): boolean {
  return (
    left.displayName === right.displayName &&
    left.cui === right.cui &&
    left.contactName === right.contactName &&
    left.phone === right.phone &&
    left.email === right.email &&
    left.address === right.address &&
    left.city === right.city &&
    left.notes === right.notes
  );
}

function readProfile(
  patch: CustomerProfilePatch,
  current: CustomerProfile = emptyCustomerProfile(),
): CustomerProfile | null {
  const cui = readOptional(patch.cui, current.cui, CUSTOMER_CUI_MAX_LENGTH);
  const contactName = readOptional(
    patch.contactName,
    current.contactName,
    CUSTOMER_CONTACT_NAME_MAX_LENGTH,
  );
  const phone = readOptional(patch.phone, current.phone, CUSTOMER_PHONE_MAX_LENGTH);
  const email = readOptional(patch.email, current.email, CUSTOMER_EMAIL_MAX_LENGTH);
  const address = readOptional(patch.address, current.address, CUSTOMER_ADDRESS_MAX_LENGTH);
  const city = readOptional(patch.city, current.city, CUSTOMER_CITY_MAX_LENGTH);
  const notes = readOptional(patch.notes, current.notes, CUSTOMER_NOTES_MAX_LENGTH);
  if (
    cui === false ||
    contactName === false ||
    phone === false ||
    email === false ||
    address === false ||
    city === false ||
    notes === false
  ) {
    return null;
  }
  return { cui, contactName, phone, email, address, city, notes };
}

function normalizeStoredProfile(profile?: Partial<CustomerProfile> | null): CustomerProfile {
  return {
    cui: emptyToNull(profile?.cui),
    contactName: emptyToNull(profile?.contactName),
    phone: emptyToNull(profile?.phone),
    email: emptyToNull(profile?.email),
    address: emptyToNull(profile?.address),
    city: emptyToNull(profile?.city),
    notes: emptyToNull(profile?.notes),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptional(
  value: string | null | undefined,
  current: string | null,
  maxLength: number,
): string | null | false {
  if (value === undefined) {
    return current;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return false;
  }
  return trimmed;
}

function readDisplayName(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > CUSTOMER_DISPLAY_NAME_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}
