import {
  applyCustomerSitePatch,
  customerSiteStatusLabel,
  generateCustomerSiteId,
  readCustomerSiteFields,
  readCustomerSitePatch,
  snapshotCustomerSite,
  type CustomerSite,
  type CustomerSiteSnapshot,
  type CustomerSiteSubjectKind,
} from "@workos-final/domain";
import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  customerExists,
  dossierPlane,
  recordDossierEvent,
  requireDossierPermission,
  subjectBelongsToCustomer,
} from "./access.js";

type SiteRow = {
  site_id: string;
  customer_id: string;
  name: string;
  address: string | null;
  city: string | null;
  contact_name: string | null;
  phone: string | null;
  access_notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  revision: number;
  created_at: string;
  updated_at: string;
};

function siteFromRow(row: SiteRow): CustomerSite {
  return {
    siteId: row.site_id,
    customerId: row.customer_id,
    name: row.name,
    address: row.address,
    city: row.city,
    contactName: row.contact_name,
    phone: row.phone,
    accessNotes: row.access_notes,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCustomerSites(db: SqliteDatabase, customerId: string): CustomerSite[] {
  const rows = db
    .prepare(
      `SELECT * FROM customer_sites WHERE customer_id = ?
       ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, name COLLATE NOCASE, site_id`,
    )
    .all(customerId) as SiteRow[];
  return rows.map(siteFromRow);
}

export function getCustomerSite(db: SqliteDatabase, customerId: string, siteId: string): CustomerSite | null {
  const row = db.prepare("SELECT * FROM customer_sites WHERE site_id = ? AND customer_id = ?").get(siteId, customerId) as
    | SiteRow
    | undefined;
  return row ? siteFromRow(row) : null;
}

export type SiteAssignment = {
  subjectKind: CustomerSiteSubjectKind;
  subjectId: string;
  siteId: string;
  snapshot: CustomerSiteSnapshot;
  assignedAt: string;
};

export function listSiteAssignments(db: SqliteDatabase, customerId: string): SiteAssignment[] {
  const rows = db
    .prepare(
      `SELECT subject_kind, subject_id, site_id, site_snapshot_json, assigned_at
       FROM customer_site_assignments WHERE customer_id = ? ORDER BY subject_kind, subject_id`,
    )
    .all(customerId) as Array<{
    subject_kind: CustomerSiteSubjectKind;
    subject_id: string;
    site_id: string;
    site_snapshot_json: string;
    assigned_at: string;
  }>;
  return rows.map((row) => ({
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    siteId: row.site_id,
    snapshot: JSON.parse(row.site_snapshot_json) as CustomerSiteSnapshot,
    assignedAt: row.assigned_at,
  }));
}

export function presentCustomerSite(site: CustomerSite, usage: { requests: number; jobs: number; historicalWorks: number; documents: number }) {
  return { ...site, statusLabel: customerSiteStatusLabel(site.status), usage };
}

export function siteUsage(db: SqliteDatabase, siteId: string) {
  const count = (sql: string) => (db.prepare(sql).get(siteId) as { n: number }).n;
  return {
    requests: count("SELECT COUNT(*) AS n FROM customer_site_assignments WHERE site_id = ? AND subject_kind = 'REQUEST'"),
    jobs: count("SELECT COUNT(*) AS n FROM customer_site_assignments WHERE site_id = ? AND subject_kind = 'JOB'"),
    historicalWorks: count("SELECT COUNT(*) AS n FROM customer_historical_works WHERE site_id = ?"),
    documents: count("SELECT COUNT(*) AS n FROM customer_document_links WHERE link_kind = 'SITE' AND subject_id = ?"),
  };
}

function writeSite(db: SqliteDatabase, site: CustomerSite, insert: boolean): void {
  const values = [
    site.name,
    site.address,
    site.city,
    site.contactName,
    site.phone,
    site.accessNotes,
    site.status,
    site.revision,
    site.updatedAt,
  ];
  if (insert) {
    db.prepare(
      `INSERT INTO customer_sites (name, address, city, contact_name, phone, access_notes, status, revision, updated_at,
         site_id, customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...values, site.siteId, site.customerId, site.createdAt);
    return;
  }
  db.prepare(
    `UPDATE customer_sites SET name = ?, address = ?, city = ?, contact_name = ?, phone = ?, access_notes = ?,
       status = ?, revision = ?, updated_at = ? WHERE site_id = ? AND customer_id = ?`,
  ).run(...values, site.siteId, site.customerId);
}

export function registerCustomerSiteRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/customers/:customerId/sites", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    return c.json({
      sites: listCustomerSites(plane.db, customerId).map((site) => presentCustomerSite(site, siteUsage(plane.db, site.siteId))),
    });
  });

  app.post("/api/customers/:customerId/sites", requireDossierPermission("editSites"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const read = readCustomerSiteFields(await c.req.json().catch(() => null));
    if (!read.ok) return c.json({ error: "invalid_payload" }, 400);
    const now = new Date().toISOString();
    const site: CustomerSite = {
      siteId: generateCustomerSiteId(),
      customerId,
      ...read.fields,
      status: "ACTIVE",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    plane.db.transaction(() => {
      writeSite(plane.db, site, true);
      recordDossierEvent(plane.db, { customerId, kind: "SITE_CREATED", subjectId: site.siteId, actorAccountId: plane.actorAccountId, occurredAt: now });
    })();
    return c.json({ site: presentCustomerSite(site, siteUsage(plane.db, site.siteId)) }, 201);
  });

  app.patch("/api/customers/:customerId/sites/:siteId", requireDossierPermission("editSites"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const current = getCustomerSite(plane.db, customerId, c.req.param("siteId"));
    if (!current) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.expectedRevision === "number" && body.expectedRevision !== current.revision) {
      return c.json({ error: "stale_revision", site: presentCustomerSite(current, siteUsage(plane.db, current.siteId)) }, 409);
    }
    const { expectedRevision: _ignored, ...fields } = body ?? {};
    void _ignored;
    const read = readCustomerSitePatch(fields);
    if (!read.ok) return c.json({ error: "invalid_payload" }, 400);
    const now = new Date().toISOString();
    const next = applyCustomerSitePatch(current, read.patch, now);
    if (next.changed) {
      plane.db.transaction(() => {
        writeSite(plane.db, next.site, false);
        recordDossierEvent(plane.db, {
          customerId,
          kind: read.patch.status && read.patch.status !== current.status ? `SITE_${read.patch.status}` : "SITE_UPDATED",
          subjectId: current.siteId,
          actorAccountId: plane.actorAccountId,
          occurredAt: now,
          detail: { revision: next.site.revision },
        });
      })();
    }
    return c.json({ alreadyApplied: !next.changed, site: presentCustomerSite(next.site, siteUsage(plane.db, current.siteId)) });
  });

  /** Sets (or clears, with siteId null) the site of one of this customer's requests or jobs. */
  app.put("/api/customers/:customerId/site-assignments", requireDossierPermission("editSites"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { subjectKind?: unknown; subjectId?: unknown; siteId?: unknown } | null;
    const subjectKind = body?.subjectKind;
    const subjectId = body?.subjectId;
    if ((subjectKind !== "REQUEST" && subjectKind !== "JOB") || typeof subjectId !== "string" || !subjectId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    if (!subjectBelongsToCustomer(plane, customerId, subjectKind, subjectId)) {
      return c.json({ error: "subject_not_of_customer" }, 422);
    }
    const now = new Date().toISOString();
    if (body?.siteId === null) {
      plane.db.transaction(() => {
        plane.db.prepare("DELETE FROM customer_site_assignments WHERE subject_kind = ? AND subject_id = ? AND customer_id = ?").run(subjectKind, subjectId, customerId);
        recordDossierEvent(plane.db, { customerId, kind: "SITE_UNASSIGNED", subjectId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { subjectKind } });
      })();
      return c.json({ assignment: null });
    }
    if (typeof body?.siteId !== "string") return c.json({ error: "invalid_payload" }, 400);
    const site = getCustomerSite(plane.db, customerId, body.siteId);
    if (!site) return c.json({ error: "site_not_of_customer" }, 422);
    const existing = listSiteAssignments(plane.db, customerId).find((item) => item.subjectKind === subjectKind && item.subjectId === subjectId);
    if (existing?.siteId === site.siteId) return c.json({ alreadyApplied: true, assignment: existing });
    if (site.status !== "ACTIVE") return c.json({ error: "site_inactive" }, 409);
    const snapshot = snapshotCustomerSite(site);
    plane.db.transaction(() => {
      plane.db
        .prepare(
          `INSERT INTO customer_site_assignments (subject_kind, subject_id, customer_id, site_id, site_snapshot_json, assigned_at, assigned_by_account_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (subject_kind, subject_id) DO UPDATE SET site_id = excluded.site_id,
             site_snapshot_json = excluded.site_snapshot_json, assigned_at = excluded.assigned_at,
             assigned_by_account_id = excluded.assigned_by_account_id`,
        )
        .run(subjectKind, subjectId, customerId, site.siteId, JSON.stringify(snapshot), now, plane.actorAccountId);
      recordDossierEvent(plane.db, { customerId, kind: "SITE_ASSIGNED", subjectId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { subjectKind, siteId: site.siteId } });
    })();
    return c.json({ assignment: { subjectKind, subjectId, siteId: site.siteId, snapshot, assignedAt: now } });
  });
}
