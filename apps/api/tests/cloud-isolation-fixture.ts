import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { CANONICAL_PRODUCT_CODE, PLEXIGLAS_3MM_OPAL_ID } from "@workos-final/domain";
import { adoptOperationalPlane } from "../src/cloud/adoptOperationalPlane.js";
import {
  ALPHA_ATTACHMENT_BYTES,
  ALPHA_CUSTOMER_NAME,
  ALPHA_INVENTORY_QTY,
  ALPHA_ORG_DISPLAY_NAME,
  ALPHA_PERSON_NAME,
  ALPHA_PIN,
  ALPHA_PLEXI_AMOUNT,
  ALPHA_REQUEST_TITLE,
  ALPHA_SELLER,
  ISOLATION_MEMBER_A_EMAIL,
  ISOLATION_MEMBER_B_EMAIL,
  ISOLATION_USER_A_EMAIL,
  ISOLATION_USER_B_EMAIL,
  ISOLATION_USER_C_EMAIL,
  TEST_COMPANY_ATTACHMENT_BYTES,
  TEST_COMPANY_CUSTOMER_NAME,
  TEST_COMPANY_DISPLAY_NAME,
  TEST_COMPANY_INVENTORY_QTY,
  TEST_COMPANY_PERSON_NAME,
  TEST_COMPANY_PIN,
  TEST_COMPANY_PLEXI_AMOUNT,
  TEST_COMPANY_REQUEST_TITLE,
  TEST_COMPANY_SELLER,
} from "./fixtures/cloudIsolation.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { backCncTaskId, materializeCanonicalLettersPlan } from "./letters-plan-fixture.js";
import { provisionMembership } from "../src/cloud/provision.js";
import {
  addOrganization,
  addUser,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
  trackTempDir,
  type CloudFixture,
} from "./cloud-harness.js";

export type IsolationPlaneIds = {
  organizationId: string;
  organizationName: string;
  planeId: string;
  planeRoot: string;
  documentsRoot: string;
  sellerLegalName: string;
  customerId: string;
  customerName: string;
  personId: string;
  personName: string;
  requestId: string;
  attachmentId: string;
  quoteId: string;
  quoteHash: string;
  orderId: string;
  planId: string;
  taskId: string;
  costEvidenceRowId: string;
  plexiAmount: number;
};

export type HostileIsolationWorld = {
  fixture: CloudFixture;
  alpha: IsolationPlaneIds;
  testCompany: IsolationPlaneIds;
  cookies: {
    userA: string;
    userB: string;
    userCAlpha: string;
    userCTest: string;
    memberA: string;
    memberB: string;
  };
};

type Json = Record<string, unknown>;

async function readJson(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

function headers(cookie: string, contentType = false): Record<string, string> {
  return contentType
    ? { cookie, "content-type": "application/json" }
    : { cookie };
}

function insertFrozenCommercial(
  sqlitePath: string,
  prefix: string,
  sellerLegalName: string,
  customer: { customerId: string; displayName: string },
): { quoteId: string; quoteHash: string; orderId: string } {
  const quoteId = `qts:${prefix}-isolation`;
  const quoteHash = `hash-${prefix}-isolation`;
  const orderId = `ord:${prefix}-isolation`;
  const createdAt = new Date().toISOString();
  const db = new Database(sqlitePath);
  db.prepare(
    `INSERT INTO quote_snapshots (
      quote_snapshot_id, product_code, source_review_id, content_hash,
      schema_version, created_at, payload
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    quoteId,
    CANONICAL_PRODUCT_CODE,
    `rev:${prefix}`,
    quoteHash,
    createdAt,
    JSON.stringify({
      quoteSnapshotId: quoteId,
      schemaVersion: 1,
      status: "FROZEN",
      productCode: CANONICAL_PRODUCT_CODE,
      productLabel: "Letters isolation",
      inscription: prefix,
      sourceReviewId: `rev:${prefix}`,
      sourceConfirmedAt: createdAt,
      createdAt,
      contentHash: quoteHash,
      commercial: {
        policyId: "PLATFORM_TEST_DEFAULT",
        policyVersion: 1,
        markupPercent: 35,
        markupAmount: 0,
        discountPercent: 0,
        discountAmount: 0,
        adjustmentAmount: 0,
        netPrice: 1,
        vatPercent: 21,
        vatAmount: 0.21,
        grossPrice: 1.21,
        currency: "EUR",
        completeness: "COMPLETE",
      },
      customer,
      seller: { legalName: sellerLegalName },
    }),
  );
  const acceptanceId = `qad:${quoteId}`;
  db.prepare(
    `INSERT INTO quote_acceptance_decisions (
      acceptance_id, quote_snapshot_id, quote_content_hash,
      schema_version, accepted_at
    ) VALUES (?, ?, ?, 1, ?)`,
  ).run(acceptanceId, quoteId, quoteHash, createdAt);
  db.prepare(
    `INSERT INTO order_snapshots (
      order_snapshot_id, product_code, source_quote_snapshot_id,
      source_quote_content_hash, source_acceptance_id, content_hash,
      schema_version, created_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    orderId,
    CANONICAL_PRODUCT_CODE,
    quoteId,
    quoteHash,
    acceptanceId,
    `hash-ord-${prefix}`,
    createdAt,
    JSON.stringify({
      orderSnapshotId: orderId,
      productCode: CANONICAL_PRODUCT_CODE,
      sourceQuoteSnapshotId: quoteId,
      sourceQuoteContentHash: quoteHash,
    }),
  );
  db.close();
  return { quoteId, quoteHash, orderId };
}

function buildAlphaSource() {
  const root = trackTempDir();
  const sqlitePath = join(root, "product-system.sqlite");
  const documentsRoot = join(root, "documents");
  const runtime = createProductSystemRuntime(sqlitePath, { documentsRoot });
  const seller = runtime.updateSellerProfile(ALPHA_SELLER);
  if (!seller.ok) {
    throw new Error("alpha seller");
  }
  const person = runtime.createPerson(ALPHA_PERSON_NAME);
  if (!person.ok) {
    throw new Error("alpha person");
  }
  const customer = runtime.createCustomer(ALPHA_CUSTOMER_NAME);
  if (!customer.ok) {
    throw new Error("alpha customer");
  }
  const stock = runtime.recordInventoryAdjustment(
    PLEXIGLAS_3MM_OPAL_ID,
    ALPHA_INVENTORY_QTY,
    "stoc alpha",
  );
  if (!stock.ok) {
    throw new Error("alpha inventory");
  }
  const request = runtime.createCommercialRequest(
    customer.customer.customerId,
    ALPHA_REQUEST_TITLE,
    "Cerere alpha izolata",
  );
  if (!request.ok) {
    throw new Error("alpha request");
  }
  const attachment = runtime.createRequestAttachment(request.request.requestId, {
    originalFileName: "brief-alpha.txt",
    mimeType: "text/plain",
    bytes: new TextEncoder().encode(ALPHA_ATTACHMENT_BYTES),
  });
  if (!attachment.ok) {
    throw new Error("alpha attachment");
  }
  runtime.close();
  const db = new Database(sqlitePath);
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.pragma("journal_mode = DELETE");
  db.close();
  writeFileSync(join(documentsRoot, "alpha-extra.txt"), "alpha extra");
  return {
    sqlitePath,
    documentsRoot,
    personId: person.person.personId,
    customerId: customer.customer.customerId,
    requestId: request.request.requestId,
    attachmentId: attachment.attachment.attachmentId,
  };
}

async function seedPlaneViaApi(
  app: CloudFixture["app"],
  cookie: string,
  input: {
    seller: typeof TEST_COMPANY_SELLER;
    personName: string;
    pin: string;
    customerName: string;
    requestTitle: string;
    attachmentBytes: string;
    inventoryQty: number;
    plexiAmount?: number;
    displayLabel: string;
  },
) {
  const hdr = headers(cookie, true);
  const seller = await app.request("/api/seller", {
    method: "PATCH",
    headers: hdr,
    body: JSON.stringify(input.seller),
  });
  if (seller.status !== 200) {
    throw new Error(`seller ${seller.status}`);
  }
  const personRes = await app.request("/api/people", {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ displayName: input.personName }),
  });
  const personBody = await readJson(personRes);
  const personId = (personBody.person as { personId: string }).personId;
  await app.request(`/api/people/${personId}/operator-pin`, {
    method: "PUT",
    headers: hdr,
    body: JSON.stringify({ pin: input.pin, confirmPin: input.pin }),
  });
  const customerRes = await app.request("/api/customers", {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ displayName: input.customerName }),
  });
  const customerId = ((await readJson(customerRes)).customer as { customerId: string }).customerId;
  await app.request(`/api/inventory/${PLEXIGLAS_3MM_OPAL_ID}/adjustments`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ quantityDelta: input.inventoryQty, note: "izolatie" }),
  });
  const requestRes = await app.request("/api/requests", {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      customerId,
      title: input.requestTitle,
      description: "izolatie",
    }),
  });
  const requestId = ((await readJson(requestRes)).request as { requestId: string }).requestId;
  const file = new File([input.attachmentBytes], "brief.txt", { type: "text/plain" });
  const form = new FormData();
  form.set("file", file);
  const attachmentRes = await app.request(`/api/requests/${requestId}/attachments`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const attachmentId = ((await readJson(attachmentRes)).attachment as { attachmentId: string })
    .attachmentId;
  await app.request(
    "/api/admin/product-system/entities/PRODUCT_FAMILY/LIGHTED_VOLUMETRIC_SIGNS/display-label",
    {
      method: "PATCH",
      headers: hdr,
      body: JSON.stringify({ displayLabel: input.displayLabel }),
    },
  );
  const admin = (await readJson(
    await app.request("/api/resources-admin", { headers: { cookie } }),
  )) as {
    costEvidence: Array<{ resourceId: string; evidenceRowId: string; amount: number }>;
  };
  const plexi = admin.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
  if (!plexi) {
    throw new Error("missing plexi");
  }
  let costEvidenceRowId = plexi.evidenceRowId;
  if (input.plexiAmount !== undefined && input.plexiAmount !== plexi.amount) {
    const edited = await app.request(
      `/api/resources-admin/cost-evidence/${plexi.evidenceRowId}`,
      {
        method: "PATCH",
        headers: hdr,
        body: JSON.stringify({ amount: input.plexiAmount, note: "izolatie confirmat" }),
      },
    );
    if (edited.status !== 200) {
      throw new Error(`plexi ${edited.status}`);
    }
    const after = (await readJson(
      await app.request("/api/resources-admin", { headers: { cookie } }),
    )) as {
      costEvidence: Array<{ resourceId: string; evidenceRowId: string; amount: number }>;
    };
    const plexiAfter = after.costEvidence.find((row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    if (!plexiAfter) {
      throw new Error("missing plexi after edit");
    }
    costEvidenceRowId = plexiAfter.evidenceRowId;
  }
  return {
    personId,
    customerId,
    requestId,
    attachmentId,
    costEvidenceRowId,
  };
}

export async function provisionHostileIsolationWorld(): Promise<HostileIsolationWorld> {
  const fixture = createCloudFixture();
  const source = buildAlphaSource();
  const alphaOrg = await addOrganization(fixture, ALPHA_ORG_DISPLAY_NAME, "ADOPT_EXISTING");
  await adoptOperationalPlane({
    controlPlane: fixture.controlPlane,
    organizationId: alphaOrg.organization.organizationId,
    sourceSqlite: source.sqlitePath,
    sourceDocumentsRoot: source.documentsRoot,
    mode: "execute",
  });
  const testOrg = await addOrganization(fixture, TEST_COMPANY_DISPLAY_NAME, "SYNTHETIC_TEST");

  await addUser(fixture, {
    email: ISOLATION_USER_A_EMAIL,
    password: OWNER_PASSWORD,
    organizationId: alphaOrg.organization.organizationId,
    role: "owner",
  });
  await addUser(fixture, {
    email: ISOLATION_USER_B_EMAIL,
    password: OWNER_PASSWORD,
    organizationId: testOrg.organization.organizationId,
    role: "owner",
  });
  const userC = await addUser(fixture, {
    email: ISOLATION_USER_C_EMAIL,
    password: OWNER_PASSWORD,
    organizationId: alphaOrg.organization.organizationId,
    role: "owner",
  });
  provisionMembership(fixture.controlPlane, {
    userId: userC.userId,
    organizationId: testOrg.organization.organizationId,
    role: "owner",
  });
  await addUser(fixture, {
    email: ISOLATION_MEMBER_A_EMAIL,
    password: MEMBER_PASSWORD,
    organizationId: alphaOrg.organization.organizationId,
    role: "member",
  });
  await addUser(fixture, {
    email: ISOLATION_MEMBER_B_EMAIL,
    password: MEMBER_PASSWORD,
    organizationId: testOrg.organization.organizationId,
    role: "member",
  });

  const userA = await loginCloud(
    fixture.app,
    ISOLATION_USER_A_EMAIL,
    OWNER_PASSWORD,
    alphaOrg.organization.organizationId,
  );
  const userB = await loginCloud(
    fixture.app,
    ISOLATION_USER_B_EMAIL,
    OWNER_PASSWORD,
    testOrg.organization.organizationId,
  );
  const userCAlpha = await loginCloud(
    fixture.app,
    ISOLATION_USER_C_EMAIL,
    OWNER_PASSWORD,
    alphaOrg.organization.organizationId,
  );
  const userCTest = await loginCloud(
    fixture.app,
    ISOLATION_USER_C_EMAIL,
    OWNER_PASSWORD,
    testOrg.organization.organizationId,
  );
  const memberA = await loginCloud(
    fixture.app,
    ISOLATION_MEMBER_A_EMAIL,
    MEMBER_PASSWORD,
    alphaOrg.organization.organizationId,
  );
  const memberB = await loginCloud(
    fixture.app,
    ISOLATION_MEMBER_B_EMAIL,
    MEMBER_PASSWORD,
    testOrg.organization.organizationId,
  );

  const cookieA = userA.cookie ?? "";
  const cookieB = userB.cookie ?? "";

  const alphaPin = await fixture.app.request(`/api/people/${source.personId}/operator-pin`, {
    method: "PUT",
    headers: headers(cookieA, true),
    body: JSON.stringify({ pin: ALPHA_PIN, confirmPin: ALPHA_PIN }),
  });
  if (alphaPin.status !== 200) {
    throw new Error(`alpha pin ${alphaPin.status}`);
  }
  await fixture.app.request(
    "/api/admin/product-system/entities/PRODUCT_FAMILY/LIGHTED_VOLUMETRIC_SIGNS/display-label",
    {
      method: "PATCH",
      headers: headers(cookieA, true),
      body: JSON.stringify({ displayLabel: "Familie Alpha" }),
    },
  );
  const alphaAdmin = (await readJson(
    await fixture.app.request("/api/resources-admin", { headers: { cookie: cookieA } }),
  )) as { costEvidence: Array<{ resourceId: string; evidenceRowId: string; amount: number }> };
  const alphaPlexi = alphaAdmin.costEvidence.find(
    (row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID,
  );
  if (!alphaPlexi) {
    throw new Error("alpha plexi");
  }
  await fixture.app.request(`/api/resources-admin/cost-evidence/${alphaPlexi.evidenceRowId}`, {
    method: "PATCH",
    headers: headers(cookieA, true),
    body: JSON.stringify({ amount: ALPHA_PLEXI_AMOUNT, note: "alpha confirmat" }),
  });
  const alphaEdited = (await readJson(
    await fixture.app.request("/api/resources-admin", { headers: { cookie: cookieA } }),
  )) as { costEvidence: Array<{ resourceId: string; evidenceRowId: string; amount: number }> };
  const alphaPlexiAfter = alphaEdited.costEvidence.find(
    (row) => row.resourceId === PLEXIGLAS_3MM_OPAL_ID,
  );

  const testSeed = await seedPlaneViaApi(fixture.app, cookieB, {
    seller: TEST_COMPANY_SELLER,
    personName: TEST_COMPANY_PERSON_NAME,
    pin: TEST_COMPANY_PIN,
    customerName: TEST_COMPANY_CUSTOMER_NAME,
    requestTitle: TEST_COMPANY_REQUEST_TITLE,
    attachmentBytes: TEST_COMPANY_ATTACHMENT_BYTES,
    inventoryQty: TEST_COMPANY_INVENTORY_QTY,
    plexiAmount: TEST_COMPANY_PLEXI_AMOUNT,
    displayLabel: "Familie Test",
  });

  const alphaRuntime = fixture.registry.getOrOpen(alphaOrg.plane, fixture.cloudRoot);
  const alphaPlan = materializeCanonicalLettersPlan("ALPHA");
  alphaRuntime.persistExecutionPlan(alphaPlan);
  const testRuntime = fixture.registry.getOrOpen(testOrg.plane, fixture.cloudRoot);
  const testPlan = materializeCanonicalLettersPlan("TESTCO");
  testRuntime.persistExecutionPlan(testPlan);
  fixture.registry.evict(alphaOrg.organization.organizationId);
  fixture.registry.evict(testOrg.organization.organizationId);

  const alphaSnap = insertFrozenCommercial(
    alphaOrg.paths.sqlitePath,
    "alpha",
    ALPHA_SELLER.legalName,
    { customerId: source.customerId, displayName: ALPHA_CUSTOMER_NAME },
  );
  const testSnap = insertFrozenCommercial(
    testOrg.paths.sqlitePath,
    "testco",
    TEST_COMPANY_SELLER.legalName,
    { customerId: testSeed.customerId, displayName: TEST_COMPANY_CUSTOMER_NAME },
  );

  const alphaPeople = (await readJson(
    await fixture.app.request("/api/people", { headers: { cookie: cookieA } }),
  )) as { people: Array<{ personId: string; displayName: string }> };
  const testPeople = (await readJson(
    await fixture.app.request("/api/people", { headers: { cookie: cookieB } }),
  )) as { people: Array<{ personId: string; displayName: string }> };
  const alphaCustomers = (await readJson(
    await fixture.app.request("/api/customers", { headers: { cookie: cookieA } }),
  )) as { customers: Array<{ customerId: string; displayName: string }> };
  const testCustomers = (await readJson(
    await fixture.app.request("/api/customers", { headers: { cookie: cookieB } }),
  )) as { customers: Array<{ customerId: string; displayName: string }> };
  const alphaRequests = (await readJson(
    await fixture.app.request("/api/requests", { headers: { cookie: cookieA } }),
  )) as { overview: { requests: Array<{ requestId: string; title: string }> } };
  const testRequests = (await readJson(
    await fixture.app.request("/api/requests", { headers: { cookie: cookieB } }),
  )) as { overview: { requests: Array<{ requestId: string; title: string }> } };
  const alphaAttachments = (await readJson(
    await fixture.app.request(`/api/requests/${source.requestId}/attachments`, {
      headers: { cookie: cookieA },
    }),
  )) as { attachments: Array<{ attachmentId: string }> };

  return {
    fixture,
    alpha: {
      organizationId: alphaOrg.organization.organizationId,
      organizationName: ALPHA_ORG_DISPLAY_NAME,
      planeId: alphaOrg.plane.planeId,
      planeRoot: alphaOrg.paths.planeRoot,
      documentsRoot: alphaOrg.paths.documentsRoot,
      sellerLegalName: ALPHA_SELLER.legalName,
      customerId: alphaCustomers.customers[0]?.customerId ?? source.customerId,
      customerName: ALPHA_CUSTOMER_NAME,
      personId: alphaPeople.people[0]?.personId ?? source.personId,
      personName: ALPHA_PERSON_NAME,
      requestId: alphaRequests.overview.requests[0]?.requestId ?? source.requestId,
      attachmentId: alphaAttachments.attachments[0]?.attachmentId ?? source.attachmentId,
      quoteId: alphaSnap.quoteId,
      quoteHash: alphaSnap.quoteHash,
      orderId: alphaSnap.orderId,
      planId: alphaPlan.plan.planId,
      taskId: backCncTaskId(alphaPlan),
      costEvidenceRowId: alphaPlexiAfter?.evidenceRowId ?? alphaPlexi.evidenceRowId,
      plexiAmount: ALPHA_PLEXI_AMOUNT,
    },
    testCompany: {
      organizationId: testOrg.organization.organizationId,
      organizationName: TEST_COMPANY_DISPLAY_NAME,
      planeId: testOrg.plane.planeId,
      planeRoot: testOrg.paths.planeRoot,
      documentsRoot: testOrg.paths.documentsRoot,
      sellerLegalName: TEST_COMPANY_SELLER.legalName,
      customerId: testCustomers.customers[0]?.customerId ?? testSeed.customerId,
      customerName: TEST_COMPANY_CUSTOMER_NAME,
      personId: testPeople.people[0]?.personId ?? testSeed.personId,
      personName: TEST_COMPANY_PERSON_NAME,
      requestId: testRequests.overview.requests[0]?.requestId ?? testSeed.requestId,
      attachmentId: testSeed.attachmentId,
      quoteId: testSnap.quoteId,
      quoteHash: testSnap.quoteHash,
      orderId: testSnap.orderId,
      planId: testPlan.plan.planId,
      taskId: backCncTaskId(testPlan),
      costEvidenceRowId: testSeed.costEvidenceRowId,
      plexiAmount: TEST_COMPANY_PLEXI_AMOUNT,
    },
    cookies: {
      userA: cookieA,
      userB: cookieB,
      userCAlpha: userCAlpha.cookie ?? "",
      userCTest: userCTest.cookie ?? "",
      memberA: memberA.cookie ?? "",
      memberB: memberB.cookie ?? "",
    },
  };
}

export { MEMBER_PASSWORD, OWNER_PASSWORD };
