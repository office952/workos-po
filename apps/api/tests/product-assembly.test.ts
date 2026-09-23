import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  INSPECT_FINISHED_ASSEMBLY_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function reviewId(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, unknown>,
): Promise<string> {
  const response = await app.request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  expect(response.status).toBe(200);
  const body = await json(response);
  return body.reviewId as string;
}

describe("product assembly API", () => {
  it("runs the synthetic assembly journey and keeps children independent", async () => {
    const app = createApp();
    const customer = await json(
      await app.request("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Assembly Demo" }),
      }),
    );
    const customerId = (customer.customer as { customerId: string }).customerId;
    const request = await json(
      await app.request("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          title: "Panou ACM + litere volumetrice",
          description: "Ansamblu demonstrativ",
        }),
      }),
    );
    const requestId = (request.request as { requestId: string }).requestId;
    const offering = await json(await app.request("/api/assemblies/offering"));
    expect(offering.available).toBe(true);
    expect(offering.label).toBe("Panou ACM + litere volumetrice");

    const created = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    expect(created.status).toBe(201);
    const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;

    const acmReview = await reviewId(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    const lettersReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
    const acmMember = await app.request(`/api/assemblies/${assemblyId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview }),
    });
    expect(acmMember.status, JSON.stringify(await acmMember.clone().json())).toBe(200);
    expect(
      (
        await app.request(`/api/assemblies/${assemblyId}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role: "SIGNAGE_LETTERS",
            values: lettersValues,
            reviewId: lettersReview,
          }),
        })
      ).status,
    ).toBe(200);

    expect((await app.request(`/api/assemblies/${assemblyId}/confirm`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/quote`, { method: "POST" })).status).toBe(200);
    const quoted = await json(await app.request(`/api/assemblies/${assemblyId}`));
    const quote = (quoted.assembly as { quote: { grossPrice: number; sections: unknown[] } }).quote;
    expect(quote.sections).toHaveLength(2);
    expect(quote.grossPrice).toBeGreaterThan(0);
    expect((await app.request(`/api/assemblies/${assemblyId}/accept`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/production`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/assemblies/${assemblyId}/execution-plan`, { method: "POST" })).status).toBe(200);
    const ready = await json(await app.request(`/api/assemblies/${assemblyId}`));
    const planId = (ready.assembly as { executionPlanId: string }).executionPlanId;
    const planResponse = await json(await app.request(`/api/execution-plans/${planId}`));
    const tasks = (
      planResponse.executionPlan as {
        tasks: { taskId: string; processId: string; scopeLabel: string; plannedEffortMinutes: number | null }[];
      }
    ).tasks;
    expect(tasks.filter((task) => task.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(1);
    expect(tasks.filter((task) => task.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(tasks.filter((task) => task.processId === "PACK_PRODUCT")).toHaveLength(1);
    expect(tasks.filter((task) => task.processId === "INSPECT_FINISHED_LETTER")).toHaveLength(0);
    expect(new Set(tasks.map((task) => task.scopeLabel))).toEqual(
      new Set(["Panou ACM", "Litere", "Ansamblare"]),
    );
    const mount = tasks.find((task) => task.processId === MOUNT_LETTERS_ON_PANEL_ID);
    const effort = await app.request(`/api/execution-tasks/${mount?.taskId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 35 }),
    });
    expect(effort.status).toBe(200);

    const changedValues = { ...lettersValues, "root.inscription": "NOU" };
    const changedReview = await reviewId(app, CANONICAL_PRODUCT_CODE, changedValues);
    expect(
      (
        await app.request(`/api/assemblies/${assemblyId}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role: "SIGNAGE_LETTERS",
            values: changedValues,
            reviewId: changedReview,
          }),
        })
      ).status,
    ).toBe(200);
    const stale = await json(await app.request(`/api/assemblies/${assemblyId}`));
    expect((stale.assembly as { stale: boolean }).stale).toBe(true);
    const blocked = await app.request(`/api/assemblies/${assemblyId}/confirm`, { method: "POST" });
    expect(blocked.status).toBe(422);

    await app.request("/api/seller", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legalName: "Assembly Demo SRL" }),
    });
    const standaloneLetters = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: lettersValues, reviewId: lettersReview, customerId }),
      },
    );
    expect(standaloneLetters.status).toBe(200);
    const standaloneAcm = await app.request(
      `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: acmValues, reviewId: acmReview, customerId }),
      },
    );
    expect(standaloneAcm.status).toBe(200);

    const disabled = await app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
        ],
      }),
    });
    expect(disabled.status).toBe(200);
    const offeringAfter = await json(await app.request("/api/assemblies/offering"));
    expect(offeringAfter.available).toBe(false);
    const historical = await app.request(`/api/assemblies/${assemblyId}`);
    expect(historical.status).toBe(200);
    const newAssembly = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    expect(newAssembly.status).toBe(409);
  });
});
