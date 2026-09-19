import { afterEach, describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  MCH_CNC_4020_ID,
  MCH_CNC_CANT_LITERE_ID,
} from "@workos-final/domain";
import { configureOrganizationProviders } from "../src/cloud/configureOrganizationProviders.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { LETTERS_TWO_MACHINE_PROVIDER_CONFIG } from "./fixtures/lettersTwoMachineProviderConfig.js";
import {
  backCncTaskId,
  faceCncTaskId,
  materializeCanonicalLettersPlan,
  taskIdForProcess,
} from "./letters-plan-fixture.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("organization-scoped provider configuration", () => {
  it("keeps NEW_ORGANIZATION empty until explicit apply and survives reopen", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Firma Noua", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const login = await loginCloud(
        fixture.app,
        "owner@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = { cookie: login.cookie ?? "" };

      const before = (await (
        await fixture.app.request("/api/workcenters", { headers })
      ).json()) as { machines: unknown[]; workcenters: unknown[] };
      expect(before.machines).toEqual([]);
      expect(before.workcenters).toEqual([]);

      const dryRun = await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        config: LETTERS_TWO_MACHINE_PROVIDER_CONFIG,
        mode: "dry-run",
      });
      expect(dryRun.ok).toBe(true);
      if (!dryRun.ok) {
        return;
      }
      expect(dryRun.executed).toBe(false);
      const stillEmpty = (await (
        await fixture.app.request("/api/workcenters", { headers })
      ).json()) as { machines: unknown[] };
      expect(stillEmpty.machines).toEqual([]);

      const executed = await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        config: LETTERS_TWO_MACHINE_PROVIDER_CONFIG,
        mode: "execute",
      });
      expect(executed.ok).toBe(true);
      if (!executed.ok) {
        return;
      }
      expect(executed.workcenterCount).toBe(2);
      expect(executed.machineCount).toBe(2);

      const after = (await (
        await fixture.app.request("/api/workcenters", { headers })
      ).json()) as {
        machines: Array<{ id: string; label: string }>;
        workcenters: Array<{ id: string }>;
      };
      expect(after.workcenters).toHaveLength(2);
      expect(after.machines.map((item) => item.id).sort()).toEqual([
        MCH_CNC_4020_ID,
        MCH_CNC_CANT_LITERE_ID,
      ]);
      expect(after.machines.find((item) => item.id === MCH_CNC_4020_ID)?.label).toBe(
        "CNC Router 4050 x 2050",
      );

      fixture.registry.evict(org.organization.organizationId);
      const reopened = (await (
        await fixture.app.request("/api/workcenters", { headers })
      ).json()) as { machines: Array<{ id: string }> };
      expect(reopened.machines).toHaveLength(2);

      const again = await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        config: LETTERS_TWO_MACHINE_PROVIDER_CONFIG,
        mode: "execute",
      });
      expect(again.ok && again.alreadyApplied).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it("isolates configured org A from empty org B", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await addOrganization(fixture, "Org A", "NEW_ORGANIZATION");
      const orgB = await addOrganization(fixture, "Org B", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "a@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "b@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      const applied = await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: orgA.organization.organizationId,
        config: LETTERS_TWO_MACHINE_PROVIDER_CONFIG,
        mode: "execute",
      });
      expect(applied.ok).toBe(true);

      const loginA = await loginCloud(
        fixture.app,
        "a@providers.test",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      const loginB = await loginCloud(
        fixture.app,
        "b@providers.test",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const workcentersA = (await (
        await fixture.app.request("/api/workcenters", { headers: { cookie: loginA.cookie ?? "" } })
      ).json()) as { machines: Array<{ id: string }> };
      const workcentersB = (await (
        await fixture.app.request("/api/workcenters", { headers: { cookie: loginB.cookie ?? "" } })
      ).json()) as { machines: Array<{ id: string }> };
      expect(workcentersA.machines).toHaveLength(2);
      expect(workcentersB.machines).toHaveLength(0);

      const planB = materializeCanonicalLettersPlan("ORG-B");
      fixture.registry.getOrOpen(orgB.plane, fixture.cloudRoot).persistExecutionPlan(planB);
      const assignB = await fixture.app.request(
        `/api/execution-tasks/${backCncTaskId(planB)}/provider`,
        {
          method: "POST",
          headers: {
            cookie: loginB.cookie ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        },
      );
      expect(assignB.status).toBe(422);
      expect(((await assignB.json()) as { error: string }).error).toBe("ineligible_provider");
    } finally {
      fixture.close();
    }
  });

  it("rejects mutating a provider after it is assigned on a task", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org Lock", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "lock@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        config: LETTERS_TWO_MACHINE_PROVIDER_CONFIG,
        mode: "execute",
      });
      const login = await loginCloud(
        fixture.app,
        "lock@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const plan = materializeCanonicalLettersPlan("LOCK");
      fixture.registry.getOrOpen(org.plane, fixture.cloudRoot).persistExecutionPlan(plan);
      const assigned = await fixture.app.request(
        `/api/execution-tasks/${faceCncTaskId(plan)}/provider`,
        {
          method: "POST",
          headers: {
            cookie: login.cookie ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        },
      );
      expect(assigned.status).toBe(200);

      const removed = await configureOrganizationProviders({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        config: {
          workcenters: LETTERS_TWO_MACHINE_PROVIDER_CONFIG.workcenters,
          machines: LETTERS_TWO_MACHINE_PROVIDER_CONFIG.machines.filter(
            (item) => item.id !== MCH_CNC_4020_ID,
          ),
        },
        mode: "execute",
      });
      expect(removed.ok).toBe(false);
      if (removed.ok) {
        return;
      }
      expect(removed.error).toBe("provider_in_use");
    } finally {
      fixture.close();
    }
  });
});

describe("Cloud eligibility fail-closed", () => {
  it("blocks Claim/Start when capability mappings are missing", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org Skills", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "skills@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const login = await loginCloud(
        fixture.app,
        "skills@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const created = await fixture.app.request("/api/people", {
        method: "POST",
        headers: {
          cookie: login.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ displayName: "Ana Noua" }),
      });
      expect(created.status).toBe(201);
      const person = ((await created.json()) as { person: { personId: string } }).person;
      const pin = await fixture.app.request(`/api/people/${person.personId}/operator-pin`, {
        method: "PUT",
        headers: {
          cookie: login.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pin: "246810", confirmPin: "246810" }),
      });
      expect(pin.ok).toBe(true);
      const identified = await fixture.app.request("/api/operator-session", {
        method: "POST",
        headers: {
          cookie: login.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ personId: person.personId, pin: "246810" }),
      });
      expect(identified.ok).toBe(true);
      const operatorCookie = identified.headers.getSetCookie()[0]?.split(";", 1)[0] ?? "";

      const db = openSqliteDatabase(org.paths.sqlitePath);
      db.prepare("DELETE FROM capability_skill_requirements").run();
      db.close();

      const plan = materializeCanonicalLettersPlan("SKILL");
      fixture.registry.getOrOpen(org.plane, fixture.cloudRoot).persistExecutionPlan(plan);
      const started = await fixture.app.request(
        `/api/execution-tasks/${taskIdForProcess(plan, BOND_LETTER_BODY_ID)}/start`,
        {
          method: "POST",
          headers: { cookie: `${login.cookie}; ${operatorCookie}` },
        },
      );
      expect(started.status).toBe(422);
      expect(((await started.json()) as { error: string }).error).toBe("ineligible_executor");
    } finally {
      fixture.close();
    }
  });

  it("applies skill foundation without people and gates CNC vs assembly", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org Map", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "map@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const login = await loginCloud(
        fixture.app,
        "map@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = {
        cookie: login.cookie ?? "",
        "content-type": "application/json",
      };
      const skills = (await (
        await fixture.app.request("/api/people/skills", { headers })
      ).json()) as { skills: Array<{ skillId: string; code: string }> };
      const cnc = skills.skills.find((item) => item.code === "SK_CNC_OPERATOR");
      const cant = skills.skills.find((item) => item.code === "SK_LETTER_CANT_OPERATOR");
      const assembly = skills.skills.find((item) => item.code === "SK_ASSEMBLY");
      expect(cnc && cant && assembly).toBeTruthy();
      if (!cnc || !cant || !assembly) {
        return;
      }

      const cncPerson = ((await (
        await fixture.app.request("/api/people", {
          method: "POST",
          headers,
          body: JSON.stringify({ displayName: "Operator CNC" }),
        })
      ).json()) as { person: { personId: string } }).person;
      const cantPerson = ((await (
        await fixture.app.request("/api/people", {
          method: "POST",
          headers,
          body: JSON.stringify({ displayName: "Operator cant" }),
        })
      ).json()) as { person: { personId: string } }).person;
      const assemblyPerson = ((await (
        await fixture.app.request("/api/people", {
          method: "POST",
          headers,
          body: JSON.stringify({ displayName: "Ansamblor" }),
        })
      ).json()) as { person: { personId: string } }).person;

      await fixture.app.request(`/api/people/${cncPerson.personId}/skills`, {
        method: "POST",
        headers,
        body: JSON.stringify({ skillId: cnc.skillId }),
      });
      await fixture.app.request(`/api/people/${cantPerson.personId}/skills`, {
        method: "POST",
        headers,
        body: JSON.stringify({ skillId: cant.skillId }),
      });
      await fixture.app.request(`/api/people/${assemblyPerson.personId}/skills`, {
        method: "POST",
        headers,
        body: JSON.stringify({ skillId: assembly.skillId }),
      });

      const cncEligible = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=CNC_ROUTING", { headers })
      ).json()) as { eligiblePeople: Array<{ personId: string }> };
      const cantEligible = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=PROFILE_FORMING", {
          headers,
        })
      ).json()) as { eligiblePeople: Array<{ personId: string }> };
      expect(cncEligible.eligiblePeople.map((item) => item.personId)).toEqual([cncPerson.personId]);
      expect(cantEligible.eligiblePeople.map((item) => item.personId)).toEqual([
        cantPerson.personId,
      ]);
      expect(cncEligible.eligiblePeople.map((item) => item.personId)).not.toContain(
        assemblyPerson.personId,
      );

      const unavailable = await fixture.app.request(`/api/people/${cncPerson.personId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          availability: "TEMPORARILY_UNAVAILABLE",
          unavailableReason: "Concediu",
        }),
      });
      expect(unavailable.status).toBe(200);
      const afterUnavailable = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=CNC_ROUTING", { headers })
      ).json()) as { eligiblePeople: Array<{ personId: string }> };
      expect(afterUnavailable.eligiblePeople.map((item) => item.personId)).not.toContain(
        cncPerson.personId,
      );

      const retiredSkill = await fixture.app.request(`/api/people/skills/${cnc.skillId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "RETIRED" }),
      });
      expect(retiredSkill.status).toBe(200);
      await fixture.app.request(`/api/people/${cncPerson.personId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ availability: "AVAILABLE" }),
      });
      const afterRetiredSkill = (await (
        await fixture.app.request("/api/people/eligibility?capabilityId=CNC_ROUTING", { headers })
      ).json()) as {
        eligiblePeople: Array<{ personId: string }>;
        diagnoses: Array<{ personId: string; reason: string | null }>;
      };
      expect(afterRetiredSkill.eligiblePeople).toEqual([]);
      expect(
        afterRetiredSkill.diagnoses.find((item) => item.personId === cncPerson.personId)?.reason,
      ).toBe("RETIRED_SKILL");
    } finally {
      fixture.close();
    }
  });
});
