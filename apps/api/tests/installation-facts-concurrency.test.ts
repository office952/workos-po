import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  SITE_INSTALLATION_SCOPE_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { getInstallationFacts } from "../src/requests/installationFacts.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function completeFacts() {
  return {
    street: "Strada Fabricii 10",
    city: "București",
    measurementStatus: "OFFICE_MEASURED",
    facadeType: "CONCRETE",
    fixingMethod: "MECHANICAL_ANCHOR",
    siteElectrical: "NOT_APPLICABLE",
  };
}

function factsPayload(patch: Record<string, unknown>, expectedVersion: number) {
  return JSON.stringify({ ...patch, expectedVersion });
}

async function enableSiteInstallation(
  app: ReturnType<typeof createApp>,
  offerMode = "INTERNAL",
) {
  const response = await app.request("/api/operational-services/SITE_INSTALLATION", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offerMode }),
  });
  expect(response.status).toBe(200);
}

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return (await readBody(created)).customer as JsonObject;
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  customerId: string,
  title: string,
) {
  return app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId,
      title,
      description: "Clientul a cerut o ofertă.",
    }),
  });
}

function orphanFactsCount(sqlitePath: string): number {
  const db = openSqliteDatabase(sqlitePath);
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM commercial_request_installation_facts facts
      WHERE NOT EXISTS (
        SELECT 1
        FROM commercial_request_optional_scopes scopes
        WHERE scopes.request_id = facts.request_id
          AND scopes.scope_id = ?
      )
    `,
    )
    .get(SITE_INSTALLATION_SCOPE_ID) as { count: number };
  db.close();
  return row.count;
}

function quoteCount(sqlitePath: string): number {
  const db = openSqliteDatabase(sqlitePath);
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM quote_snapshots")
    .get() as { count: number };
  const orders = db
    .prepare("SELECT COUNT(*) AS count FROM order_snapshots")
    .get() as { count: number };
  db.close();
  return row.count + orders.count;
}

function requestLinkCount(sqlitePath: string, requestId: string): number {
  const db = openSqliteDatabase(sqlitePath);
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM commercial_request_quote_links
      WHERE request_id = ?
    `,
    )
    .get(requestId) as { count: number };
  db.close();
  return row.count;
}

function orphanLinkCount(sqlitePath: string): number {
  const db = openSqliteDatabase(sqlitePath);
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM commercial_request_quote_links links
      WHERE EXISTS (
        SELECT 1
        FROM commercial_request_optional_scopes scopes
        WHERE scopes.request_id = links.request_id
          AND scopes.scope_id = ?
      )
    `,
    )
    .get(SITE_INSTALLATION_SCOPE_ID) as { count: number };
  db.close();
  return row.count;
}

function requestCoherence(sqlitePath: string, requestId: string) {
  const db = openSqliteDatabase(sqlitePath);
  const selected = db
    .prepare(
      `
      SELECT provider_mode
      FROM commercial_request_optional_scopes
      WHERE request_id = ? AND scope_id = ?
    `,
    )
    .get(requestId, SITE_INSTALLATION_SCOPE_ID) as
    | { provider_mode: string | null }
    | undefined;
  const facts = getInstallationFacts(db, requestId);
  const links = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM commercial_request_quote_links
      WHERE request_id = ?
    `,
    )
    .get(requestId) as { count: number };
  db.close();
  return {
    selected: selected !== undefined,
    mode: selected?.provider_mode ?? null,
    facts,
    linkCount: links.count,
  };
}

function expectCoherentRequest(sqlitePath: string, requestId: string) {
  expect(orphanFactsCount(sqlitePath)).toBe(0);
  expect(orphanLinkCount(sqlitePath)).toBe(0);
  const state = requestCoherence(sqlitePath, requestId);
  if (!state.selected) {
    expect(state.facts).toBeNull();
    expect(state.mode).toBeNull();
  }
  if (state.linkCount > 0) {
    expect(state.selected).toBe(false);
  }
  return state;
}

async function seedPairedRuntimes(
  label: string,
  options?: { selectInstallation?: boolean; saveFacts?: boolean; offerMode?: string },
) {
  const sqlitePath = join(mkdtempSync(join(tmpdir(), "os-s2-txn-")), "db.sqlite");
  const left = createProductSystemRuntime(sqlitePath);
  const right = createProductSystemRuntime(sqlitePath);
  const app = createApp({ productSystem: left });
  await enableSiteInstallation(app, options?.offerMode ?? "INTERNAL");
  const quotesBefore = quoteCount(sqlitePath);
  const customer = await createCustomer(app, `Client ${label}`);
  const created = await readBody(
    await createRequest(app, customer.customerId as string, `Cerere ${label}`),
  );
  const requestId = (created.request as JsonObject).requestId as string;
  const selectInstallation = options?.selectInstallation ?? true;
  const saveFacts = options?.saveFacts ?? selectInstallation;
  if (selectInstallation) {
    const selected = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);
  }
  if (saveFacts) {
    const saved = await app.request(`/api/requests/${requestId}/installation-facts`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: factsPayload(completeFacts(), 0),
    });
    expect(saved.status).toBe(200);
  }
  return {
    sqlitePath,
    left,
    right,
    app,
    requestId,
    customerId: customer.customerId as string,
    quotesBefore,
    close() {
      left.close();
      right.close();
    },
  };
}

async function createOrphanQuote(
  app: ReturnType<typeof createApp>,
  customerId: string,
  inscription: string,
) {
  const compile = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...lettersValues, "root.inscription": inscription },
    }),
  });
  const compiled = await readBody(compile);
  const orphan = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: compiled.definition,
      reviewId: compiled.reviewId,
      customerId,
    }),
  });
  expect(orphan.status).toBe(200);
  return ((await readBody(orphan)).quoteSnapshot as JsonObject).quoteSnapshotId as string;
}

function insertQuoteLink(sqlitePath: string, requestId: string, quoteSnapshotId: string) {
  const db = openSqliteDatabase(sqlitePath);
  db.prepare(
    `
    INSERT INTO commercial_request_quote_links (request_id, quote_snapshot_id, linked_at)
    VALUES (?, ?, ?)
  `,
  ).run(requestId, quoteSnapshotId, "2026-08-30T07:00:00.000Z");
  db.close();
}

describe("installation facts request-state transaction boundary", () => {
  it("refuses a missing request from inside the facts transaction", async () => {
    const seeded = await seedPairedRuntimes("Missing");
    const missing = seeded.right.updateInstallationFacts(
      "crq:00000000-0000-0000-0000-000000000000",
      { city: "Cluj" },
      0,
    );
    expect(missing).toEqual({ ok: false, error: "not_found" });
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("lets a facts write finish first, then deselect deletes selection and facts", async () => {
    const seeded = await seedPairedRuntimes("FactsFirst");
    const written = seeded.left.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "Curte A" },
      1,
    );
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.facts.version).toBe(2);
      expect(written.facts.accessNotes).toBe("Curte A");
    }
    const deselected = seeded.right.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [],
      confirmDeleteInstallationFacts: true,
    });
    expect(deselected.ok).toBe(true);
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationOffer.selected).toBe(false);
    expect(detail?.installationFacts).toBeNull();
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("refuses a facts write after deselect and leaves facts null", async () => {
    const seeded = await seedPairedRuntimes("DeselectFirst");
    const deselected = seeded.right.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [],
      confirmDeleteInstallationFacts: true,
    });
    expect(deselected.ok).toBe(true);
    const written = seeded.left.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "Nu trebuie" },
      1,
    );
    expect(written).toEqual({ ok: false, error: "installation_not_selected" });
    const db = openSqliteDatabase(seeded.sqlitePath);
    expect(getInstallationFacts(db, seeded.requestId)).toBeNull();
    db.close();
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationOffer.selected).toBe(false);
    expect(detail?.installationFacts).toBeNull();
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("keeps concurrent deselect versus facts on two connections unselected and without orphans", async () => {
    const seeded = await seedPairedRuntimes("ConcurrentDeselect");
    const rightApp = createApp({ productSystem: seeded.right });
    const [factsResponse, deselectResponse] = await Promise.all([
      seeded.app.request(`/api/requests/${seeded.requestId}/installation-facts`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: factsPayload({ accessNotes: "Concurent" }, 1),
      }),
      rightApp.request(`/api/requests/${seeded.requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optionalScopeIds: [],
          confirmDeleteInstallationFacts: true,
        }),
      }),
    ]);
    expect([200, 400].includes(factsResponse.status)).toBe(true);
    expect(deselectResponse.status).toBe(200);
    if (factsResponse.status === 400) {
      expect((await readBody(factsResponse)).error).toBe("installation_not_selected");
    }
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationOffer.selected).toBe(false);
    expect(detail?.installationFacts).toBeNull();
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("allows a facts write that finishes before a later quote link", async () => {
    const seeded = await seedPairedRuntimes("FactsBeforeLink");
    const written = seeded.left.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "Înainte de link" },
      1,
    );
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.facts.version).toBe(2);
    }
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "FST1",
    );
    insertQuoteLink(seeded.sqlitePath, seeded.requestId, quoteSnapshotId);
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationFacts?.accessNotes).toBe("Înainte de link");
    expect(detail?.installationFacts?.version).toBe(2);
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    seeded.close();
  });

  it("refuses a facts write after another connection links a quote", async () => {
    const seeded = await seedPairedRuntimes("LinkFirst");
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "LNK1",
    );
    insertQuoteLink(seeded.sqlitePath, seeded.requestId, quoteSnapshotId);
    const written = seeded.right.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "După link" },
      1,
    );
    expect(written).toEqual({ ok: false, error: "installation_facts_locked" });
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationFacts?.accessNotes).toBeNull();
    expect(detail?.installationFacts?.version).toBe(1);
    expect(detail?.installationFacts?.street).toBe("Strada Fabricii 10");
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    seeded.close();
  });

  it("keeps compare-and-swap on two connections: one success and one version_conflict", async () => {
    const seeded = await seedPairedRuntimes("CasTwoConn");
    const first = seeded.left.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "A" },
      1,
    );
    const second = seeded.right.updateInstallationFacts(
      seeded.requestId,
      { accessNotes: "B" },
      1,
    );
    const results = [first, second];
    const winner = results.find((result) => result.ok);
    const loser = results.find((result) => !result.ok);
    expect(winner?.ok).toBe(true);
    expect(loser).toEqual({ ok: false, error: "version_conflict" });
    if (winner && winner.ok) {
      expect(winner.facts.version).toBe(2);
      expect(["A", "B"]).toContain(winner.facts.accessNotes);
    }
    const detail = seeded.left.readRequestDetail(seeded.requestId);
    expect(detail?.installationFacts?.version).toBe(2);
    expect(detail?.installationFacts?.street).toBe("Strada Fabricii 10");
    expect(orphanFactsCount(seeded.sqlitePath)).toBe(0);
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });
});

describe("commercial request serialization closure", () => {
  it("refuses deselect without confirmation after a facts save on another connection", async () => {
    const seeded = await seedPairedRuntimes("FactsFirstNoConfirm", {
      saveFacts: false,
    });
    const written = seeded.left.updateInstallationFacts(
      seeded.requestId,
      completeFacts(),
      0,
    );
    expect(written.ok).toBe(true);
    const refused = seeded.right.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [],
    });
    expect(refused).toEqual({
      ok: false,
      error: "installation_facts_delete_confirmation_required",
    });
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    expect(state.selected).toBe(true);
    expect(state.facts?.street).toBe("Strada Fabricii 10");
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("deletes facts only when deselect confirms after a concurrent save", async () => {
    const seeded = await seedPairedRuntimes("FactsFirstConfirm", {
      saveFacts: false,
    });
    const written = seeded.left.updateInstallationFacts(
      seeded.requestId,
      completeFacts(),
      0,
    );
    expect(written.ok).toBe(true);
    const confirmed = seeded.right.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [],
      confirmDeleteInstallationFacts: true,
    });
    expect(confirmed.ok).toBe(true);
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    expect(state.selected).toBe(false);
    expect(state.facts).toBeNull();
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("does not delete a concurrent facts save without confirmation", async () => {
    const seeded = await seedPairedRuntimes("ConcurrentSaveNoConfirm", {
      saveFacts: false,
    });
    const rightApp = createApp({ productSystem: seeded.right });
    const [factsResponse, deselectResponse] = await Promise.all([
      seeded.app.request(`/api/requests/${seeded.requestId}/installation-facts`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: factsPayload(completeFacts(), 0),
      }),
      rightApp.request(`/api/requests/${seeded.requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionalScopeIds: [] }),
      }),
    ]);
    const factsBody = await readBody(factsResponse);
    const deselectBody = await readBody(deselectResponse);
    expect([200, 400].includes(factsResponse.status)).toBe(true);
    expect([200, 409].includes(deselectResponse.status)).toBe(true);
    expect(factsResponse.status === 200 && deselectResponse.status === 200).toBe(false);
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    if (factsResponse.status === 200) {
      expect(deselectBody.error).toBe("installation_facts_delete_confirmation_required");
      expect(state.selected).toBe(true);
      expect(state.facts?.street).toBe("Strada Fabricii 10");
    } else {
      expect(factsBody.error).toBe("installation_not_selected");
      expect(deselectResponse.status).toBe(200);
      expect(state.selected).toBe(false);
      expect(state.facts).toBeNull();
    }
    expect(quoteCount(seeded.sqlitePath)).toBe(seeded.quotesBefore);
    seeded.close();
  });

  it("refuses a quote link after installation is selected first", async () => {
    const seeded = await seedPairedRuntimes("SelectThenLink", {
      selectInstallation: false,
      saveFacts: false,
    });
    const selected = seeded.left.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
    });
    expect(selected.ok).toBe(true);
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "SEL1",
    );
    const linked = seeded.right.linkRequestQuote(seeded.requestId, quoteSnapshotId);
    expect(linked).toMatchObject({ ok: false, error: "incomplete_offer" });
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    expect(state.selected).toBe(true);
    expect(state.linkCount).toBe(0);
    seeded.close();
  });

  it("refuses adding installation after a quote is linked first", async () => {
    const seeded = await seedPairedRuntimes("LinkThenSelect", {
      selectInstallation: false,
      saveFacts: false,
    });
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "LNK2",
    );
    const linked = seeded.left.linkRequestQuote(seeded.requestId, quoteSnapshotId);
    expect(linked.ok).toBe(true);
    const selected = seeded.right.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
    });
    expect(selected).toEqual({ ok: false, error: "service_selection_locked" });
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    expect(state.selected).toBe(false);
    expect(state.linkCount).toBe(1);
    seeded.close();
  });

  it("serializes add installation versus quote link without an orphan link", async () => {
    const seeded = await seedPairedRuntimes("ConcurrentSelectLink", {
      selectInstallation: false,
      saveFacts: false,
    });
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "RACE",
    );
    const rightApp = createApp({ productSystem: seeded.right });
    const [selectResponse, linkResponse] = await Promise.all([
      seeded.app.request(`/api/requests/${seeded.requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
      }),
      rightApp.request(`/api/requests/${seeded.requestId}/quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteSnapshotId }),
      }),
    ]);
    expect([200, 409].includes(selectResponse.status)).toBe(true);
    expect([200, 422].includes(linkResponse.status)).toBe(true);
    expect(selectResponse.status === 200 && linkResponse.status === 200).toBe(false);
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    if (selectResponse.status === 200) {
      expect((await readBody(linkResponse)).error).toBe("incomplete_offer");
      expect(state.selected).toBe(true);
      expect(state.linkCount).toBe(0);
    } else {
      expect((await readBody(selectResponse)).error).toBe("service_selection_locked");
      expect(state.selected).toBe(false);
      expect(state.linkCount).toBe(1);
    }
    seeded.close();
  });

  it("refuses a mode change after a quote link and refuses a later link after mode change", async () => {
    const seeded = await seedPairedRuntimes("ModeThenLink", {
      selectInstallation: false,
      saveFacts: false,
      offerMode: "BOTH",
    });
    const selected = seeded.left.updateCommercialRequest(seeded.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "INTERNAL",
    });
    expect(selected.ok).toBe(true);
    const modeChanged = seeded.left.updateCommercialRequest(seeded.requestId, {
      siteInstallationMode: "SUBCONTRACTED",
    });
    expect(modeChanged.ok).toBe(true);
    if (modeChanged.ok) {
      expect(modeChanged.request.siteInstallationMode).toBe("SUBCONTRACTED");
    }
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "MODE",
    );
    const linked = seeded.right.linkRequestQuote(seeded.requestId, quoteSnapshotId);
    expect(linked).toMatchObject({ ok: false, error: "incomplete_offer" });
    expect(requestLinkCount(seeded.sqlitePath, seeded.requestId)).toBe(0);
    const locked = await seedPairedRuntimes("LinkThenMode", {
      selectInstallation: false,
      saveFacts: false,
      offerMode: "BOTH",
    });
    const lockedQuoteId = await createOrphanQuote(
      locked.app,
      locked.customerId,
      "MDLK",
    );
    expect(locked.left.linkRequestQuote(locked.requestId, lockedQuoteId).ok).toBe(true);
    expect(
      locked.right.updateCommercialRequest(locked.requestId, {
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        siteInstallationMode: "INTERNAL",
      }),
    ).toEqual({ ok: false, error: "service_selection_locked" });
    const state = expectCoherentRequest(locked.sqlitePath, locked.requestId);
    expect(state.selected).toBe(false);
    expect(state.linkCount).toBe(1);
    expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    seeded.close();
    locked.close();
  });

  it("refuses facts after a quote link and refuses a later link after a facts update", async () => {
    const afterLink = await seedPairedRuntimes("FactsAfterLink", {
      selectInstallation: false,
      saveFacts: false,
    });
    const quoteSnapshotId = await createOrphanQuote(
      afterLink.app,
      afterLink.customerId,
      "FAL1",
    );
    expect(afterLink.left.linkRequestQuote(afterLink.requestId, quoteSnapshotId).ok).toBe(
      true,
    );
    expect(
      afterLink.right.updateInstallationFacts(afterLink.requestId, completeFacts(), 0),
    ).toEqual({ ok: false, error: "installation_not_selected" });
    expectCoherentRequest(afterLink.sqlitePath, afterLink.requestId);
    afterLink.close();

    const beforeLink = await seedPairedRuntimes("FactsBeforeLinkLock");
    const updated = beforeLink.left.updateInstallationFacts(
      beforeLink.requestId,
      { accessNotes: "După salvare" },
      1,
    );
    expect(updated.ok).toBe(true);
    const laterQuoteId = await createOrphanQuote(
      beforeLink.app,
      beforeLink.customerId,
      "FBL1",
    );
    expect(
      beforeLink.right.linkRequestQuote(beforeLink.requestId, laterQuoteId),
    ).toMatchObject({ ok: false, error: "incomplete_offer" });
    const state = expectCoherentRequest(beforeLink.sqlitePath, beforeLink.requestId);
    expect(state.selected).toBe(true);
    expect(state.facts?.accessNotes).toBe("După salvare");
    expect(state.linkCount).toBe(0);
    beforeLink.close();
  });

  it("keeps request scopes facts and links coherent after concurrent facts versus quote link", async () => {
    const seeded = await seedPairedRuntimes("ConcurrentFactsLink");
    const quoteSnapshotId = await createOrphanQuote(
      seeded.app,
      seeded.customerId,
      "CFL1",
    );
    const rightApp = createApp({ productSystem: seeded.right });
    const [factsResponse, linkResponse] = await Promise.all([
      seeded.app.request(`/api/requests/${seeded.requestId}/installation-facts`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: factsPayload({ accessNotes: "Cursă facts" }, 1),
      }),
      rightApp.request(`/api/requests/${seeded.requestId}/quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteSnapshotId }),
      }),
    ]);
    expect(factsResponse.status).toBe(200);
    expect(linkResponse.status).toBe(422);
    expect((await readBody(linkResponse)).error).toBe("incomplete_offer");
    const state = expectCoherentRequest(seeded.sqlitePath, seeded.requestId);
    expect(state.selected).toBe(true);
    expect(state.facts?.accessNotes).toBe("Cursă facts");
    expect(state.linkCount).toBe(0);
    seeded.close();
  });
});
