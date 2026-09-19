import { afterEach, describe, expect, it } from "vitest";
import { MCH_CNC_4020_ID } from "@workos-final/domain";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { backCncTaskId, materializeCanonicalLettersPlan } from "./letters-plan-fixture.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("Cloud provider registry isolation", () => {
  it("rejects HUB MEDIA machines from NEW_ORGANIZATION assignment and projection", async () => {
    const fixture = createCloudFixture();
    try {
    const org = await addOrganization(fixture, "Firma Fara Utilaje", "NEW_ORGANIZATION");
    await addUser(fixture, {
      email: "owner@empty-wc.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const plan = materializeCanonicalLettersPlan();
    const runtime = fixture.registry.getOrOpen(org.plane, fixture.cloudRoot);
    runtime.persistExecutionPlan(plan);
    const taskId = backCncTaskId(plan);

    const login = await loginCloud(
      fixture.app,
      "owner@empty-wc.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const headers = { cookie: login.cookie ?? "" };
    const view = (await (
      await fixture.app.request(`/api/execution-plans/${plan.plan.planId}`, { headers })
    ).json()) as {
      executionPlan: { tasks: Array<{ taskId: string; eligibleProviders: Array<{ id: string }> }> };
    };
    const cnc = view.executionPlan.tasks.find((task) => task.taskId === taskId);
    expect(cnc?.eligibleProviders.map((item) => item.id)).not.toContain(MCH_CNC_4020_ID);

    const assigned = await fixture.app.request(`/api/execution-tasks/${taskId}/provider`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(assigned.status).toBe(422);
    expect(((await assigned.json()) as { error: string }).error).toBe("ineligible_provider");
    } finally {
      fixture.close();
    }
  });
});
