import { getJson, postJson } from "./http";

export async function createPerson(displayName: string): Promise<unknown> {
  return postJson("/api/people", { displayName });
}

export async function fetchPeopleSkills(): Promise<unknown> {
  return getJson("/api/people/skills");
}

export async function assignPersonSkill(
  personId: string,
  skillId: string,
): Promise<unknown> {
  return postJson(`/api/people/${encodeURIComponent(personId)}/skills`, { skillId });
}
