export const PERSON_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const OPERATIONAL_AVAILABILITIES = [
  "AVAILABLE",
  "TEMPORARILY_UNAVAILABLE",
] as const;
export type OperationalAvailability = (typeof OPERATIONAL_AVAILABILITIES)[number];

export const PERSON_PROVENANCES = ["OWNER_CONFIRMED_LEGACY", "MANUAL"] as const;
export type PersonProvenance = (typeof PERSON_PROVENANCES)[number];

export const PERSON_DISPLAY_NAME_MAX_LENGTH = 80;
export const PERSON_ROLE_LABEL_MAX_LENGTH = 80;
export const PERSON_UNAVAILABLE_REASON_MAX_LENGTH = 80;

export type Person = {
  personId: string;
  displayName: string;
  status: PersonStatus;
  availability: OperationalAvailability;
  unavailableReason: string | null;
  unavailableUntil: string | null;
  roleLabel: string | null;
  provenance: PersonProvenance | null;
  createdAt: string;
  updatedAt: string;
  availabilityUpdatedAt: string;
  retiredAt: string | null;
};

export const PERSON_MUTATION_ERRORS = [
  "invalid_name",
  "invalid_availability",
  "invalid_profile",
  "not_found",
  "already_retired",
  "has_active_task",
] as const;
export type PersonMutationError = (typeof PERSON_MUTATION_ERRORS)[number];

export type PersonMutationResult =
  | { ok: true; person: Person; alreadyApplied: boolean }
  | { ok: false; error: PersonMutationError };

export type PersonProfilePatch = {
  displayName?: string;
  roleLabel?: string | null;
  availability?: OperationalAvailability;
  unavailableReason?: string | null;
  unavailableUntil?: string | null;
};

export function generatePersonId(): string {
  return `per:${crypto.randomUUID()}`;
}

export function createPerson(
  displayName: string,
  options?: {
    personId?: string;
    createdAt?: string;
    roleLabel?: string | null;
    provenance?: PersonProvenance | null;
  },
): PersonMutationResult {
  const name = readDisplayName(displayName);
  if (!name) {
    return { ok: false, error: "invalid_name" };
  }
  const role = readOptionalText(options?.roleLabel, PERSON_ROLE_LABEL_MAX_LENGTH);
  if (role === false) {
    return { ok: false, error: "invalid_profile" };
  }
  const createdAt = options?.createdAt ?? new Date().toISOString();
  return {
    ok: true,
    alreadyApplied: false,
    person: {
      personId: options?.personId ?? generatePersonId(),
      displayName: name,
      status: "ACTIVE",
      availability: "AVAILABLE",
      unavailableReason: null,
      unavailableUntil: null,
      roleLabel: role,
      provenance: options?.provenance ?? null,
      createdAt,
      updatedAt: createdAt,
      availabilityUpdatedAt: createdAt,
      retiredAt: null,
    },
  };
}

export function renamePerson(
  person: Person,
  displayName: string,
  updatedAt = new Date().toISOString(),
): PersonMutationResult {
  const name = readDisplayName(displayName);
  if (!name) {
    return { ok: false, error: "invalid_name" };
  }
  if (person.displayName === name) {
    return { ok: true, person, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    person: {
      ...person,
      displayName: name,
      updatedAt,
    },
  };
}

export function updatePersonProfile(
  person: Person,
  patch: PersonProfilePatch,
  updatedAt = new Date().toISOString(),
): PersonMutationResult {
  let next = person;
  if (patch.displayName !== undefined) {
    const renamed = renamePerson(next, patch.displayName, updatedAt);
    if (!renamed.ok) {
      return renamed;
    }
    next = renamed.person;
  }
  if (patch.roleLabel !== undefined) {
    const role = readOptionalText(patch.roleLabel, PERSON_ROLE_LABEL_MAX_LENGTH);
    if (role === false) {
      return { ok: false, error: "invalid_profile" };
    }
    next = { ...next, roleLabel: role, updatedAt };
  }
  if (patch.availability !== undefined) {
    const availability = setPersonAvailability(next, {
      availability: patch.availability,
      reason: patch.unavailableReason,
      until: patch.unavailableUntil,
      updatedAt,
    });
    if (!availability.ok) {
      return availability;
    }
    next = availability.person;
  } else if (
    patch.unavailableReason !== undefined ||
    patch.unavailableUntil !== undefined
  ) {
    const availability = setPersonAvailability(next, {
      availability: next.availability,
      reason: patch.unavailableReason,
      until: patch.unavailableUntil,
      updatedAt,
    });
    if (!availability.ok) {
      return availability;
    }
    next = availability.person;
  }
  return {
    ok: true,
    alreadyApplied: next === person,
    person: next,
  };
}

export function setPersonAvailability(
  person: Person,
  input: {
    availability: OperationalAvailability;
    reason?: string | null;
    until?: string | null;
    updatedAt?: string;
  },
): PersonMutationResult {
  if (!isOperationalAvailability(input.availability)) {
    return { ok: false, error: "invalid_availability" };
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (input.availability === "AVAILABLE") {
    const next: Person = {
      ...person,
      availability: "AVAILABLE",
      unavailableReason: null,
      unavailableUntil: null,
      updatedAt,
      availabilityUpdatedAt: updatedAt,
    };
    if (
      person.availability === "AVAILABLE" &&
      person.unavailableReason === null &&
      person.unavailableUntil === null
    ) {
      return { ok: true, person, alreadyApplied: true };
    }
    return { ok: true, alreadyApplied: false, person: next };
  }
  const reason = readOptionalText(input.reason, PERSON_UNAVAILABLE_REASON_MAX_LENGTH);
  if (reason === false) {
    return { ok: false, error: "invalid_profile" };
  }
  const until = readOptionalText(input.until, 40);
  if (until === false) {
    return { ok: false, error: "invalid_profile" };
  }
  if (
    person.availability === "TEMPORARILY_UNAVAILABLE" &&
    person.unavailableReason === reason &&
    person.unavailableUntil === until
  ) {
    return { ok: true, person, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    person: {
      ...person,
      availability: "TEMPORARILY_UNAVAILABLE",
      unavailableReason: reason,
      unavailableUntil: until,
      updatedAt,
      availabilityUpdatedAt: updatedAt,
    },
  };
}

export function retirePerson(
  person: Person,
  retiredAt: string,
  options?: { hasActiveTask?: boolean },
): PersonMutationResult {
  if (options?.hasActiveTask) {
    return { ok: false, error: "has_active_task" };
  }
  if (person.status === "RETIRED") {
    return { ok: true, person, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    person: {
      ...person,
      status: "RETIRED",
      retiredAt,
      updatedAt: retiredAt,
    },
  };
}

export function isPersonStatus(value: string): value is PersonStatus {
  return value === "ACTIVE" || value === "RETIRED";
}

export function isOperationalAvailability(
  value: string,
): value is OperationalAvailability {
  return value === "AVAILABLE" || value === "TEMPORARILY_UNAVAILABLE";
}

export function isPersonProvenance(value: string): value is PersonProvenance {
  return value === "OWNER_CONFIRMED_LEGACY" || value === "MANUAL";
}

export function personFromRow(row: {
  personId: string;
  displayName: string;
  status: string;
  createdAt: string;
  retiredAt: string | null;
  availability?: string | null;
  unavailableReason?: string | null;
  unavailableUntil?: string | null;
  roleLabel?: string | null;
  provenance?: string | null;
  updatedAt?: string | null;
  availabilityUpdatedAt?: string | null;
}): Person | null {
  if (
    !row.personId ||
    !row.displayName ||
    !isPersonStatus(row.status) ||
    !row.createdAt
  ) {
    return null;
  }
  const availability = row.availability ?? "AVAILABLE";
  if (!isOperationalAvailability(availability)) {
    return null;
  }
  const provenance = row.provenance ?? null;
  if (provenance !== null && !isPersonProvenance(provenance)) {
    return null;
  }
  return {
    personId: row.personId,
    displayName: row.displayName,
    status: row.status,
    availability,
    unavailableReason: row.unavailableReason ?? null,
    unavailableUntil: row.unavailableUntil ?? null,
    roleLabel: row.roleLabel ?? null,
    provenance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
    availabilityUpdatedAt: row.availabilityUpdatedAt ?? row.createdAt,
    retiredAt: row.retiredAt,
  };
}

export function activePeople(people: readonly Person[]): Person[] {
  return people
    .filter((person) => person.status === "ACTIVE")
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ro"));
}

export function findPerson(
  people: readonly Person[],
  personId: string,
): Person | undefined {
  return people.find((person) => person.personId === personId);
}

export function personStatusLabel(status: PersonStatus): string {
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

export function personAvailabilityLabel(
  availability: OperationalAvailability,
): string {
  switch (availability) {
    case "AVAILABLE":
      return "Disponibil";
    case "TEMPORARILY_UNAVAILABLE":
      return "Indisponibil temporar";
    default: {
      const _exhaustive: never = availability;
      return _exhaustive;
    }
  }
}

function readDisplayName(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > PERSON_DISPLAY_NAME_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

function readOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null | false {
  if (value === undefined || value === null) {
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
