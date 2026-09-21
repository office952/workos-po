import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("people admin presentation", () => {
  it("adds owner presentation fields without exposing a PIN", async () => {
    const app = createApp();
    const empty = await readBody(await app.request("/api/people"));
    expect(empty.canEdit).toBe(true);
    expect(empty.people).toEqual([]);
    expect(Array.isArray(empty.skills)).toBe(true);

    const created = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Operator Test", roleLabel: "Operator" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await readBody(created);
    const person = createdBody.person as JsonObject;
    const registryPeople = (createdBody.registry as { people: Array<JsonObject> }).people;
    expect(registryPeople[0]?.operatorPinConfigured).toBe(false);
    expect(JSON.stringify(createdBody)).not.toMatch(/"pin"|salary|pontaj/);

    const pin = await app.request(`/api/people/${person.personId}/operator-pin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234", confirmPin: "1234" }),
    });
    expect(pin.status).toBe(200);
    expect(JSON.stringify(await readBody(pin))).not.toMatch(/1234/);

    const listed = await readBody(await app.request("/api/people"));
    const listedPeople = (listed.registry as { people: Array<JsonObject> }).people;
    expect(listedPeople[0]?.operatorPinConfigured).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(/1234|"pin":/);
  });

  it("lets members read people but not mutate them", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Org people");
    await addUser(fixture, {
      email: "owner-people@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-people@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const member = await loginCloud(
      fixture.app,
      "member-people@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const cookie = { cookie: member.cookie ?? "" };
    const memberGet = await readBody(await fixture.app.request("/api/people", { headers: cookie }));
    expect(memberGet.canEdit).toBe(false);

    const create = await fixture.app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookie },
      body: JSON.stringify({ displayName: "Operator Test" }),
    });
    expect(create.status).toBe(403);

    const owner = await loginCloud(
      fixture.app,
      "owner-people@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const ownerCookie = { cookie: owner.cookie ?? "" };
    const created = await readBody(
      await fixture.app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerCookie },
        body: JSON.stringify({ displayName: "Operator Test" }),
      }),
    );
    const person = created.person as JsonObject;
    const memberPatch = await fixture.app.request(`/api/people/${person.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...cookie },
      body: JSON.stringify({ roleLabel: "Secret" }),
    });
    expect(memberPatch.status).toBe(403);
    const memberPin = await fixture.app.request(`/api/people/${person.personId}/operator-pin`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...cookie },
      body: JSON.stringify({ pin: "1234", confirmPin: "1234" }),
    });
    expect(memberPin.status).toBe(403);
    const memberSkill = await fixture.app.request(`/api/people/${person.personId}/skills`, {
      method: "POST",
      headers: { "content-type": "application/json", ...cookie },
      body: JSON.stringify({ skillId: "skl:operational:cnc-operator" }),
    });
    expect(memberSkill.status).toBe(403);
    fixture.close();
  });
});
