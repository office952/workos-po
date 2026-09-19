import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("people API", () => {
  it("starts empty and creates a stable person identity", async () => {
    const app = createApp();
    const empty = await app.request("/api/people");
    expect(empty.status).toBe(200);
    expect((await readBody(empty)).people).toEqual([]);

    const created = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "  Maria Ionescu  " }),
    });
    expect(created.status).toBe(201);
    const createdBody = await readBody(created);
    const person = createdBody.person as JsonObject;
    expect(person.displayName).toBe("Maria Ionescu");
    expect(person.status).toBe("ACTIVE");
    expect(String(person.personId).startsWith("per:")).toBe(true);
    expect(person.personId).not.toBe("Maria Ionescu");

    const renamed = await app.request(`/api/people/${person.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Maria I." }),
    });
    const renamedPerson = (await readBody(renamed)).person as JsonObject;
    expect(renamedPerson.personId).toBe(person.personId);
    expect(renamedPerson.displayName).toBe("Maria I.");

    const retired = await app.request(`/api/people/${person.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    expect(retired.status).toBe(200);
    expect(((await readBody(retired)).person as JsonObject).status).toBe("RETIRED");

    const listed = await app.request("/api/people");
    const people = (await readBody(listed)).people as Array<JsonObject>;
    expect(people).toHaveLength(1);
    expect(people[0]?.personId).toBe(person.personId);
    expect(JSON.stringify(people)).not.toMatch(/salary|pontaj|shift|employeeNumber/);
  });

  it("rejects an empty name", async () => {
    const app = createApp();
    const created = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "   " }),
    });
    expect(created.status).toBe(400);
  });
});
