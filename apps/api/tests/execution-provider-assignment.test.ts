import { afterEach, describe, expect, it } from "vitest";
import { presentExecutionPlanForViewer } from "../src/execution/presentExecutionPlan.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { backCncTaskId, materializeCanonicalLettersPlan } from "./letters-plan-fixture.js";

afterEach(() => {
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

type PresentedTask = {
  taskId: string;
  canAssign?: boolean;
  canAssignProvider?: boolean;
  assignmentLabel?: string;
  assignedProvider?: { id?: string; label?: string } | null;
  eligibleProviders?: Array<{ id: string; kind: string; kindLabel: string; label: string }>;
};

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function activateCncPair(
  app: ReturnType<typeof import("../src/app.js").createApp>,
  headers: Record<string, string>,
) {
  const workcenterResponse = await app.request("/api/workcenters", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ label: "Zonă CNC", description: "Debitare" }),
  });
  expect(workcenterResponse.status).toBe(201);
  const workcenter = (await readBody(workcenterResponse)).workcenter as JsonObject;
  await app.request(`/api/workcenters/${workcenter.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ lifecycle: "ACTIVE" }),
  });
  const alfa = await app.request("/api/machines", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      label: "Alfa CNC",
      workcenterId: workcenter.id,
      capabilityIds: ["CNC_ROUTING"],
    }),
  });
  const zebra = await app.request("/api/machines", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      label: "Zebra CNC",
      workcenterId: workcenter.id,
      capabilityIds: ["CNC_ROUTING"],
    }),
  });
  expect(alfa.status).toBe(201);
  expect(zebra.status).toBe(201);
  const alfaMachine = (await readBody(alfa)).machine as JsonObject;
  const zebraMachine = (await readBody(zebra)).machine as JsonObject;
  await app.request(`/api/machines/${alfaMachine.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ lifecycle: "ACTIVE" }),
  });
  await app.request(`/api/machines/${zebraMachine.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ lifecycle: "ACTIVE" }),
  });
  return {
    alfaId: String(alfaMachine.id),
    zebraId: String(zebraMachine.id),
  };
}

describe("execution provider assignment viewer permission", () => {
  it("keeps domain canAssign and only adds viewer permission in presentation", () => {
    const presented = presentExecutionPlanForViewer(
      {
        tasks: [
          {
            taskId: "task:1",
            canAssign: true,
            eligibleProviders: [{ id: "mch:a", kind: "MACHINE", label: "CNC A" }],
          },
        ],
      },
      true,
    );
    const ownerTask = (presented.tasks as PresentedTask[])[0];
    expect(ownerTask?.canAssign).toBe(true);
    expect(ownerTask?.canAssignProvider).toBe(true);
    expect(ownerTask?.eligibleProviders?.[0]).toEqual({
      id: "mch:a",
      kind: "MACHINE",
      kindLabel: "Utilaj",
      label: "CNC A",
    });
    const memberPresented = presentExecutionPlanForViewer(
      {
        tasks: [
          {
            taskId: "task:1",
            canAssign: true,
            eligibleProviders: [{ id: "mch:a", kind: "MACHINE", label: "CNC A" }],
          },
        ],
      },
      false,
    );
    const memberTask = (memberPresented.tasks as PresentedTask[])[0];
    expect(memberTask?.canAssign).toBe(true);
    expect(memberTask?.canAssignProvider).toBe(false);
  });

  it("projects Owner-only canAssignProvider and requires an explicit provider choice", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await addOrganization(fixture, "Firma A", "NEW_ORGANIZATION");
      const orgB = await addOrganization(fixture, "Firma B", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner-a@exe2.test",
        password: OWNER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "member-a@exe2.test",
        password: MEMBER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "member",
      });
      await addUser(fixture, {
        email: "owner-b@exe2.test",
        password: OWNER_PASSWORD,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app,
        "owner-a@exe2.test",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      const memberA = await loginCloud(
        fixture.app,
        "member-a@exe2.test",
        MEMBER_PASSWORD,
        orgA.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-b@exe2.test",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const ownerHeaders = { cookie: ownerA.cookie ?? "" };
      const memberHeaders = { cookie: memberA.cookie ?? "" };
      const ownerBHeaders = { cookie: ownerB.cookie ?? "" };

      const machines = await activateCncPair(fixture.app, ownerHeaders);
      const foreign = await activateCncPair(fixture.app, ownerBHeaders);
      const plan = materializeCanonicalLettersPlan();
      fixture.registry.getOrOpen(orgA.plane, fixture.cloudRoot).persistExecutionPlan(plan);
      const taskId = backCncTaskId(plan);

      const ownerView = (await readBody(
        await fixture.app.request(`/api/execution-plans/${plan.plan.planId}`, {
          headers: ownerHeaders,
        }),
      )).executionPlan as { tasks: PresentedTask[] };
      const ownerTask = ownerView.tasks.find((task) => task.taskId === taskId);
      expect(ownerTask?.canAssign).toBe(true);
      expect(ownerTask?.canAssignProvider).toBe(true);
      expect(ownerTask?.eligibleProviders?.map((item) => item.id)).toEqual([
        machines.alfaId,
        machines.zebraId,
      ]);
      expect(ownerTask?.eligibleProviders?.map((item) => item.label)).toEqual([
        "Alfa CNC",
        "Zebra CNC",
      ]);
      expect(ownerTask?.eligibleProviders?.every((item) => item.kindLabel === "Utilaj")).toBe(
        true,
      );

      const memberView = (await readBody(
        await fixture.app.request(`/api/execution-plans/${plan.plan.planId}`, {
          headers: memberHeaders,
        }),
      )).executionPlan as { tasks: PresentedTask[] };
      const memberTask = memberView.tasks.find((task) => task.taskId === taskId);
      expect(memberTask?.canAssign).toBe(true);
      expect(memberTask?.canAssignProvider).toBe(false);
      expect(memberTask?.eligibleProviders?.map((item) => item.id)).toEqual([
        machines.alfaId,
        machines.zebraId,
      ]);

      const memberAssign = await fixture.app.request(`/api/execution-tasks/${taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json", ...memberHeaders },
        body: JSON.stringify({ providerId: machines.zebraId }),
      });
      expect(memberAssign.status).toBe(403);

      const ineligible = await fixture.app.request(`/api/execution-tasks/${taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ providerId: "mch:not-a-provider" }),
      });
      expect(ineligible.status).toBe(422);
      expect((await readBody(ineligible)).error).toBe("ineligible_provider");

      const crossOrg = await fixture.app.request(`/api/execution-tasks/${taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ providerId: foreign.zebraId }),
      });
      expect(crossOrg.status).toBe(422);
      expect((await readBody(crossOrg)).error).toBe("ineligible_provider");

      const assigned = await fixture.app.request(`/api/execution-tasks/${taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ providerId: machines.zebraId }),
      });
      expect(assigned.status).toBe(200);
      const assignedView = (await readBody(assigned)).executionPlan as { tasks: PresentedTask[] };
      const assignedTask = assignedView.tasks.find((task) => task.taskId === taskId);
      expect(assignedTask?.assignedProvider?.id).toBe(machines.zebraId);
      expect(assignedTask?.assignedProvider?.label).toBe("Zebra CNC");
      expect(assignedTask?.assignmentLabel).toBe("Zebra CNC");
      expect(assignedTask?.canAssignProvider).toBe(false);

      const reread = (await readBody(
        await fixture.app.request(`/api/execution-plans/${plan.plan.planId}`, {
          headers: ownerHeaders,
        }),
      )).executionPlan as { tasks: PresentedTask[] };
      expect(reread.tasks.find((task) => task.taskId === taskId)?.assignedProvider?.id).toBe(
        machines.zebraId,
      );
    } finally {
      fixture.close();
    }
  });
});
