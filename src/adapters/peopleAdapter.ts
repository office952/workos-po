import { asRecord, asString } from "./record";

export type PeopleAdminSkill = {
  skillId: string;
  displayLabel: string;
  status: "ACTIVE" | "RETIRED";
};

export type PeopleAdminPersonSkill = {
  skillId: string;
  displayLabel: string;
};

export type PeopleAdminPerson = {
  personId: string;
  displayName: string;
  roleLabel: string | null;
  status: "ACTIVE" | "RETIRED";
  statusLabel: string;
  availability: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
  availabilityLabel: string;
  unavailableReason: string | null;
  unavailableUntil: string | null;
  skills: PeopleAdminPersonSkill[];
  operatorPinConfigured: boolean;
};

export type PeopleAdminTransport = {
  canEdit: boolean;
  people: PeopleAdminPerson[];
  skills: PeopleAdminSkill[];
};

function presentSkill(value: unknown): PeopleAdminSkill | null {
  const row = asRecord(value);
  const skillId = asString(row?.skillId);
  const displayLabel = asString(row?.displayLabel);
  const status = row?.status === "RETIRED" ? "RETIRED" : row?.status === "ACTIVE" ? "ACTIVE" : null;
  if (!row || !skillId || !displayLabel || !status) {
    return null;
  }
  return { skillId, displayLabel, status };
}

function presentPersonSkill(value: unknown): PeopleAdminPersonSkill | null {
  const row = asRecord(value);
  const skillId = asString(row?.skillId);
  const displayLabel = asString(row?.displayLabel);
  if (!row || !skillId || !displayLabel) {
    return null;
  }
  return { skillId, displayLabel };
}

function presentPerson(value: unknown): PeopleAdminPerson | null {
  const row = asRecord(value);
  const personId = asString(row?.personId);
  const displayName = asString(row?.displayName);
  const status = row?.status === "RETIRED" ? "RETIRED" : row?.status === "ACTIVE" ? "ACTIVE" : null;
  const availability =
    row?.availability === "TEMPORARILY_UNAVAILABLE"
      ? "TEMPORARILY_UNAVAILABLE"
      : row?.availability === "AVAILABLE"
        ? "AVAILABLE"
        : null;
  if (!row || !personId || !displayName || !status || !availability) {
    return null;
  }
  const skills = Array.isArray(row.skills)
    ? row.skills.flatMap((item) => {
        const skill = presentPersonSkill(item);
        return skill ? [skill] : [];
      })
    : [];
  return {
    personId,
    displayName,
    roleLabel: asString(row.roleLabel),
    status,
    statusLabel: asString(row.statusLabel) ?? (status === "RETIRED" ? "Retras" : "Activ"),
    availability,
    availabilityLabel:
      asString(row.availabilityLabel) ??
      (availability === "TEMPORARILY_UNAVAILABLE" ? "Indisponibil temporar" : "Disponibil"),
    unavailableReason: asString(row.unavailableReason),
    unavailableUntil: asString(row.unavailableUntil),
    skills,
    operatorPinConfigured: row.operatorPinConfigured === true,
  };
}

export function presentPeopleAdmin(payload: unknown): PeopleAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const registry = asRecord(record.registry);
  const peopleSource = Array.isArray(registry?.people) ? registry.people : [];
  const people = peopleSource.flatMap((item) => {
    const person = presentPerson(item);
    return person ? [person] : [];
  });
  const skills = Array.isArray(record.skills)
    ? record.skills.flatMap((item) => {
        const skill = presentSkill(item);
        return skill ? [skill] : [];
      })
    : [];
  return {
    canEdit: record.canEdit === true,
    people,
    skills,
  };
}
