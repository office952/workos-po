import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LAB_WORKSHOP_LABOR_ID,
  OWNER_CONFIRMED_SELLER,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

type Json = Record<string, unknown>;
type Requester = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
type Client = ReturnType<typeof client>;
type CostLine = { processId: string; outcome: string; quantity: number | null; rate: number | null; cost: number | null };
type OperationCostView = {
  source: string;
  editable: boolean;
  policyLabel: string;
  lines: CostLine[];
  knownTotal: number | null;
  completeness: string;
  estimates: { processId: string; personHours: number | null }[];
};
type AdminView = {
  canEdit: boolean;
  version: number | null;
  finalInspectionMode: string;
  finalPackagingMode: string;
  history: { version: number }[];
  rates: { resourceId: string; status: string; evidenceRowId: string | null; amount?: number }[];
};

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

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

function client(app: Requester, cookie = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    get: (path: string) => app.request(path, { headers }),
    post: (path: string, body?: unknown) => send("POST", path, body),
    put: (path: string, body?: unknown) => send("PUT", path, body),
    patch: (path: string, body?: unknown) => send("PATCH", path, body),
  };
}

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

async function reviewId(api: Client, productCode: string, values: Json): Promise<string> {
  const response = await api.post(`/api/products/${productCode}/preview`, { values });
  expect(response.status).toBe(200);
  return (await json(response)).reviewId as string;
}

async function assemblyView(api: Client, assemblyId: string): Promise<Json> {
  const response = await api.get(`/api/assemblies/${assemblyId}`);
  expect(response.status).toBe(200);
  return (await json(response)).assembly as Json;
}

async function operationCost(api: Client, assemblyId: string): Promise<OperationCostView> {
  return (await assemblyView(api, assemblyId)).operationCost as OperationCostView;
}

async function admin(api: Client): Promise<AdminView> {
  const response = await api.get("/api/admin/assembly-operation-cost");
  expect(response.status).toBe(200);
  return (await json(response)) as unknown as AdminView;
}

function line(view: OperationCostView, processId: string): CostLine | undefined {
  return view.lines.find((item) => item.processId === processId);
}

async function confirmedAssembly(api: Client, label: string): Promise<string> {
  const customer = await json(await api.post("/api/customers", { displayName: label }));
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await api.post("/api/requests", { customerId, title: label, description: "Cost intern ansamblu" }),
  );
  const requestId = (request.request as { requestId: string }).requestId;
  const created = await api.post("/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  for (const member of [
    { role: "SUPPORT_PANEL", values: acmValues, reviewId: await reviewId(api, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues) },
    { role: "SIGNAGE_LETTERS", values: lettersValues, reviewId: await reviewId(api, CANONICAL_PRODUCT_CODE, lettersValues) },
  ]) {
    expect((await api.post(`/api/assemblies/${assemblyId}/members`, member)).status).toBe(200);
  }
  expect((await api.post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  return assemblyId;
}

async function setPolicy(api: Client, expectedVersion: number | null, finalInspectionMode: string, finalPackagingMode: string) {
  return api.post("/api/admin/assembly-operation-cost-policy", {
    expectedVersion,
    finalInspectionMode,
    finalPackagingMode,
  });
}

async function createWorkshopRate(api: Client, amount: number) {
  return api.post("/api/resources-admin/cost-evidence", {
    resourceId: LAB_WORKSHOP_LABOR_ID,
    amount,
    note: "Tarif sintetic atelier",
  });
}

function freeze(api: Client, assemblyId: string) {
  return freezeAcknowledgingRates((body) => api.post(`/api/assemblies/${assemblyId}/quote`, body));
}

async function release(api: Client, assemblyId: string) {
  const quoteSnapshotId = (await assemblyView(api, assemblyId)).quoteSnapshotId as string;
  expect((await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId })).status).toBe(200);
  expect((await api.post(`/api/assemblies/${assemblyId}/production`)).status).toBe(200);
  return (await assemblyView(api, assemblyId)).productionCost as {
    total: number;
    completeness: string;
    unpricedOperations: string[];
  };
}

describe("organization assembly operation cost policy", () => {
  it("starts unconfigured with no invented workshop rate", async () => {
    const api = client(createApp());
    const view = await admin(api);
    expect(view.version).toBeNull();
    expect(view.finalInspectionMode).toBe("NOT_CONFIGURED");
    expect(view.finalPackagingMode).toBe("NOT_CONFIGURED");
    expect(view.history).toEqual([]);
    expect(view.rates.find((rate) => rate.resourceId === LAB_WORKSHOP_LABOR_ID)).toMatchObject({
      status: "MISSING",
      evidenceRowId: null,
    });
    expect(view.rates.find((rate) => rate.resourceId === LAB_WORKSHOP_LABOR_ID)).not.toHaveProperty("amount");
  });

  it("appends versions, refuses stale or invalid writes and treats a repeat as a no-op", async () => {
    const api = client(createApp());
    const first = await setPolicy(api, null, "INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA");
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({ alreadyApplied: false, version: 1 });

    const stale = await setPolicy(api, null, "SEPARATE_LABOR", "PANEL_FACE_AREA");
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ error: "stale_policy_version", version: 1 });

    const repeat = await setPolicy(api, 1, "INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA");
    expect(await json(repeat)).toMatchObject({ alreadyApplied: true, version: 1 });

    const second = await setPolicy(api, 1, "SEPARATE_LABOR", "NOT_CONFIGURED");
    expect(second.status).toBe(200);
    const view = await admin(api);
    expect(view.version).toBe(2);
    expect(view.history.map((item) => item.version)).toEqual([2, 1]);

    for (const body of [
      { expectedVersion: 2, finalInspectionMode: "FREE", finalPackagingMode: "PANEL_FACE_AREA" },
      { expectedVersion: 2, finalInspectionMode: "SEPARATE_LABOR", finalPackagingMode: "VOLUME" },
      { expectedVersion: "2", finalInspectionMode: "SEPARATE_LABOR", finalPackagingMode: "PANEL_FACE_AREA" },
      { expectedVersion: 0, finalInspectionMode: "SEPARATE_LABOR", finalPackagingMode: "PANEL_FACE_AREA" },
      { finalInspectionMode: "SEPARATE_LABOR", finalPackagingMode: "PANEL_FACE_AREA" },
      null,
    ]) {
      expect((await api.post("/api/admin/assembly-operation-cost-policy", body)).status).toBe(400);
    }
    expect((await admin(api)).version).toBe(2);
  });

  it("creates the initial workshop rate through the existing registry and supersedes it later", async () => {
    const api = client(createApp());
    const created = await createWorkshopRate(api, 30);
    expect(created.status).toBe(201);
    const rate = (await admin(api)).rates.find((item) => item.resourceId === LAB_WORKSHOP_LABOR_ID)!;
    expect(rate).toMatchObject({ status: "CONFIRMED", amount: 30 });
    expect((await createWorkshopRate(api, 31)).status).toBe(409);
    const superseded = await api.patch(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(rate.evidenceRowId!)}`,
      { amount: 32, note: "Actualizare sintetică" },
    );
    expect(superseded.status).toBe(200);
    expect((await admin(api)).rates.find((item) => item.resourceId === LAB_WORKSHOP_LABOR_ID)).toMatchObject({
      status: "CONFIRMED",
      amount: 32,
    });
  });
});

describe("assembly operation estimates and frozen evidence", () => {
  it("previews, freezes, copies and releases only the evidence frozen at quotation", async () => {
    const api = client(createApp());
    expect((await setPolicy(api, null, "INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA")).status).toBe(200);
    expect((await createWorkshopRate(api, 30)).status).toBe(201);
    const assemblyId = await confirmedAssembly(api, "Client Montaj");

    const before = await operationCost(api, assemblyId);
    expect(before).toMatchObject({ source: "PREVIEW", editable: true, completeness: "PARTIAL" });
    expect(line(before, "MOUNT_LETTERS_ON_PANEL")?.outcome).toBe("MISSING_QUANTITY");

    const estimated = await api.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
      estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 2.5 }],
    });
    expect(estimated.status).toBe(200);
    const preview = ((await json(estimated)).assembly as Json).operationCost as OperationCostView;
    expect(line(preview, "MOUNT_LETTERS_ON_PANEL")).toMatchObject({ outcome: "COSTED", quantity: 2.5, rate: 30, cost: 75 });
    expect(line(preview, "INSPECT_FINISHED_ASSEMBLY")).toMatchObject({ outcome: "INCLUDED", cost: 0 });
    expect(line(preview, "PACK_PRODUCT")).toMatchObject({ outcome: "COSTED", quantity: 0.5, cost: 5 });
    expect(preview).toMatchObject({ knownTotal: 80, completeness: "COMPLETE" });
    expect(preview.estimates).toEqual([{ processId: "MOUNT_LETTERS_ON_PANEL", label: "Montaj litere", personHours: 2.5 }]);

    const quoteBefore = (await assemblyView(api, assemblyId)).quoteSnapshotId;
    expect(quoteBefore).toBeNull();
    expect((await freeze(api, assemblyId)).status).toBe(200);
    const frozenView = await assemblyView(api, assemblyId);
    expect(frozenView.quoteSnapshotId).toMatch(/^asmq:asmt:/);
    const frozen = frozenView.operationCost as OperationCostView;
    expect(frozen).toMatchObject({ source: "FROZEN", editable: false, knownTotal: 80 });

    const locked = await api.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
      estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 9 }],
    });
    expect(locked.status).toBe(409);
    expect((await json(locked)).error).toBe("estimates_frozen");

    const rate = (await admin(api)).rates.find((item) => item.resourceId === LAB_WORKSHOP_LABOR_ID)!;
    expect(
      (await api.patch(`/api/resources-admin/cost-evidence/${encodeURIComponent(rate.evidenceRowId!)}`, { amount: 99 })).status,
    ).toBe(200);
    expect((await setPolicy(api, 1, "NOT_CONFIGURED", "NOT_CONFIGURED")).status).toBe(200);
    expect(await operationCost(api, assemblyId)).toEqual(frozen);
    expect((await assemblyView(api, assemblyId)).quoteSnapshotId).toBe(frozenView.quoteSnapshotId);
    expect((await assemblyView(api, assemblyId)).quoteFreezable).toBe(false);

    const production = await release(api, assemblyId);
    expect(production.unpricedOperations).toEqual([]);
    expect(await operationCost(api, assemblyId)).toEqual(frozen);

    expect((await setPolicy(api, 2, "INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA")).status).toBe(200);
    const comparison = await confirmedAssembly(api, "Client Fără Ore");
    expect((await freeze(api, comparison)).status).toBe(200);
    const comparisonProduction = await release(api, comparison);
    expect(comparisonProduction.unpricedOperations).toEqual(["Montaj litere pe panou"]);
    expect(Math.round((production.total - comparisonProduction.total) * 100) / 100).toBe(75);
  });

  it("keeps an unconfigured organization PARTIAL and never prices missing work as zero", async () => {
    const api = client(createApp());
    const assemblyId = await confirmedAssembly(api, "Client Neconfigurat");
    expect(
      (await api.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
        estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 2 }],
      })).status,
    ).toBe(200);
    const view = await operationCost(api, assemblyId);
    expect(view.policyLabel).toMatch(/nu este configurată/);
    expect(view.lines.map((item) => [item.processId, item.outcome])).toEqual([
      ["MOUNT_LETTERS_ON_PANEL", "MISSING_RATE"],
      ["INSPECT_FINISHED_ASSEMBLY", "MISSING_POLICY"],
      ["PACK_PRODUCT", "MISSING_POLICY"],
    ]);
    expect(view.lines.every((item) => item.cost === null)).toBe(true);
    expect(view.completeness).toBe("PARTIAL");
    expect((await freeze(api, assemblyId)).status).toBe(200);
    const production = await release(api, assemblyId);
    expect(production.completeness).toBe("PARTIAL");
    expect(production.unpricedOperations).toHaveLength(3);
  });

  it("validates estimate payloads and process applicability", async () => {
    const api = client(createApp());
    const assemblyId = await confirmedAssembly(api, "Client Validare");
    for (const body of [
      null,
      {},
      { estimates: [] },
      { estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: "2" }] },
      { estimates: [{ personHours: 2 }] },
    ]) {
      expect((await api.put(`/api/assemblies/${assemblyId}/operation-estimates`, body)).status).toBe(400);
    }
    for (const estimate of [
      { processId: "MOUNT_LETTERS_ON_PANEL", personHours: 0 },
      { processId: "MOUNT_LETTERS_ON_PANEL", personHours: 1.234 },
      { processId: "MOUNT_LOGO_ON_PANEL", personHours: 1 },
      { processId: "PACK_PRODUCT", personHours: 1 },
    ]) {
      const refused = await api.put(`/api/assemblies/${assemblyId}/operation-estimates`, { estimates: [estimate] });
      expect(refused.status).toBe(400);
      expect((await json(refused)).error).toBe("invalid_estimate");
    }
    expect((await api.put("/api/assemblies/asm-missing/operation-estimates", {
      estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 1 }],
    })).status).toBe(404);
  });
});

describe("assembly operation cost permissions and organization isolation", () => {
  it("hides rates and costs from members, refuses their writes and isolates organizations", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier Cost");
    const organizationId = org.organization.organizationId;
    await addUser(fixture, { email: "owner-cost@example.test", password: OWNER_PASSWORD, organizationId, role: "owner" });
    await addUser(fixture, { email: "member-cost@example.test", password: MEMBER_PASSWORD, organizationId, role: "member" });
    const other = await addOrganization(fixture, "Atelier Vecin");
    const otherId = other.organization.organizationId;
    await addUser(fixture, { email: "owner-vecin@example.test", password: OWNER_PASSWORD, organizationId: otherId, role: "owner" });
    const ownerCookie = (await loginCloud(fixture.app, "owner-cost@example.test", OWNER_PASSWORD, organizationId)).cookie ?? "";
    const owner = client(fixture.app, ownerCookie);
    const member = client(fixture.app, (await loginCloud(fixture.app, "member-cost@example.test", MEMBER_PASSWORD, organizationId)).cookie ?? "");
    const stranger = client(fixture.app, (await loginCloud(fixture.app, "owner-vecin@example.test", OWNER_PASSWORD, otherId)).cookie ?? "");
    const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } = OWNER_CONFIRMED_SELLER;
    expect((await owner.patch("/api/seller", { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank })).status).toBe(200);

    expect((await setPolicy(owner, null, "INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA")).status).toBe(200);
    expect((await createWorkshopRate(owner, 30)).status).toBe(201);
    const assemblyId = await confirmedAssembly(owner, "Client Permisiuni");
    expect(
      (await owner.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
        estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 2.5 }],
      })).status,
    ).toBe(200);

    const memberAdmin = await admin(member);
    expect(memberAdmin.canEdit).toBe(false);
    expect(memberAdmin.version).toBe(1);
    expect(JSON.stringify(memberAdmin.rates)).not.toMatch(/"amount"/);
    expect((await assemblyView(member, assemblyId)).operationCost).toBeNull();
    expect(JSON.stringify(await assemblyView(member, assemblyId))).not.toMatch(/MOUNT_LETTERS_ON_PANEL","outcome/);
    expect(
      (await member.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
        estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 1 }],
      })).status,
    ).toBe(403);
    expect((await setPolicy(member, 1, "SEPARATE_LABOR", "PANEL_FACE_AREA")).status).toBe(403);
    expect((await createWorkshopRate(member, 1)).status).toBe(403);

    const strangerAdmin = await admin(stranger);
    expect(strangerAdmin.version).toBeNull();
    expect(strangerAdmin.rates.find((rate) => rate.resourceId === LAB_WORKSHOP_LABOR_ID)?.status).toBe("MISSING");
    expect(
      (await stranger.put(`/api/assemblies/${assemblyId}/operation-estimates`, {
        estimates: [{ processId: "MOUNT_LETTERS_ON_PANEL", personHours: 1 }],
      })).status,
    ).toBe(404);
    expect((await stranger.get(`/api/assemblies/${assemblyId}`)).status).toBe(404);

    const ownerView = (await assemblyView(owner, assemblyId)).operationCost as OperationCostView;
    expect(line(ownerView, "MOUNT_LETTERS_ON_PANEL")).toMatchObject({ cost: 75 });
    expect((await admin(owner)).version).toBe(1);
    fixture.close();
  });
});
