import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, PLEXIGLAS_3MM_OPAL_ID, SYNTHETIC_DEMO_SELLER } from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
  type CloudFixture,
} from "./cloud-harness.js";

/**
 * Commercial Continuity V2 · saved quote variants, the four commercial modes, approvals bound to
 * the exact variant, and the commercial journal. Synthetic SQLite planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
const productPath = `/api/products/${CANONICAL_PRODUCT_CODE}`;
const complete = {
  "root.inscription": "CCV2",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
const INTERNAL_KEYS =
  /"(internalCost|eic|eicTotal|marginAmount|markupAmount|costCompletenessIssues|triggeredRules|minimumMarginPercent|maximumNetValue|plannedCost|actualCost|bindingHash)"/;

afterEach(() => {
  resetCloudLoginAttemptGuard();
  resetAccessRateLimits();
  cleanupCloudTemps();
});

async function call(fixture: CloudFixture, cookie: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fixture.app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json | null = null;
  try {
    json = text ? (JSON.parse(text) as Json) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function organization(fixture: CloudFixture, name: string, slug: string) {
  const { organization: org, paths } = await addOrganization(fixture, name);
  await addUser(fixture, { email: `owner@${slug}.test`, password: OWNER_PASSWORD, organizationId: org.organizationId, role: "owner" });
  await addUser(fixture, { email: `member@${slug}.test`, password: MEMBER_PASSWORD, organizationId: org.organizationId, role: "member" });
  const owner = (await loginCloud(fixture.app, `owner@${slug}.test`, OWNER_PASSWORD, org.organizationId)).cookie as string;
  const member = (await loginCloud(fixture.app, `member@${slug}.test`, MEMBER_PASSWORD, org.organizationId)).cookie as string;
  expect((await call(fixture, owner, "PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  const customer = await call(fixture, owner, "POST", "/api/customers", { displayName: `Client ${name}` });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await call(fixture, owner, "POST", "/api/requests", {
    customerId,
    title: `Cerere ${name}`,
    description: "Cerere sintetică pentru continuitatea comercială.",
  });
  const requestId = String(
    (request.json?.request as Json | undefined)?.requestId ?? ((request.json?.detail as Json)?.request as Json)?.requestId,
  );
  return { org, sqlitePath: paths.sqlitePath, owner, member, customerId, requestId };
}

type Org = Awaited<ReturnType<typeof organization>>;

async function setPolicy(fixture: CloudFixture, owner: string, mode: string, rules: Json = {}) {
  const current = await call(fixture, owner, "GET", "/api/admin/offering-policy");
  const version = Number((current.json?.policy as Json).version);
  const saved = await call(fixture, owner, "POST", "/api/admin/offering-policy", { mode, rules, expectedVersion: version });
  expect(saved.status, saved.text).toBe(200);
  return saved.json?.policy as Json;
}

const variantsPath = (a: Org) => `/api/requests/${encodeURIComponent(a.requestId)}/variants`;
const variantPath = (a: Org, variantId: string) => `${variantsPath(a)}/${encodeURIComponent(variantId)}`;

async function createVariant(fixture: CloudFixture, cookie: string, a: Org, extra: Json = {}) {
  const created = await call(fixture, cookie, "POST", variantsPath(a), { productCode: CANONICAL_PRODUCT_CODE, ...extra });
  expect(created.status, created.text).toBe(201);
  return created.json?.variant as Json;
}

async function readVariant(fixture: CloudFixture, cookie: string, a: Org, variantId: string) {
  const read = await call(fixture, cookie, "GET", variantPath(a, variantId));
  expect(read.status, read.text).toBe(200);
  return { variant: read.json?.variant as Json, values: read.json?.values as Json, text: read.text };
}

async function saveValues(fixture: CloudFixture, cookie: string, a: Org, variant: Json, values: Json) {
  return call(fixture, cookie, "PATCH", variantPath(a, String(variant.variantId)), {
    expectedVersion: variant.version,
    values,
  });
}

/** Saves the complete values and confirms the variant as `cookie`. Returns the fresh variant. */
async function confirmVariant(fixture: CloudFixture, cookie: string, a: Org, variant: Json, values: Json = complete) {
  const saved = await saveValues(fixture, cookie, a, variant, values);
  expect(saved.status, saved.text).toBe(200);
  const current = saved.json?.variant as Json;
  const preview = await call(fixture, cookie, "POST", `${productPath}/preview`, { values });
  const reviewId = String(preview.json?.reviewId);
  const confirmed = await call(fixture, cookie, "POST", `${productPath}/confirm`, {
    variantId: current.variantId,
    expectedVersion: current.version,
    reviewId,
  });
  expect(confirmed.status, confirmed.text).toBe(200);
  return { confirmBody: confirmed.json as Json, confirmText: confirmed.text, ...(await readVariant(fixture, cookie, a, String(current.variantId))) };
}

async function setPrice(fixture: CloudFixture, cookie: string, a: Org, variant: Json, netPrice: number | null) {
  return call(fixture, cookie, "PUT", `${variantPath(a, String(variant.variantId))}/price`, {
    expectedVersion: variant.version,
    netPrice,
  });
}

async function issue(fixture: CloudFixture, cookie: string, variant: Json) {
  return call(fixture, cookie, "POST", `${productPath}/quote-snapshots`, {
    variantId: variant.variantId,
    expectedVersion: variant.version,
  });
}

async function requestApproval(fixture: CloudFixture, cookie: string, variant: Json, note?: string) {
  return call(fixture, cookie, "POST", `${productPath}/price-approval-requests`, {
    variantId: variant.variantId,
    expectedVersion: variant.version,
    ...(note ? { approvalNote: note } : {}),
  });
}

async function decide(fixture: CloudFixture, owner: string, a: Org, variantId: string, decision: "APPROVED" | "REJECTED", reason?: string) {
  const seen = await readVariant(fixture, owner, a, variantId);
  const approvalId = String((seen.variant.approval as Json).approvalId);
  return call(fixture, owner, "POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, {
    decision,
    ...(reason ? { reason } : {}),
  });
}

describe("saved quote variants", () => {
  it("keeps the product choice and the technical values on the request, for another user to continue", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Persistenta", "persist");
    const created = await createVariant(fixture, a.member, a);
    expect(created).toMatchObject({ indexLabel: "01", state: "IN_PROGRESS", action: "CONTINUE", version: 1 });
    expect(Number(created.missingCount)).toBeGreaterThan(0);

    // A partial save is kept as it is; nothing has to be frozen for it to persist.
    const partial = await saveValues(fixture, a.member, a, created, { "root.inscription": "PARTIAL" });
    expect(partial.status, partial.text).toBe(200);
    expect((partial.json?.variant as Json).state).toBe("IN_PROGRESS");

    // The Owner, in another session, finds exactly what the Comercial left.
    const seen = await readVariant(fixture, a.owner, a, String(created.variantId));
    expect(seen.values).toEqual({ "root.inscription": "PARTIAL" });
    expect(seen.variant.inscription).toBe("PARTIAL");
    expect(seen.variant.updatedByLabel).toBe("member@persist.test");

    const confirmed = await confirmVariant(fixture, a.owner, a, seen.variant);
    expect(confirmed.variant).toMatchObject({ state: "AWAITING_PRICE" });
    expect(confirmed.variant.confirmation).toMatchObject({ confirmedByLabel: "owner@persist.test", valid: true });

    // The confirmation survives a new connection to the same plane.
    const direct = new Database(a.sqlitePath, { readonly: true });
    const row = direct
      .prepare("SELECT confirmed_review_id, confirmed_by_label, draft_values FROM commercial_request_variants WHERE variant_id = ?")
      .get(String(created.variantId)) as { confirmed_review_id: string | null; confirmed_by_label: string; draft_values: string };
    direct.close();
    expect(row.confirmed_review_id).toBeTruthy();
    expect(JSON.parse(row.draft_values)).toEqual(complete);
    fixture.close();
  });

  it("refuses a stale write and names who changed the variant; nothing is overwritten", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Conflict", "conflict");
    const created = await createVariant(fixture, a.member, a);
    const first = await saveValues(fixture, a.owner, a, created, { "root.inscription": "OWNER" });
    expect(first.status).toBe(200);
    const stale = await saveValues(fixture, a.member, a, created, { "root.inscription": "MEMBER" });
    expect(stale.status).toBe(409);
    expect(stale.json?.error).toBe("version_conflict");
    expect((stale.json?.current as Json).updatedByLabel).toBe("owner@conflict.test");
    expect((await readVariant(fixture, a.member, a, String(created.variantId))).values).toEqual({ "root.inscription": "OWNER" });
    // A write without a version is not accepted at all.
    const blind = await call(fixture, a.member, "PATCH", variantPath(a, String(created.variantId)), { values: {} });
    expect(blind.status).toBe(400);
    fixture.close();
  });

  it("clears the confirmation when a technical value changes and keeps the price for the earlier configuration", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Schimbare", "schimb");
    const confirmed = await confirmVariant(fixture, a.owner, a, await createVariant(fixture, a.owner, a));
    const priced = await setPrice(fixture, a.owner, a, confirmed.variant, 900);
    expect(priced.status, priced.text).toBe(200);
    const withPrice = priced.json?.variant as Json;
    expect(withPrice).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });

    const changed = await saveValues(fixture, a.owner, a, withPrice, { ...complete, "volume.depthMm": "30" });
    expect(changed.status, changed.text).toBe(200);
    const after = changed.json?.variant as Json;
    expect(after.state).toBe("READY_TO_VERIFY");
    expect(after.confirmation).toBeNull();
    // Issuing with the old price is refused until the configuration is confirmed again.
    const refused = await issue(fixture, a.owner, after);
    expect(refused.status).toBe(422);
    expect(refused.json?.error).toBe("variant_not_confirmed");

    const reconfirmed = await confirmVariant(fixture, a.owner, a, after, { ...complete, "volume.depthMm": "30" });
    expect(reconfirmed.variant.state).toBe("AWAITING_PRICE");
    expect((reconfirmed.variant.price as Json).forConfirmedConfiguration).toBe(false);
    const stillRefused = await issue(fixture, a.owner, reconfirmed.variant);
    expect(stillRefused.status).toBe(409);
    expect(stillRefused.json?.error).toBe("price_for_previous_configuration");
    fixture.close();
  });

  it("issues the frozen quote from the stored variant and locks the variant", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Emitere", "emit");
    const confirmed = await confirmVariant(fixture, a.owner, a, await createVariant(fixture, a.owner, a));
    const priced = (await setPrice(fixture, a.owner, a, confirmed.variant, 750)).json?.variant as Json;
    // Values sent by the client are ignored: the server issues what it stores.
    const frozen = await call(fixture, a.owner, "POST", `${productPath}/quote-snapshots`, {
      variantId: priced.variantId,
      expectedVersion: priced.version,
      values: { "root.inscription": "FORGED" },
      manualProductNetPrice: 1,
    });
    expect(frozen.status, frozen.text).toBe(200);
    const snapshot = frozen.json?.quoteSnapshot as Json;
    expect(snapshot.inscription).toBe("CCV2");
    expect(frozen.text).toContain("750");
    const issued = await readVariant(fixture, a.owner, a, String(priced.variantId));
    expect(issued.variant).toMatchObject({ state: "ISSUED", action: "OPEN_QUOTE", quoteSnapshotId: snapshot.quoteSnapshotId });
    // An issued variant accepts no further write.
    const late = await saveValues(fixture, a.owner, a, issued.variant, { ...complete, "root.inscription": "LATE" });
    expect(late.status).toBe(409);
    expect(late.json?.error).toBe("variant_issued");
    const again = await issue(fixture, a.owner, issued.variant);
    expect(again.status).toBe(409);
    // The request holds the quote exactly as before V2.
    const detail = await call(fixture, a.owner, "GET", `/api/requests/${encodeURIComponent(a.requestId)}`);
    expect(JSON.stringify(detail.json)).toContain(String(snapshot.quoteSnapshotId));
    fixture.close();
  });

  it("copies technical values into an alternative, never the price, confirmation or approval", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Alternative", "alt");
    const origin = await confirmVariant(fixture, a.owner, a, await createVariant(fixture, a.owner, a));
    await setPrice(fixture, a.owner, a, origin.variant, 800);
    const alternative = await createVariant(fixture, a.owner, a, { copyFromVariantId: origin.variant.variantId });
    expect(alternative).toMatchObject({ indexLabel: "02", state: "READY_TO_VERIFY", price: null, confirmation: null });
    expect(alternative.alternativeOf).toMatchObject({ variantId: origin.variant.variantId, indexLabel: "01" });
    expect((await readVariant(fixture, a.owner, a, String(alternative.variantId))).values).toEqual(complete);
    // A second, independent product of the same request is not an alternative.
    const independent = await createVariant(fixture, a.owner, a);
    expect(independent).toMatchObject({ indexLabel: "03", alternativeOf: null });
    const list = await call(fixture, a.owner, "GET", variantsPath(a));
    expect((list.json?.variants as Json[]).map((item) => item.indexLabel)).toEqual(["01", "02", "03"]);
    fixture.close();
  });

  it("withdraws and resumes a variant without deleting it", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Retragere", "retr");
    const created = await createVariant(fixture, a.member, a);
    const withdrawn = await call(fixture, a.member, "POST", `${variantPath(a, String(created.variantId))}/lifecycle`, {
      expectedVersion: created.version,
      lifecycle: "WITHDRAWN",
    });
    expect((withdrawn.json?.variant as Json)).toMatchObject({ state: "WITHDRAWN", action: "RESUME" });
    const blocked = await saveValues(fixture, a.member, a, withdrawn.json?.variant as Json, complete);
    expect(blocked.status).toBe(409);
    const resumed = await call(fixture, a.member, "POST", `${variantPath(a, String(created.variantId))}/lifecycle`, {
      expectedVersion: (withdrawn.json?.variant as Json).version,
      lifecycle: "ACTIVE",
    });
    expect((resumed.json?.variant as Json).state).toBe("IN_PROGRESS");
    fixture.close();
  });
});

describe("the four commercial modes on a saved variant", () => {
  it("Doar Proprietarul: the Comercial configures and hands over; no price field, no issue", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Restrans", "restrans");
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    expect(confirmed.variant).toMatchObject({ state: "AWAITING_PRICE", action: "OPEN", canSetPrice: false, priceVisible: false });
    expect(confirmed.confirmText).not.toMatch(INTERNAL_KEYS);
    expect((await setPrice(fixture, a.member, a, confirmed.variant, 500)).status).toBe(403);
    expect((await issue(fixture, a.member, confirmed.variant)).status).toBe(422);

    // The Owner continues without re-entering a single technical value.
    const owner = await readVariant(fixture, a.owner, a, String(confirmed.variant.variantId));
    expect(owner.variant).toMatchObject({ state: "AWAITING_PRICE", action: "SET_PRICE" });
    expect(owner.values).toEqual(complete);
    const priced = (await setPrice(fixture, a.owner, a, owner.variant, 640)).json?.variant as Json;
    expect(priced).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });
    // The Comercial still does not see the price before the quote is issued.
    const hidden = await readVariant(fixture, a.member, a, String(priced.variantId));
    expect(hidden.variant.price).toBeNull();
    expect(hidden.text).not.toContain("640");
    const frozen = await issue(fixture, a.owner, priced);
    expect(frozen.status, frozen.text).toBe(200);
    // Owner under the platform default: byte-for-byte pre-V1 quote, no offering record.
    expect((frozen.json?.quoteSnapshot as Json).offering).toBeUndefined();
    fixture.close();
  });

  it("Control total: every Comercial quote needs the Owner, whatever its value; the Owner never self-approves", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Control", "control");
    const policy = await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { everyOfferRequiresApproval: true });
    expect(policy).toMatchObject({ mode: "COMMERCIAL_APPROVAL_POLICY", controlMode: "CONTROL_TOTAL", controlModeLabel: "Control total" });

    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    // A small price with a large margin still needs approval.
    const priced = await setPrice(fixture, a.member, a, confirmed.variant, 5000);
    expect(priced.status, priced.text).toBe(200);
    const proposed = priced.json?.variant as Json;
    expect(proposed).toMatchObject({ state: "PRICE_PROPOSED", action: "REQUEST_APPROVAL" });
    expect(((proposed.offering as Json).outcome as Json).message).toBe(
      "În această firmă, fiecare ofertă este aprobată de Proprietar înainte de emitere.",
    );
    expect(priced.text).not.toMatch(INTERNAL_KEYS);
    const direct = await issue(fixture, a.member, proposed);
    expect(direct.status).toBe(409);
    expect(direct.json?.error).toBe("price_approval_required");

    const asked = await requestApproval(fixture, a.member, proposed, "Client vechi.");
    expect(asked.status, asked.text).toBe(201);
    const waiting = await readVariant(fixture, a.member, a, String(proposed.variantId));
    expect(waiting.variant).toMatchObject({ state: "AWAITING_APPROVAL", action: "OPEN" });
    expect((waiting.variant.approval as Json).approvalId).toBeNull();

    const ownerView = await readVariant(fixture, a.owner, a, String(proposed.variantId));
    expect(ownerView.variant).toMatchObject({ state: "AWAITING_APPROVAL", action: "DECIDE_APPROVAL" });
    expect((ownerView.variant.approval as Json).requestNote).toBe("Client vechi.");
    const approved = await decide(fixture, a.owner, a, String(proposed.variantId), "APPROVED");
    expect(approved.status, approved.text).toBe(200);
    const ready = await readVariant(fixture, a.member, a, String(proposed.variantId));
    expect(ready.variant).toMatchObject({ state: "PRICE_APPROVED", action: "ISSUE" });
    const frozen = await issue(fixture, a.member, ready.variant);
    expect(frozen.status, frozen.text).toBe(200);
    const offering = (frozen.json?.quoteSnapshot as Json).offering as Json;
    expect(offering).toMatchObject({ pricedByRole: "member" });
    expect(offering.approval).toBeTruthy();

    // The Owner prices and issues a variant of their own with no request and no approval.
    const own = await confirmVariant(fixture, a.owner, a, await createVariant(fixture, a.owner, a));
    const ownPriced = (await setPrice(fixture, a.owner, a, own.variant, 300)).json?.variant as Json;
    expect(ownPriced).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });
    expect((await issue(fixture, a.owner, ownPriced)).status).toBe(200);
    fixture.close();
  });

  it("Control total: an approval goes stale on any change, names the cause, and is never reused", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Caduc", "caduc");
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { everyOfferRequiresApproval: true });
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const proposed = (await setPrice(fixture, a.member, a, confirmed.variant, 900)).json?.variant as Json;
    expect((await requestApproval(fixture, a.member, proposed)).status).toBe(201);
    expect((await decide(fixture, a.owner, a, String(proposed.variantId), "APPROVED")).status).toBe(200);
    const approved = (await readVariant(fixture, a.member, a, String(proposed.variantId))).variant;
    expect(approved.state).toBe("PRICE_APPROVED");

    // (a) product price by 1 EUR
    const repriced = (await setPrice(fixture, a.member, a, approved, 901)).json?.variant as Json;
    expect(repriced).toMatchObject({ state: "APPROVAL_STALE", action: "REQUEST_APPROVAL" });
    expect((repriced.approval as Json).staleCause).toBe("PRODUCT_PRICE");
    const refused = await issue(fixture, a.member, repriced);
    expect(refused.status).toBe(409);
    expect(refused.json?.error).toBe("price_approval_required");

    // A new request is a new record; the old approval stays decided in the history.
    expect((await requestApproval(fixture, a.member, repriced)).status).toBe(201);
    const pending = (await readVariant(fixture, a.owner, a, String(proposed.variantId))).variant;
    expect(pending.state).toBe("AWAITING_APPROVAL");

    // (b) the policy changes while the request is open
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 100 });
    const afterPolicy = (await readVariant(fixture, a.member, a, String(proposed.variantId))).variant;
    expect(afterPolicy.state).toBe("APPROVAL_STALE");
    expect((afterPolicy.approval as Json).staleCause).toBe("POLICY");
    // The Owner cannot approve the request that no longer matches the variant.
    const late = await decide(fixture, a.owner, a, String(proposed.variantId), "APPROVED");
    expect(late.status).toBe(409);
    expect(late.json?.error).toBe("approval_stale");

    // (c) a technical value changes after a fresh approval
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { everyOfferRequiresApproval: true });
    const fresh = (await readVariant(fixture, a.member, a, String(proposed.variantId))).variant;
    expect((await requestApproval(fixture, a.member, fresh)).status).toBe(201);
    expect((await decide(fixture, a.owner, a, String(proposed.variantId), "APPROVED")).status).toBe(200);
    const reApproved = (await readVariant(fixture, a.member, a, String(proposed.variantId))).variant;
    expect(reApproved.state).toBe("PRICE_APPROVED");
    const edited = (await saveValues(fixture, a.member, a, reApproved, { ...complete, "volume.depthMm": "30" })).json?.variant as Json;
    expect(edited.state).toBe("READY_TO_VERIFY");
    expect((edited.approval as Json)).toMatchObject({ status: "STALE", staleCause: "CONFIGURATION" });
    fixture.close();
  });

  it("Control total: a rejection carries its reason and the same offer cannot be asked again", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Respins", "respins");
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { everyOfferRequiresApproval: true });
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const proposed = (await setPrice(fixture, a.member, a, confirmed.variant, 420)).json?.variant as Json;
    expect((await requestApproval(fixture, a.member, proposed)).status).toBe(201);
    expect((await decide(fixture, a.owner, a, String(proposed.variantId), "REJECTED")).status).toBe(400);
    expect((await decide(fixture, a.owner, a, String(proposed.variantId), "REJECTED", "Preț prea mic.")).status).toBe(200);
    const rejected = (await readVariant(fixture, a.member, a, String(proposed.variantId))).variant;
    expect(rejected).toMatchObject({ state: "REJECTED", action: "OPEN" });
    expect((rejected.approval as Json).decisionReason).toBe("Preț prea mic.");
    expect((await requestApproval(fixture, a.member, rejected)).status).toBe(409);
    expect((await issue(fixture, a.member, rejected)).status).toBe(409);
    fixture.close();
  });

  it("Control pe reguli: issues within the limits, asks approval for an exception, discloses no rule", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Reguli", "reguli");
    const policy = await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 1000 });
    expect(policy.controlMode).toBe("CONTROL_BY_RULES");

    const within = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const cheap = (await setPrice(fixture, a.member, a, within.variant, 800)).json?.variant as Json;
    expect(cheap).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });
    expect((await issue(fixture, a.member, cheap)).status).toBe(200);

    const over = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const pricedOver = await setPrice(fixture, a.member, a, over.variant, 1500);
    const exception = pricedOver.json?.variant as Json;
    expect(exception).toMatchObject({ state: "PRICE_PROPOSED", action: "REQUEST_APPROVAL" });
    expect(pricedOver.text).not.toMatch(INTERNAL_KEYS);
    expect(pricedOver.text).not.toContain("1000");
    expect((await issue(fixture, a.member, exception)).status).toBe(409);
    // After the price returns within the limits, no approval is needed.
    const back = (await setPrice(fixture, a.member, a, exception, 900)).json?.variant as Json;
    expect(back).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });
    expect((await issue(fixture, a.member, back)).status).toBe(200);
    fixture.close();
  });

  it("Autonomie comercială: the Comercial prices and issues alone; the trail names who did it", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Autonomie", "auto");
    expect((await setPolicy(fixture, a.owner, "COMMERCIAL_AUTONOMOUS")).controlMode).toBe("COMMERCIAL_AUTONOMY");
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const priced = await setPrice(fixture, a.member, a, confirmed.variant, 5000);
    expect(priced.json?.variant).toMatchObject({ state: "PRICE_SET", action: "ISSUE" });
    expect(priced.text).not.toMatch(INTERNAL_KEYS);
    const frozen = await issue(fixture, a.member, priced.json?.variant as Json);
    expect(frozen.status, frozen.text).toBe(200);
    expect(frozen.text).not.toMatch(INTERNAL_KEYS);
    expect(((frozen.json?.quoteSnapshot as Json).offering as Json)).toMatchObject({ pricedByRole: "member" });
    const direct = new Database(a.sqlitePath, { readonly: true });
    const kinds = (
      direct
        .prepare("SELECT event_kind, actor_label FROM commercial_request_variant_events ORDER BY rowid")
        .all() as { event_kind: string; actor_label: string }[]
    ).map((row) => `${row.event_kind}:${row.actor_label}`);
    direct.close();
    expect(kinds).toEqual([
      "CREATED:member@auto.test",
      "VALUES_SAVED:member@auto.test",
      "CONFIRMED:member@auto.test",
      "PRICE_SET:member@auto.test",
      "ISSUED:member@auto.test",
    ]);
    fixture.close();
  });

  it("never moves an organization between modes on its own: no stored policy stays Doar Proprietarul", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Veche", "veche");
    const admin = await call(fixture, a.owner, "GET", "/api/admin/offering-policy");
    expect(admin.json?.policy).toMatchObject({ mode: "OWNER_ONLY", controlMode: "OWNER_ONLY", version: 0, source: "PLATFORM_DEFAULT" });
    expect((admin.json?.controlModes as Json[]).map((item) => item.controlMode)).toEqual([
      "OWNER_ONLY",
      "CONTROL_TOTAL",
      "CONTROL_BY_RULES",
      "COMMERCIAL_AUTONOMY",
    ]);
    const direct = new Database(a.sqlitePath, { readonly: true });
    expect((direct.prepare("SELECT COUNT(*) AS n FROM organization_offering_policy_versions").get() as { n: number }).n).toBe(0);
    direct.close();
    // The approval mode still needs a rule: an empty one is refused (fail-closed).
    const empty = await call(fixture, a.owner, "POST", "/api/admin/offering-policy", {
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: {},
      expectedVersion: 0,
    });
    expect(empty.status).toBe(400);
    fixture.close();
  });
});

describe("commercial journal", () => {
  it("records a budget and a discussed price without creating or changing an official price", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Jurnal", "jurnal");
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const journalPath = `/api/requests/${encodeURIComponent(a.requestId)}/journal`;

    const budget = await call(fixture, a.member, "POST", journalPath, {
      kind: "CUSTOMER_BUDGET",
      channel: "MEETING",
      amountMax: 1800,
      currency: "EUR",
      notes: "Vrea montaj inclus.",
    });
    expect(budget.status, budget.text).toBe(201);
    const discussed = await call(fixture, a.member, "POST", journalPath, {
      kind: "DISCUSSED_PRICE",
      channel: "PHONE",
      interlocutor: "Dan Marin, administrator",
      amountMin: 1400,
      amountMax: 1500,
      currency: "EUR",
      vatBasis: "NET",
      variantId: confirmed.variant.variantId,
    });
    expect(discussed.status, discussed.text).toBe(201);
    expect(discussed.text).not.toMatch(INTERNAL_KEYS);
    const entries = discussed.json?.entries as Json[];
    expect(entries.map((entry) => entry.kindLabel)).toEqual(["Buget client", "Preț discutat"]);
    expect(entries[1]).toMatchObject({ binding: "fără angajament", variantIndexLabel: "01", vatBasisLabel: "fără TVA" });

    // In Doar Proprietarul the Comercial wrote amounts in the journal and still has no price.
    const after = await readVariant(fixture, a.member, a, String(confirmed.variant.variantId));
    expect(after.variant).toMatchObject({ state: "AWAITING_PRICE", canSetPrice: false, price: null });
    expect(after.variant.version).toBe(confirmed.variant.version);
    expect((await issue(fixture, a.member, after.variant)).status).toBe(422);
    const direct = new Database(a.sqlitePath, { readonly: true });
    expect(
      (direct.prepare("SELECT product_net_price FROM commercial_request_variants").get() as { product_net_price: number | null })
        .product_net_price,
    ).toBeNull();
    direct.close();

    // The Owner sees both entries; the official steps appear as application events.
    const priced = (await setPrice(fixture, a.owner, a, after.variant, 1450)).json?.variant as Json;
    expect((await issue(fixture, a.owner, priced)).status).toBe(200);
    const ownerJournal = await call(fixture, a.owner, "GET", journalPath);
    expect((ownerJournal.json?.officialEvents as Json[]).map((event) => event.kind)).toEqual(["PRICE_SET", "QUOTE_ISSUED"]);
    fixture.close();
  });

  it("validates entries and corrects by adding, never by rewriting", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Rectificare", "rect");
    const journalPath = `/api/requests/${encodeURIComponent(a.requestId)}/journal`;
    expect((await call(fixture, a.member, "POST", journalPath, { kind: "DISCUSSION", channel: "EMAIL" })).status).toBe(400);
    expect(
      (await call(fixture, a.member, "POST", journalPath, { kind: "CUSTOMER_BUDGET", channel: "PHONE", currency: "EUR" })).status,
    ).toBe(400);
    expect(
      (await call(fixture, a.member, "POST", journalPath, { kind: "DISCUSSION", channel: "PHONE", notes: "x", amountMax: 5 })).status,
    ).toBe(400);
    const wrong = await call(fixture, a.member, "POST", journalPath, {
      kind: "CUSTOMER_BUDGET",
      channel: "PHONE",
      amountMax: 18000,
      currency: "EUR",
    });
    expect(wrong.status).toBe(201);
    const wrongId = String(wrong.json?.entryId);
    const fixed = await call(fixture, a.owner, "POST", journalPath, {
      kind: "CUSTOMER_BUDGET",
      channel: "PHONE",
      amountMax: 1800,
      currency: "EUR",
      rectifies: { entryId: wrongId, reason: "Un zero în plus." },
    });
    expect(fixed.status, fixed.text).toBe(201);
    const entries = fixed.json?.entries as Json[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ entryId: wrongId, amountMax: 18000 });
    expect((entries[0].rectifiedBy as Json).authorLabel).toBe("owner@rect.test");
    expect(entries[1]).toMatchObject({ rectifiesEntryId: wrongId, rectificationReason: "Un zero în plus.", amountMax: 1800 });
    // The stored row cannot be changed or removed, even directly.
    const direct = new Database(a.sqlitePath);
    expect(() => direct.prepare("UPDATE commercial_request_journal_entries SET amount_max = 1").run()).toThrow(/append-only/);
    expect(() => direct.prepare("DELETE FROM commercial_request_journal_entries").run()).toThrow(/append-only/);
    direct.close();
    fixture.close();
  });
});

describe("isolation", () => {
  it("answers 404 for another organization's request, variant and journal", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma A", "tenant-a");
    const b = await organization(fixture, "Firma B", "tenant-b");
    const created = await createVariant(fixture, a.owner, a);
    expect((await call(fixture, b.owner, "GET", variantsPath(a))).status).toBe(404);
    expect((await call(fixture, b.owner, "GET", variantPath(a, String(created.variantId)))).status).toBe(404);
    expect((await call(fixture, b.owner, "POST", variantsPath(a), { productCode: CANONICAL_PRODUCT_CODE })).status).toBe(404);
    expect((await call(fixture, b.owner, "GET", `/api/requests/${encodeURIComponent(a.requestId)}/journal`)).status).toBe(404);
    // A variant id from A used through B's own request path is not found either.
    expect((await call(fixture, b.owner, "GET", variantPath(b, String(created.variantId)))).status).toBe(404);
    const foreign = await call(fixture, b.owner, "POST", `${productPath}/quote-snapshots`, {
      variantId: created.variantId,
      expectedVersion: 1,
    });
    expect(foreign.status).toBe(404);
    fixture.close();
  });

  it("refuses the scoped roles on variants and journal", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
    const a = await organization(fixture, "Firma Roluri", "roluri");
    await addUser(fixture, { email: "prod@roluri.test", password: MEMBER_PASSWORD, organizationId: a.org.organizationId, role: "production" });
    await addUser(fixture, { email: "atelier@roluri.test", password: MEMBER_PASSWORD, organizationId: a.org.organizationId, role: "workshop" });
    const production = (await loginCloud(fixture.app, "prod@roluri.test", MEMBER_PASSWORD, a.org.organizationId)).cookie as string;
    const workshop = (await loginCloud(fixture.app, "atelier@roluri.test", MEMBER_PASSWORD, a.org.organizationId)).cookie as string;
    const created = await createVariant(fixture, a.owner, a);
    for (const cookie of [production, workshop]) {
      expect((await call(fixture, cookie, "GET", variantsPath(a))).status).toBe(403);
      expect((await call(fixture, cookie, "GET", variantPath(a, String(created.variantId)))).status).toBe(403);
      expect((await call(fixture, cookie, "POST", variantsPath(a), { productCode: CANONICAL_PRODUCT_CODE })).status).toBe(403);
      expect((await call(fixture, cookie, "GET", `/api/requests/${encodeURIComponent(a.requestId)}/journal`)).status).toBe(403);
    }
    fixture.close();
  });
});

describe("request journey", () => {
  it("stops asking for a product once a variant is saved, in the detail and in the register", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Parcurs", "parcurs");
    const detailPath = `/api/requests/${encodeURIComponent(a.requestId)}`;
    const before = (await call(fixture, a.owner, "GET", detailPath)).json as Json;
    const beforeDetail = (before.detail ?? before) as Json;
    expect(beforeDetail.nextAction).toBe("CHOOSE_PRODUCT");

    const created = await createVariant(fixture, a.member, a);
    const read = async () => {
      const body = (await call(fixture, a.owner, "GET", detailPath)).json as Json;
      return (body.detail ?? body) as Json;
    };
    expect(await read()).toMatchObject({ nextAction: "OPEN_REQUEST", nextActionLabel: "Continuă configurarea" });
    const confirmed = await confirmVariant(fixture, a.member, a, created);
    expect(await read()).toMatchObject({ nextAction: "OPEN_REQUEST", nextActionLabel: "Așteaptă prețul" });
    const priced = (await setPrice(fixture, a.owner, a, (await readVariant(fixture, a.owner, a, String(confirmed.variant.variantId))).variant, 500))
      .json?.variant as Json;
    expect((await read()).nextActionLabel).toBe("Preț pregătit · deschide varianta");
    // The register reads the same journey.
    const overview = (await call(fixture, a.owner, "GET", "/api/requests")).text;
    expect(overview).toContain("Preț pregătit · deschide varianta");
    expect(overview).not.toContain("Alege produsul");
    // After issuing, the journey is the quote's, exactly as before V2.
    expect((await issue(fixture, a.owner, priced)).status).toBe(200);
    expect((await read()).nextAction).not.toBe("CHOOSE_PRODUCT");
    fixture.close();
  });
});

describe("migration 054", () => {
  it("is additive: an earlier approval policy row reads unchanged and is not Control total", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Migrare", "migrare");
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 1000 });
    const direct = new Database(a.sqlitePath, { readonly: true });
    const row = direct
      .prepare("SELECT mode, every_offer_requires_approval AS every_offer FROM organization_offering_policy_versions")
      .get() as { mode: string; every_offer: number };
    const columns = (direct.prepare("PRAGMA table_info(commercial_price_approvals)").all() as { name: string }[]).map((c) => c.name);
    const applied = (direct.prepare("SELECT id FROM schema_migrations WHERE id LIKE '054%'").all() as { id: string }[]).map((r) => r.id);
    direct.close();
    expect(row).toEqual({ mode: "COMMERCIAL_APPROVAL_POLICY", every_offer: 0 });
    expect(columns).toContain("variant_id");
    expect(applied).toEqual(["054_commercial_continuity_v2.sql"]);
    fixture.close();
  });
});

describe("compatibility", () => {
  it("refuses the legacy freeze once the request already has a saved variant", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Guard", "guard");
    await createVariant(fixture, a.owner, a);
    const preview = await call(fixture, a.owner, "POST", `${productPath}/preview`, { values: complete });
    const frozen = await call(fixture, a.owner, "POST", `${productPath}/quote-snapshots`, {
      values: complete,
      reviewId: String(preview.json?.reviewId),
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(frozen.status).toBe(409);
    expect(frozen.json?.error).toBe("variant_required");
    fixture.close();
  });

  it("asks for confirmation before accepting an alternative of an ordered offer", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma F29", "f29");
    const origin = await confirmVariant(fixture, a.owner, a, await createVariant(fixture, a.owner, a));
    const originPriced = (await setPrice(fixture, a.owner, a, origin.variant, 800)).json?.variant as Json;
    const originIssued = await issue(fixture, a.owner, originPriced);
    expect(originIssued.status, originIssued.text).toBe(200);
    const originQuote = originIssued.json?.quoteSnapshot as Json;
    const originOrdered = await call(
      fixture,
      a.owner,
      "POST",
      `${productPath}/quote-snapshots/${encodeURIComponent(String(originQuote.quoteSnapshotId))}/confirm-order`,
    );
    expect(originOrdered.status, originOrdered.text).toBe(200);
    const originOrderId = String((originOrdered.json?.orderSnapshot as Json).orderSnapshotId);

    const alternative = await createVariant(fixture, a.owner, a, { copyFromVariantId: origin.variant.variantId });
    const confirmed = await confirmVariant(fixture, a.owner, a, alternative);
    const priced = (await setPrice(fixture, a.owner, a, confirmed.variant, 750)).json?.variant as Json;
    const issued = await issue(fixture, a.owner, priced);
    expect(issued.status, issued.text).toBe(200);
    const quote = issued.json?.quoteSnapshot as Json;
    const blocked = await call(
      fixture,
      a.owner,
      "POST",
      `${productPath}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/confirm-order`,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.json?.error).toBe("alternative_of_ordered_offer");
    const accepted = await call(
      fixture,
      a.owner,
      "POST",
      `${productPath}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/confirm-order`,
      { alternativeAcceptanceConfirmed: true },
    );
    expect(accepted.status, accepted.text).toBe(200);
    const alternativeOrderId = String((accepted.json?.orderSnapshot as Json).orderSnapshotId);
    const originRelease = await call(
      fixture,
      a.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(originOrderId)}/production-release`,
    );
    const alternativeRelease = await call(
      fixture,
      a.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(alternativeOrderId)}/production-release`,
    );
    expect(originRelease.status, originRelease.text).toBe(200);
    expect(alternativeRelease.status, alternativeRelease.text).toBe(200);
    const originPlan = await call(
      fixture,
      a.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(String((originRelease.json?.snapshot as Json).snapshotId))}/execution-plan`,
    );
    const alternativePlan = await call(
      fixture,
      a.owner,
      "POST",
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${encodeURIComponent(String((alternativeRelease.json?.snapshot as Json).snapshotId))}/execution-plan`,
    );
    expect(originPlan.status, originPlan.text).toBe(200);
    expect(alternativePlan.status, alternativePlan.text).toBe(200);
    fixture.close();
  });

  it("does not let an offering approval skip incomplete-cost acceptance", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Aprobare Cost", "aprob-cost");
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", {
      incompleteCostRequiresApproval: true,
      everyOfferRequiresApproval: true,
    });
    const db = new Database(a.sqlitePath);
    db.prepare("UPDATE resource_cost_evidence SET superseded_at = ? WHERE resource_id = ? AND superseded_at IS NULL").run(
      new Date().toISOString(),
      PLEXIGLAS_3MM_OPAL_ID,
    );
    db.close();
    const confirmed = await confirmVariant(fixture, a.member, a, await createVariant(fixture, a.member, a));
    const priced = (await setPrice(fixture, a.member, a, confirmed.variant, 700)).json?.variant as Json;
    const blockedIssue = await issue(fixture, a.member, priced);
    expect(blockedIssue.status).not.toBe(200);
    expect((await requestApproval(fixture, a.member, priced, "Cost incomplet, cer aprobare")).status).toBe(201);
    expect((await decide(fixture, a.owner, a, String(priced.variantId), "APPROVED")).status).toBe(200);
    const current = await readVariant(fixture, a.member, a, String(priced.variantId));
    const issued = await issue(fixture, a.member, current.variant);
    expect(issued.status, issued.text).toBe(200);
    const quote = issued.json?.quoteSnapshot as Json;
    const orderPath = `${productPath}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}/confirm-order`;
    const plain = await call(fixture, a.owner, "POST", orderPath);
    expect(plain.status).toBe(422);
    expect(plain.json?.error).toBe("incomplete_cost_requires_owner_acceptance");
    const memberException = await call(fixture, a.member, "POST", orderPath, {
      incompleteCostAcceptance: { confirm: true, reason: "Cost material confirmat ulterior" },
    });
    expect(memberException.status).toBe(403);
    const accepted = await call(fixture, a.owner, "POST", orderPath, {
      incompleteCostAcceptance: { confirm: true, reason: "Cost material confirmat ulterior" },
    });
    expect(accepted.status, accepted.text).toBe(200);
    fixture.close();
  });

  it("leaves the request-and-product path without a variant exactly as before", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Legacy", "legacy");
    const preview = await call(fixture, a.owner, "POST", `${productPath}/preview`, { values: complete });
    const reviewId = String(preview.json?.reviewId);
    const confirmed = await call(fixture, a.owner, "POST", `${productPath}/confirm`, {
      values: complete,
      reviewId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(confirmed.status, confirmed.text).toBe(200);
    expect(confirmed.json?.variant).toBeUndefined();
    const frozen = await call(fixture, a.owner, "POST", `${productPath}/quote-snapshots`, {
      values: complete,
      reviewId,
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(frozen.status, frozen.text).toBe(200);
    expect((await call(fixture, a.owner, "GET", variantsPath(a))).json?.variants).toEqual([]);
    fixture.close();
  });
});
