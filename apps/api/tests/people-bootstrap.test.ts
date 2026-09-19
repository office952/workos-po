import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { PEOPLE_TRUSTED_WORKFORCE_MARKER } from "../src/people/store.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-people-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

function cncNames(runtime: ReturnType<typeof createProductSystemRuntime>) {
  return runtime
    .readEligibility("CNC_ROUTING")
    .eligiblePeople.map((item) => item.displayName)
    .sort();
}

describe("trusted workforce one-time bootstrap", () => {
  it("materializes once and does not reassert operator decisions after restart", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    first.materializeTrustedWorkforce();
    expect(cncNames(first)).toEqual(["Andrei Goghi", "Florin CNC"]);

    const andrei = first.listPeople().find((item) => item.displayName === "Andrei Goghi");
    const florin = first.listPeople().find((item) => item.displayName === "Florin CNC");
    const chirila = first.listPeople().find((item) => item.displayName === "Chirila Cristian");
    const cnc = first.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
    expect(andrei && florin && chirila && cnc).toBeTruthy();
    if (!andrei || !florin || !chirila || !cnc) {
      return;
    }

    expect(first.retirePersonSkill(andrei.personId, cnc.skillId).ok).toBe(true);
    expect(
      first.updatePerson(florin.personId, {
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }).ok,
    ).toBe(true);
    const mihai = first.createPerson("Mihai Restart");
    expect(mihai.ok).toBe(true);
    if (!mihai.ok) {
      return;
    }
    expect(first.assignPersonSkill(mihai.person.personId, cnc.skillId).ok).toBe(true);
    expect(first.retirePerson(chirila.personId).ok).toBe(true);
    expect(cncNames(first)).toEqual(["Mihai Restart"]);
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    second.materializeTrustedWorkforce();
    expect(cncNames(second)).toEqual(["Mihai Restart"]);
    const florinAfter = second.listPeople().find((item) => item.displayName === "Florin CNC");
    const chirilaAfter = second.listPeople().find((item) => item.displayName === "Chirila Cristian");
    const mihaiAfter = second.listPeople().find((item) => item.displayName === "Mihai Restart");
    expect(florinAfter?.availability).toBe("TEMPORARILY_UNAVAILABLE");
    expect(florinAfter?.status).toBe("ACTIVE");
    expect(chirilaAfter?.status).toBe("RETIRED");
    expect(mihaiAfter?.status).toBe("ACTIVE");
    const mihaiSkills = second
      .listPeopleRegistry()
      .people.find((item) => item.personId === mihai.person.personId)
      ?.skills.map((item) => item.code);
    expect(mihaiSkills).toContain("SK_CNC_OPERATOR");
    const andreiSkills = second
      .listPeopleRegistry()
      .people.find((item) => item.displayName === "Andrei Goghi")
      ?.skills.map((item) => item.code);
    expect(andreiSkills).not.toContain("SK_CNC_OPERATOR");
    second.close();
  });

  it("marks an already-materialized DB applied without restoring retired skills", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    first.materializeTrustedWorkforce();
    const andrei = first.listPeople().find((item) => item.displayName === "Andrei Goghi");
    const cnc = first.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
    expect(andrei && cnc).toBeTruthy();
    if (!andrei || !cnc) {
      return;
    }
    expect(first.retirePersonSkill(andrei.personId, cnc.skillId).ok).toBe(true);
    first.close();

    const db = openSqliteDatabase(sqlitePath);
    db.prepare("DELETE FROM runtime_bootstrap_markers WHERE marker_id = ?").run(
      PEOPLE_TRUSTED_WORKFORCE_MARKER,
    );
    db.close();

    const second = createProductSystemRuntime(sqlitePath);
    second.materializeTrustedWorkforce();
    expect(cncNames(second)).toEqual(["Florin CNC"]);
    const andreiSkills = second
      .listPeopleRegistry()
      .people.find((item) => item.displayName === "Andrei Goghi")
      ?.skills.map((item) => item.code);
    expect(andreiSkills).not.toContain("SK_CNC_OPERATOR");
    second.close();
  });

  it("does not write person-skill rows after the marker is applied", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    first.materializeTrustedWorkforce();
    const db = openSqliteDatabase(sqlitePath);
    const before = (
      db.prepare("SELECT COUNT(*) AS count FROM person_skill_assignments").get() as {
        count: number;
      }
    ).count;
    first.materializeTrustedWorkforce();
    const after = (
      db.prepare("SELECT COUNT(*) AS count FROM person_skill_assignments").get() as {
        count: number;
      }
    ).count;
    expect(after).toBe(before);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM runtime_bootstrap_markers WHERE marker_id = ?")
          .get(PEOPLE_TRUSTED_WORKFORCE_MARKER) as { count: number }
      ).count,
    ).toBe(1);
    db.close();
    first.close();
  });
});
