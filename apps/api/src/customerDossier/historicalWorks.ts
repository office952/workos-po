import {
  generateHistoricalWorkId,
  HISTORICAL_WORK_PROVENANCE,
  readHistoricalWorkInput,
  snapshotCustomerSite,
  type HistoricalWork,
  type HistoricalWorkFields,
} from "@workos-final/domain";
import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { customerExists, dossierPlane, recordDossierEvent, requireDossierPermission } from "./access.js";
import { getCustomerSite } from "./sites.js";

type WorkRow = {
  work_id: string;
  customer_id: string;
  site_id: string | null;
  site_snapshot_json: string | null;
  title: string;
  reference: string | null;
  description: string | null;
  event_date: string;
  event_date_end: string | null;
  recorded_at: string;
  recorded_by_account_id: string;
  updated_at: string;
  revision: number;
};

function workFromRow(row: WorkRow): HistoricalWork {
  return {
    workId: row.work_id,
    customerId: row.customer_id,
    siteId: row.site_id,
    siteSnapshot: row.site_snapshot_json ? (JSON.parse(row.site_snapshot_json) as HistoricalWork["siteSnapshot"]) : null,
    title: row.title,
    reference: row.reference,
    description: row.description,
    eventDate: row.event_date,
    eventDateEnd: row.event_date_end,
    provenance: HISTORICAL_WORK_PROVENANCE,
    recordedAt: row.recorded_at,
    recordedByAccountId: row.recorded_by_account_id,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

export function listHistoricalWorks(db: SqliteDatabase, customerId: string): HistoricalWork[] {
  const rows = db
    .prepare("SELECT * FROM customer_historical_works WHERE customer_id = ? ORDER BY event_date DESC, work_id")
    .all(customerId) as WorkRow[];
  return rows.map(workFromRow);
}

export function getHistoricalWork(db: SqliteDatabase, customerId: string, workId: string): HistoricalWork | null {
  const row = db.prepare("SELECT * FROM customer_historical_works WHERE work_id = ? AND customer_id = ?").get(workId, customerId) as
    | WorkRow
    | undefined;
  return row ? workFromRow(row) : null;
}

function fieldsOf(work: HistoricalWork): HistoricalWorkFields {
  return {
    siteId: work.siteId,
    title: work.title,
    reference: work.reference,
    description: work.description,
    eventDate: work.eventDate,
    eventDateEnd: work.eventDateEnd,
  };
}

export function registerHistoricalWorkRoutes(app: Hono<ApiEnv>): void {
  app.post("/api/customers/:customerId/historical-works", requireDossierPermission("recordHistoricalWork"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const now = new Date().toISOString();
    const read = readHistoricalWorkInput(await c.req.json().catch(() => null), null, now.slice(0, 10));
    if (!read.ok) return c.json({ error: "invalid_payload", field: read.field }, 400);
    const site = read.fields.siteId ? getCustomerSite(plane.db, customerId, read.fields.siteId) : null;
    if (read.fields.siteId && !site) return c.json({ error: "site_not_of_customer" }, 422);
    const work: HistoricalWork = {
      workId: generateHistoricalWorkId(),
      customerId,
      ...read.fields,
      siteSnapshot: site ? snapshotCustomerSite(site) : null,
      provenance: HISTORICAL_WORK_PROVENANCE,
      recordedAt: now,
      recordedByAccountId: plane.actorAccountId,
      updatedAt: now,
      revision: 1,
    };
    plane.db.transaction(() => {
      plane.db
        .prepare(
          `INSERT INTO customer_historical_works (work_id, customer_id, site_id, site_snapshot_json, title, reference, description,
             event_date, event_date_end, provenance, recorded_at, recorded_by_account_id, updated_at, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          work.workId,
          customerId,
          work.siteId,
          work.siteSnapshot ? JSON.stringify(work.siteSnapshot) : null,
          work.title,
          work.reference,
          work.description,
          work.eventDate,
          work.eventDateEnd,
          HISTORICAL_WORK_PROVENANCE,
          now,
          plane.actorAccountId,
          now,
        );
      recordDossierEvent(plane.db, { customerId, kind: "HISTORICAL_WORK_RECORDED", subjectId: work.workId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { eventDate: work.eventDate } });
    })();
    return c.json({ work }, 201);
  });

  app.patch("/api/customers/:customerId/historical-works/:workId", requireDossierPermission("recordHistoricalWork"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const current = getHistoricalWork(plane.db, customerId, c.req.param("workId"));
    if (!current) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.expectedRevision === "number" && body.expectedRevision !== current.revision) {
      return c.json({ error: "stale_revision", work: current }, 409);
    }
    const now = new Date().toISOString();
    const read = readHistoricalWorkInput(body, fieldsOf(current), now.slice(0, 10));
    if (!read.ok) return c.json({ error: "invalid_payload", field: read.field }, 400);
    const siteChanged = read.fields.siteId !== current.siteId;
    const site = siteChanged && read.fields.siteId ? getCustomerSite(plane.db, customerId, read.fields.siteId) : null;
    if (siteChanged && read.fields.siteId && !site) return c.json({ error: "site_not_of_customer" }, 422);
    const next: HistoricalWork = {
      ...current,
      ...read.fields,
      // The snapshot only changes when the operator moves the work to another site.
      siteSnapshot: siteChanged ? (site ? snapshotCustomerSite(site) : null) : current.siteSnapshot,
    };
    const changed = JSON.stringify(fieldsOf(next)) !== JSON.stringify(fieldsOf(current));
    if (!changed) return c.json({ alreadyApplied: true, work: current });
    next.revision = current.revision + 1;
    next.updatedAt = now;
    plane.db.transaction(() => {
      plane.db
        .prepare(
          `UPDATE customer_historical_works SET site_id = ?, site_snapshot_json = ?, title = ?, reference = ?, description = ?,
             event_date = ?, event_date_end = ?, updated_at = ?, revision = ? WHERE work_id = ? AND customer_id = ?`,
        )
        .run(
          next.siteId,
          next.siteSnapshot ? JSON.stringify(next.siteSnapshot) : null,
          next.title,
          next.reference,
          next.description,
          next.eventDate,
          next.eventDateEnd,
          now,
          next.revision,
          next.workId,
          customerId,
        );
      recordDossierEvent(plane.db, { customerId, kind: "HISTORICAL_WORK_UPDATED", subjectId: next.workId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { revision: next.revision } });
    })();
    return c.json({ alreadyApplied: false, work: next });
  });
}
