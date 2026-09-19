import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("people skills API", () => {
  it("materializes the trusted roster and keeps CNC eligibility configurable", async () => {
    const runtime = createProductSystemRuntime();
    runtime.materializeTrustedWorkforce();
    const app = createApp({ productSystem: runtime });

    const listed = await readBody(await app.request("/api/people"));
    const people = listed.people as Array<JsonObject>;
    expect(people.map((item) => item.displayName).sort()).toEqual([
      "Andrei Goghi",
      "Calin Cimpean",
      "Chirila Cristian",
      "Costi Modelator",
      "Florin CNC",
      "Octavian Dumitru",
      "Putaru Sandu",
      "Vali Colantator",
    ]);
    expect(JSON.stringify(listed)).not.toMatch(/salary|pontaj|cost_lunar|8500/);

    const skills = (await readBody(await app.request("/api/people/skills"))).skills as Array<JsonObject>;
    expect(skills.some((item) => item.code === "SK_CNC_OPERATOR")).toBe(true);

    const before = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect((before.eligiblePeople as Array<JsonObject>).map((item) => item.displayName).sort()).toEqual([
      "Andrei Goghi",
      "Florin CNC",
    ]);

    const florin = people.find((item) => item.displayName === "Florin CNC");
    const andrei = people.find((item) => item.displayName === "Andrei Goghi");
    const chirila = people.find((item) => item.displayName === "Chirila Cristian");
    expect(florin && andrei && chirila).toBeTruthy();
    if (!florin || !andrei || !chirila) {
      return;
    }

    await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    const afterVacation = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (afterVacation.eligiblePeople as Array<JsonObject>).map((item) => item.displayName),
    ).toEqual(["Andrei Goghi"]);

    const created = await readBody(
      await app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Mihai Test CNC" }),
      }),
    );
    const mihai = created.person as JsonObject;
    const cnc = skills.find((item) => item.code === "SK_CNC_OPERATOR");
    expect(cnc).toBeTruthy();
    if (!cnc) {
      return;
    }
    await app.request(`/api/people/${mihai.personId}/skills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skillId: cnc.skillId }),
    });
    const withMihai = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (withMihai.eligiblePeople as Array<JsonObject>).map((item) => item.displayName).sort(),
    ).toEqual(["Andrei Goghi", "Mihai Test CNC"]);

    await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ availability: "AVAILABLE" }),
    });
    const restored = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (restored.eligiblePeople as Array<JsonObject>).map((item) => item.displayName).sort(),
    ).toEqual(["Andrei Goghi", "Florin CNC", "Mihai Test CNC"]);

    await app.request(`/api/people/${andrei.personId}/skills/${cnc.skillId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    const afterRemoval = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (afterRemoval.eligiblePeople as Array<JsonObject>).map((item) => item.displayName).sort(),
    ).toEqual(["Florin CNC", "Mihai Test CNC"]);

    const retired = await app.request(`/api/people/${mihai.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    expect(retired.status).toBe(200);
    const afterRetire = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (afterRetire.eligiblePeople as Array<JsonObject>).map((item) => item.displayName),
    ).toEqual(["Florin CNC"]);
    const stillThere = ((await readBody(await app.request("/api/people"))).people as Array<JsonObject>)
      .some((item) => item.personId === mihai.personId && item.status === "RETIRED");
    expect(stillThere).toBe(true);

    const chirilaElig = await readBody(
      await app.request("/api/people/eligibility?capabilityId=CNC_ROUTING"),
    );
    expect(
      (chirilaElig.eligiblePeople as Array<JsonObject>).some(
        (item) => item.displayName === "Chirila Cristian",
      ),
    ).toBe(false);

    const laser = await readBody(
      await app.request("/api/people/eligibility?capabilityId=LASER_CUTTING"),
    );
    expect(laser.eligiblePeople).toEqual([]);
    expect(
      (laser.diagnoses as Array<JsonObject>).some(
        (item) =>
          item.displayName === "Florin CNC" &&
          item.eligible === false &&
          item.reason === "CAPABILITY_UNMAPPED",
      ),
    ).toBe(true);
  });
});
