import {
  CUSTOMER_COMMERCIAL_TERMS_LABELS,
  CUSTOMER_TERMS_CURRENCIES,
  customerCommercialTermsChanged,
  emptyCustomerCommercialTerms,
  readCustomerCommercialTermsPatch,
  type CustomerCommercialTerms,
  type CustomerCommercialTermsFields,
} from "@workos-final/domain";
import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  canDossier,
  customerExists,
  dossierPlane,
  recordDossierEvent,
  requireDossierPermission,
} from "./access.js";
import { getCustomerDocument } from "./documents.js";

type TermsRow = {
  customer_id: string;
  revision: number;
  fields_json: string;
  recorded_at: string;
  recorded_by_account_id: string;
};

function termsFromRow(row: TermsRow): CustomerCommercialTerms {
  return {
    ...emptyCustomerCommercialTerms(),
    ...(JSON.parse(row.fields_json) as Partial<CustomerCommercialTermsFields>),
    customerId: row.customer_id,
    revision: row.revision,
    recordedAt: row.recorded_at,
    recordedByAccountId: row.recorded_by_account_id,
  };
}

export function readCurrentCommercialTerms(db: SqliteDatabase, customerId: string): CustomerCommercialTerms | null {
  const row = db
    .prepare("SELECT * FROM customer_commercial_terms_revisions WHERE customer_id = ? ORDER BY revision DESC LIMIT 1")
    .get(customerId) as TermsRow | undefined;
  return row ? termsFromRow(row) : null;
}

export function listCommercialTermsRevisions(db: SqliteDatabase, customerId: string): CustomerCommercialTerms[] {
  const rows = db
    .prepare("SELECT * FROM customer_commercial_terms_revisions WHERE customer_id = ? ORDER BY revision DESC")
    .all(customerId) as TermsRow[];
  return rows.map(termsFromRow);
}

function fieldsOf(terms: CustomerCommercialTerms | null): CustomerCommercialTermsFields {
  if (!terms) return emptyCustomerCommercialTerms();
  const fields = emptyCustomerCommercialTerms();
  for (const key of Object.keys(fields) as Array<keyof CustomerCommercialTermsFields>) {
    (fields as Record<string, unknown>)[key] = terms[key];
  }
  return fields;
}

export function registerCustomerCommercialTermsRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/customers/:customerId/commercial-terms", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const revisions = listCommercialTermsRevisions(plane.db, customerId);
    const current = revisions[0] ?? null;
    const reference = current?.referenceDocumentId ? getCustomerDocument(plane.db, customerId, current.referenceDocumentId) : null;
    return c.json({
      terms: current,
      fields: fieldsOf(current),
      labels: CUSTOMER_COMMERCIAL_TERMS_LABELS,
      currencies: CUSTOMER_TERMS_CURRENCIES,
      referenceDocument: reference ? { documentId: reference.documentId, title: reference.title, documentNumber: reference.documentNumber } : null,
      revisions: revisions.map((item) => ({ revision: item.revision, recordedAt: item.recordedAt })),
      canEdit: canDossier(c, "editCommercialTerms"),
      notice: "Date înregistrate pentru referință. Nu modifică ofertele, comenzile sau documentele acceptate.",
    });
  });

  app.put("/api/customers/:customerId/commercial-terms", requireDossierPermission("editCommercialTerms"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const current = readCurrentCommercialTerms(plane.db, customerId);
    const expected = body?.expectedRevision;
    if (typeof expected === "number" && expected !== (current?.revision ?? 0)) {
      return c.json({ error: "stale_revision", terms: current }, 409);
    }
    const { expectedRevision: _ignored, ...input } = body ?? {};
    void _ignored;
    const read = readCustomerCommercialTermsPatch(input, fieldsOf(current));
    if (!read.ok) return c.json({ error: "invalid_payload", field: read.field }, 400);
    if (read.fields.referenceDocumentId && !getCustomerDocument(plane.db, customerId, read.fields.referenceDocumentId)) {
      return c.json({ error: "reference_document_not_of_customer" }, 422);
    }
    if (current && !customerCommercialTermsChanged(fieldsOf(current), read.fields)) {
      return c.json({ alreadyApplied: true, terms: current });
    }
    const now = new Date().toISOString();
    const revision = (current?.revision ?? 0) + 1;
    plane.db.transaction(() => {
      plane.db
        .prepare(
          `INSERT INTO customer_commercial_terms_revisions (customer_id, revision, fields_json, recorded_at, recorded_by_account_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(customerId, revision, JSON.stringify(read.fields), now, plane.actorAccountId);
      recordDossierEvent(plane.db, { customerId, kind: "COMMERCIAL_TERMS_RECORDED", subjectId: null, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { revision } });
    })();
    return c.json({ alreadyApplied: false, terms: readCurrentCommercialTerms(plane.db, customerId) });
  });
}
