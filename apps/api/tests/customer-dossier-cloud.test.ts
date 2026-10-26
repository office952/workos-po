import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudBackup } from "../src/cloud/backup.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { restoreCloudBackup } from "../src/cloud/restore.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  openCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
  type CloudFixture,
} from "./cloud-harness.js";

type Json = Record<string, unknown>;

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

const PDF = new TextEncoder().encode("%PDF-1.4\n% DEMO — fără valoare comercială\n%%EOF\n");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function client(fixture: CloudFixture, cookie: string) {
  return {
    async json(method: string, path: string, payload?: unknown) {
      const response = await fixture.app.request(path, {
        method,
        headers: payload === undefined ? { cookie } : { cookie, "content-type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as Json };
    },
    async raw(path: string) {
      return fixture.app.request(path, { headers: { cookie } });
    },
    async upload(customerId: string, fields: Record<string, string>) {
      const form = new FormData();
      form.set("file", new File([PDF], "contract.pdf", { type: "application/pdf" }));
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      const response = await fixture.app.request(`/api/customers/${customerId}/documents`, { method: "POST", headers: { cookie }, body: form });
      return { status: response.status, body: (await response.json().catch(() => null)) as Json };
    },
  };
}

async function world() {
  const fixture = createCloudFixture();
  const alpha = await addOrganization(fixture, "Atelier Alpha");
  const beta = await addOrganization(fixture, "Atelier Beta");
  for (const [email, organizationId, role, password] of [
    ["owner-a@example.test", alpha.organization.organizationId, "owner", OWNER_PASSWORD],
    ["owner-b@example.test", beta.organization.organizationId, "owner", OWNER_PASSWORD],
    ["member-a@example.test", alpha.organization.organizationId, "member", MEMBER_PASSWORD],
  ] as const) {
    await addUser(fixture, { email, password, organizationId, role });
  }
  const ownerA = client(fixture, (await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD)).cookie ?? "");
  const ownerB = client(fixture, (await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD)).cookie ?? "");
  const memberA = client(
    fixture,
    (await loginCloud(fixture.app, "member-a@example.test", MEMBER_PASSWORD, alpha.organization.organizationId)).cookie ?? "",
  );
  return { fixture, alpha, beta, ownerA, ownerB, memberA };
}

describe("customer dossier — organization isolation and permissions", () => {
  it("keeps each organization's dossier inside its own plane and applies the role policy", async () => {
    const { fixture, ownerA, ownerB, memberA } = await world();
    const customerA = ((await ownerA.json("POST", "/api/customers", { displayName: "Client Alpha" })).body.customer as Json).customerId as string;
    const customerB = ((await ownerB.json("POST", "/api/customers", { displayName: "Client Beta" })).body.customer as Json).customerId as string;
    const siteA = (await ownerA.json("POST", `/api/customers/${customerA}/sites`, { name: "Sediu Alpha" })).body.site as Json;
    const siteB = (await ownerB.json("POST", `/api/customers/${customerB}/sites`, { name: "Sediu Beta" })).body.site as Json;
    const uploaded = await ownerA.upload(customerA, { kind: "CONTRACT", title: "Contract cadru", documentNumber: "C-7" });
    expect(uploaded.status).toBe(201);
    const documentId = uploaded.body.documentId as string;
    const contentHref = `/api/customers/${customerA}/documents/${documentId}/content`;

    // Another organization sees neither the customer, nor the document, nor its file.
    expect((await ownerB.json("GET", `/api/customers/${customerA}/dossier`)).status).toBe(404);
    expect((await ownerB.raw(contentHref)).status).toBe(404);
    expect((await ownerB.json("GET", `/api/customers/${customerA}/history`)).status).toBe(404);
    expect((await ownerB.json("POST", `/api/customers/${customerA}/sites`, { name: "Intrus" })).status).toBe(404);
    expect((await ownerB.upload(customerA, { kind: "OTHER" })).status).toBe(404);
    // Cross-organization ids are refused as associations, even through one's own customer.
    expect((await ownerB.json("POST", `/api/customers/${customerB}/documents/${documentId}/links`, { kind: "SITE", subjectId: siteB.siteId })).status).toBe(404);
    expect((await ownerA.json("POST", `/api/customers/${customerA}/documents/${documentId}/links`, { kind: "SITE", subjectId: siteB.siteId })).status).toBe(422);
    expect((await ownerA.json("PUT", `/api/customers/${customerA}/site-assignments`, { subjectKind: "REQUEST", subjectId: "req:not-here", siteId: siteA.siteId })).status).toBe(422);

    // Member: reads, uploads and edits sites; cannot change financial terms.
    expect((await memberA.raw(contentHref)).status).toBe(200);
    expect((await memberA.json("PATCH", `/api/customers/${customerA}/sites/${siteA.siteId}`, { phone: "0700 111 222" })).status).toBe(200);
    expect((await memberA.upload(customerA, { kind: "RECEPTION", title: "PV recepție" })).status).toBe(201);
    const memberTerms = await memberA.json("GET", `/api/customers/${customerA}/commercial-terms`);
    expect(memberTerms.status).toBe(200);
    expect(memberTerms.body.canEdit).toBe(false);
    expect((await memberA.json("PUT", `/api/customers/${customerA}/commercial-terms`, { paymentTermDays: 5 })).status).toBe(403);
    const memberPermissions = ((await memberA.json("GET", `/api/customers/${customerA}/dossier`)).body.dossier as Json).permissions as Json;
    expect(memberPermissions).toMatchObject({ read: true, uploadDocuments: true, editCommercialTerms: false });
    const ownerTerms = await ownerA.json("PUT", `/api/customers/${customerA}/commercial-terms`, { paymentTermDays: 30, referenceDocumentId: documentId });
    expect(ownerTerms.status).toBe(200);
    // Owner B cannot reference A's contract from B's customer.
    expect((await ownerB.json("PUT", `/api/customers/${customerB}/commercial-terms`, { referenceDocumentId: documentId })).status).toBe(422);
    fixture.close();
  });

  it("a search by site and year stays inside the customer and the organization (N-020)", async () => {
    const { fixture, ownerA, ownerB } = await world();
    const seed = async (owner: ReturnType<typeof client>, displayName: string, title: string) => {
      const customerId = ((await owner.json("POST", "/api/customers", { displayName })).body.customer as Json).customerId as string;
      const site = (await owner.json("POST", `/api/customers/${customerId}/sites`, { name: "Depozit Ghimbav" })).body.site as Json;
      expect((await owner.json("POST", `/api/customers/${customerId}/historical-works`, { title, eventDate: "2021-06", eventDateEnd: "2021-07", siteId: site.siteId })).status).toBe(201);
      return customerId;
    };
    const customerA = await seed(ownerA, "Client Alpha", "Litere Alpha");
    const customerA2 = await seed(ownerA, "Client Alpha Doi", "Litere Alpha Doi");
    const customerB = await seed(ownerB, "Client Beta", "Litere Beta");
    const titles = async (owner: ReturnType<typeof client>, customerId: string) => {
      const response = await owner.json("GET", `/api/customers/${customerId}/history?q=${encodeURIComponent("Ghimbav 2021")}`);
      return response.status === 200 ? ((response.body.history as Json).entries as Json[]).map((entry) => entry.title) : response.status;
    };
    expect(await titles(ownerA, customerA)).toEqual(["Litere Alpha"]);
    expect(await titles(ownerA, customerA2)).toEqual(["Litere Alpha Doi"]);
    expect(await titles(ownerB, customerB)).toEqual(["Litere Beta"]);
    // Another organization cannot search a customer it does not own.
    expect(await titles(ownerB, customerA)).toBe(404);
    expect(await titles(ownerA, customerB)).toBe(404);
    fixture.close();
  });

  it("backs up and restores the dossier tables and files with the organization", async () => {
    const { fixture, ownerA } = await world();
    const customerA = ((await ownerA.json("POST", "/api/customers", { displayName: "Client Backup" })).body.customer as Json).customerId as string;
    const site = (await ownerA.json("POST", `/api/customers/${customerA}/sites`, { name: "Sediu Backup" })).body.site as Json;
    const work = (await ownerA.json("POST", `/api/customers/${customerA}/historical-works`, { title: "Lucrare 2021", eventDate: "2021-05", siteId: site.siteId })).body.work as Json;
    const uploaded = await ownerA.upload(customerA, {
      kind: "INVOICE",
      title: "Factură 2021",
      documentNumber: "F-21",
      links: JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: work.workId }]),
    });
    await ownerA.json("PUT", `/api/customers/${customerA}/commercial-terms`, { paymentTermDays: 45, currency: "EUR" });
    const before = (await ownerA.json("GET", `/api/customers/${customerA}/history?q=F-21`)).body.history as Json;
    expect(before.total).toBe(1);
    fixture.close();

    const backupRoot = trackTempDir();
    const backup = await createCloudBackup({ cloudRoot: fixture.cloudRoot, backupRoot });
    expect(backup.manifest.operationalMigrations).toContain("047_customer_dossier.sql");
    expect(backup.manifest.artifacts.some((artifact) => artifact.path.includes("/documents/customers/"))).toBe(true);
    const restoredRoot = trackTempDir();
    restoreCloudBackup({ backupDir: backup.backupDir, targetRoot: restoredRoot, sourceCloudRoot: fixture.cloudRoot });

    const restored = openCloudFixture(restoredRoot);
    const owner = client(restored, (await loginCloud(restored.app, "owner-a@example.test", OWNER_PASSWORD)).cookie ?? "");
    const after = (await owner.json("GET", `/api/customers/${customerA}/history?q=F-21`)).body.history as { total: number; entries: Array<{ documents: Json[] }> };
    expect(after.total).toBe(1);
    const invoice = after.entries[0]?.documents[0] as Json;
    expect(invoice.documentId).toBe(uploaded.body.documentId);
    const bytes = new Uint8Array(await (await owner.raw(invoice.downloadHref as string)).arrayBuffer());
    expect(sha256(bytes)).toBe(sha256(PDF));
    const terms = (await owner.json("GET", `/api/customers/${customerA}/commercial-terms`)).body;
    expect((terms.terms as Json).paymentTermDays).toBe(45);
    expect(((await owner.json("GET", `/api/customers/${customerA}/dossier`)).body.dossier as Json).sites).toHaveLength(1);
    restored.close();
  });
});
