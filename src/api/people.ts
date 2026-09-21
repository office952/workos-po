import { getJson, sendJson } from "./http";

export function peopleAdminPath(): string {
  return "/api/people";
}

export function personPath(personId: string): string {
  return `/api/people/${encodeURIComponent(personId)}`;
}

export function personSkillPath(personId: string, skillId: string): string {
  return `${personPath(personId)}/skills/${encodeURIComponent(skillId)}`;
}

export async function fetchPeopleAdmin(): Promise<unknown> {
  return getJson(peopleAdminPath());
}

export async function createPerson(body: {
  displayName: string;
  roleLabel?: string | null;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", peopleAdminPath(), body);
}

export async function updatePerson(
  personId: string,
  body: {
    displayName?: string;
    roleLabel?: string | null;
    availability?: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
    unavailableReason?: string | null;
    unavailableUntil?: string | null;
    status?: "RETIRED";
  },
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PATCH", personPath(personId), body);
}

export async function assignPersonSkill(
  personId: string,
  skillId: string,
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", `${personPath(personId)}/skills`, { skillId });
}

export async function retirePersonSkill(
  personId: string,
  skillId: string,
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PATCH", personSkillPath(personId, skillId), { status: "RETIRED" });
}

export async function configurePersonOperatorPin(
  personId: string,
  pin: string,
  confirmPin: string,
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PUT", `${personPath(personId)}/operator-pin`, { pin, confirmPin });
}
