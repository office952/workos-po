import {
  SITE_INSTALLATION_SCOPE_ID,
  applyInstallationManualPrice,
  createCommercialRequest,
  isOperationalServiceProviderMode,
  linkCommercialRequestQuote,
  siteInstallationEvidenceFromRows,
  updateCommercialRequest,
  type CommercialRequest,
  type CommercialRequestAttachment,
  type CommercialRequestLinkResult,
  type CommercialRequestMutationResult,
  type CommercialRequestQuoteLink,
  type CommercialRequestStatus,
  type Customer,
  type OperationalServiceProviderMode,
} from "@workos-final/domain";
import { getQuoteSnapshot } from "../commercial/store.js";
import { getCustomer } from "../customers/store.js";
import { readOrganizationServiceOffer } from "../operationalServices/store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { listActiveCostEvidence } from "../resources/store.js";
import { deleteInstallationFacts, getInstallationFacts } from "./installationFacts.js";

type OptionalServiceSelection = {
  scopeId: string;
  mode: OperationalServiceProviderMode | null;
};

type RequestRow = {
  request_id: string;
  reference: string;
  customer_id: string;
  title: string;
  description: string;
  status: string;
  installation_manual_net_eur: number | null;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  request_id: string;
  quote_snapshot_id: string;
  linked_at: string;
};

function modeFromRow(value: string | null): OperationalServiceProviderMode | null {
  return value && isOperationalServiceProviderMode(value) ? value : null;
}

function requestFromRow(
  row: RequestRow,
  selections: readonly OptionalServiceSelection[] = [],
): CommercialRequest {
  const installation = selections.find(
    (item) => item.scopeId === SITE_INSTALLATION_SCOPE_ID,
  );
  return {
    requestId: row.request_id,
    reference: row.reference,
    customerId: row.customer_id,
    title: row.title,
    description: row.description,
    status: row.status as CommercialRequestStatus,
    optionalScopeIds: selections.map((item) => item.scopeId),
    siteInstallationMode: installation?.mode ?? null,
    installationManualNetEur: row.installation_manual_net_eur,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listOptionalServiceSelections(
  db: SqliteDatabase,
  requestId: string,
): OptionalServiceSelection[] {
  const rows = db
    .prepare(
      `
      SELECT scope_id, provider_mode
      FROM commercial_request_optional_scopes
      WHERE request_id = ?
      ORDER BY selected_at ASC, scope_id ASC
    `,
    )
    .all(requestId) as Array<{ scope_id: string; provider_mode: string | null }>;
  return rows.map((row) => ({
    scopeId: row.scope_id,
    mode: modeFromRow(row.provider_mode),
  }));
}

function optionalServiceSelectionsByRequest(
  db: SqliteDatabase,
  requestIds: readonly string[],
): Map<string, OptionalServiceSelection[]> {
  const map = new Map<string, OptionalServiceSelection[]>();
  for (const requestId of requestIds) {
    map.set(requestId, []);
  }
  if (requestIds.length === 0) {
    return map;
  }
  const placeholders = requestIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT request_id, scope_id, provider_mode
      FROM commercial_request_optional_scopes
      WHERE request_id IN (${placeholders})
      ORDER BY selected_at ASC, scope_id ASC
    `,
    )
    .all(...requestIds) as Array<{
    request_id: string;
    scope_id: string;
    provider_mode: string | null;
  }>;
  for (const row of rows) {
    const current = map.get(row.request_id) ?? [];
    current.push({
      scopeId: row.scope_id,
      mode: modeFromRow(row.provider_mode),
    });
    map.set(row.request_id, current);
  }
  return map;
}

function replaceOptionalServiceSelections(
  db: SqliteDatabase,
  requestId: string,
  scopeIds: readonly string[],
  siteInstallationMode: OperationalServiceProviderMode | null,
  selectedAt: string,
): void {
  const current = new Set(
    listOptionalServiceSelections(db, requestId).map((item) => item.scopeId),
  );
  const next = new Set(scopeIds);
  for (const scopeId of current) {
    if (!next.has(scopeId)) {
      db.prepare(
        `
        DELETE FROM commercial_request_optional_scopes
        WHERE request_id = ? AND scope_id = ?
      `,
      ).run(requestId, scopeId);
    }
  }
  for (const scopeId of next) {
    const providerMode =
      scopeId === SITE_INSTALLATION_SCOPE_ID ? siteInstallationMode : null;
    if (!current.has(scopeId)) {
      db.prepare(
        `
        INSERT INTO commercial_request_optional_scopes (
          request_id, scope_id, selected_at, provider_mode
        )
        VALUES (?, ?, ?, ?)
      `,
      ).run(requestId, scopeId, selectedAt, providerMode);
    } else {
      db.prepare(
        `
        UPDATE commercial_request_optional_scopes
        SET provider_mode = ?
        WHERE request_id = ? AND scope_id = ?
      `,
      ).run(providerMode, requestId, scopeId);
    }
  }
}

function linkFromRow(row: LinkRow): CommercialRequestQuoteLink {
  return {
    requestId: row.request_id,
    quoteSnapshotId: row.quote_snapshot_id,
    linkedAt: row.linked_at,
  };
}

export function listCommercialRequests(db: SqliteDatabase): CommercialRequest[] {
  const rows = db
    .prepare(
      `
      SELECT request_id, reference, customer_id, title, description, status,
             installation_manual_net_eur, created_at, updated_at
      FROM commercial_requests
      ORDER BY created_at DESC
    `,
    )
    .all() as RequestRow[];
  const selections = optionalServiceSelectionsByRequest(
    db,
    rows.map((row) => row.request_id),
  );
  return rows.map((row) => requestFromRow(row, selections.get(row.request_id) ?? []));
}

export function getCommercialRequest(
  db: SqliteDatabase,
  requestId: string,
): CommercialRequest | null {
  const row = db
    .prepare(
      `
      SELECT request_id, reference, customer_id, title, description, status,
             installation_manual_net_eur, created_at, updated_at
      FROM commercial_requests
      WHERE request_id = ?
    `,
    )
    .get(requestId) as RequestRow | undefined;
  return row ? requestFromRow(row, listOptionalServiceSelections(db, requestId)) : null;
}

const REQUEST_CREATE_ATTEMPTS = 8;

export function persistCreatedCommercialRequest(
  db: SqliteDatabase,
  customer: Customer,
  title: string,
  description: string,
  options?: { requestId?: string },
): CommercialRequestMutationResult {
  const insert = db.prepare(
    `
    INSERT INTO commercial_requests (
      request_id, reference, customer_id, title, description, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  );
  for (let attempt = 0; attempt < REQUEST_CREATE_ATTEMPTS; attempt += 1) {
    const created = createCommercialRequest({
      customer,
      title,
      description,
      requestId: attempt === 0 ? options?.requestId : undefined,
    });
    if (!created.ok) {
      return created;
    }
    try {
      insert.run(
        created.request.requestId,
        created.request.reference,
        created.request.customerId,
        created.request.title,
        created.request.description,
        created.request.status,
        created.request.createdAt,
        created.request.updatedAt,
      );
      return created;
    } catch (error) {
      if (!isRequestIdentityCollision(error)) {
        throw error;
      }
    }
  }
  return { ok: false, error: "reference_unavailable" };
}

function isRequestIdentityCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code.includes("CONSTRAINT") &&
    (message.includes("commercial_requests.reference") ||
      message.includes("commercial_requests.request_id") ||
      message.includes("UNIQUE constraint failed"))
  );
}

function requestHasLinkedQuotes(db: SqliteDatabase, requestId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present
      FROM commercial_request_quote_links
      WHERE request_id = ?
    `,
    )
    .get(requestId) as { present: number } | undefined;
  return row !== undefined;
}

export function persistUpdatedCommercialRequest(
  db: SqliteDatabase,
  requestId: string,
  patch: {
    title?: string;
    description?: string;
    status?: CommercialRequestStatus;
    customerId?: string;
    optionalScopeIds?: readonly string[];
    siteInstallationMode?: OperationalServiceProviderMode | null;
    confirmDeleteInstallationFacts?: boolean;
  },
): CommercialRequestMutationResult {
  return db.transaction((): CommercialRequestMutationResult => {
    const current = getCommercialRequest(db, requestId);
    if (!current) {
      return { ok: false, error: "not_found" };
    }
    const updated = updateCommercialRequest(current, patch, {
      hasLinkedQuotes: requestHasLinkedQuotes(db, requestId),
      hasInstallationFacts: getInstallationFacts(db, requestId) !== null,
      serviceOffer: readOrganizationServiceOffer(db),
      nextCustomer:
        patch.customerId !== undefined && patch.customerId !== current.customerId
          ? getCustomer(db, patch.customerId)
          : undefined,
    });
    if (!updated.ok || updated.alreadyApplied) {
      return updated;
    }
    db.prepare(
      `
      UPDATE commercial_requests
      SET customer_id = ?, title = ?, description = ?, status = ?,
          installation_manual_net_eur = ?, updated_at = ?
      WHERE request_id = ?
    `,
    ).run(
      updated.request.customerId,
      updated.request.title,
      updated.request.description,
      updated.request.status,
      updated.request.installationManualNetEur ?? null,
      updated.request.updatedAt,
      requestId,
    );
    replaceOptionalServiceSelections(
      db,
      requestId,
      updated.request.optionalScopeIds,
      updated.request.siteInstallationMode,
      updated.request.updatedAt,
    );
    if (!updated.request.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID)) {
      deleteInstallationFacts(db, requestId);
    }
    return updated;
  }).immediate();
}

export function listCommercialRequestQuoteLinks(
  db: SqliteDatabase,
  requestId: string,
): CommercialRequestQuoteLink[] {
  const rows = db
    .prepare(
      `
      SELECT request_id, quote_snapshot_id, linked_at
      FROM commercial_request_quote_links
      WHERE request_id = ?
      ORDER BY linked_at DESC
    `,
    )
    .all(requestId) as LinkRow[];
  return rows.map(linkFromRow);
}

export function getCommercialRequestQuoteLinkByQuote(
  db: SqliteDatabase,
  quoteSnapshotId: string,
): CommercialRequestQuoteLink | null {
  const row = db
    .prepare(
      `
      SELECT request_id, quote_snapshot_id, linked_at
      FROM commercial_request_quote_links
      WHERE quote_snapshot_id = ?
    `,
    )
    .get(quoteSnapshotId) as LinkRow | undefined;
  return row ? linkFromRow(row) : null;
}

export function persistInstallationManualPrice(
  db: SqliteDatabase,
  requestId: string,
  netPrice: number | null,
  isOwner: boolean,
): CommercialRequestMutationResult {
  return db.transaction((): CommercialRequestMutationResult => {
    const current = getCommercialRequest(db, requestId);
    if (!current) {
      return { ok: false, error: "not_found" };
    }
    const updated = applyInstallationManualPrice({
      request: current,
      netPrice,
      isOwner,
      hasLinkedQuotes: requestHasLinkedQuotes(db, requestId),
    });
    if (!updated.ok || updated.alreadyApplied) {
      return updated;
    }
    db.prepare(
      `
      UPDATE commercial_requests
      SET installation_manual_net_eur = ?, updated_at = ?
      WHERE request_id = ?
    `,
    ).run(
      updated.request.installationManualNetEur ?? null,
      updated.request.updatedAt,
      requestId,
    );
    return updated;
  }).immediate();
}

export function readInstallationReadiness(
  db: SqliteDatabase,
  request: CommercialRequest,
) {
  return {
    facts: getInstallationFacts(db, request.requestId),
    providerMode: request.siteInstallationMode,
    evidence: siteInstallationEvidenceFromRows(listActiveCostEvidence(db)),
    manualNetPrice: request.installationManualNetEur ?? null,
  };
}

export function persistCommercialRequestQuoteLink(
  db: SqliteDatabase,
  requestId: string,
  quoteSnapshotId: string,
): CommercialRequestLinkResult {
  return db.transaction((): CommercialRequestLinkResult => {
    const request = getCommercialRequest(db, requestId);
    if (!request) {
      return { ok: false, error: "not_found" };
    }
    const quote = getQuoteSnapshot(db, quoteSnapshotId);
    if (!quote) {
      return { ok: false, error: "quote_unavailable" };
    }
    const linked = linkCommercialRequestQuote({
      request,
      quoteSnapshotId,
      quoteCustomerId: quote.customer?.customerId,
      existingLink: getCommercialRequestQuoteLinkByQuote(db, quoteSnapshotId),
      installationReadiness: readInstallationReadiness(db, request),
    });
    if (!linked.ok || linked.alreadyApplied) {
      return linked;
    }
    db.prepare(
      `
      INSERT INTO commercial_request_quote_links (request_id, quote_snapshot_id, linked_at)
      VALUES (?, ?, ?)
    `,
    ).run(linked.link.requestId, linked.link.quoteSnapshotId, linked.link.linkedAt);
    return linked;
  }).immediate();
}

type AttachmentRow = {
  attachment_id: string;
  request_id: string;
  original_file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  sha256: string;
  created_at: string;
};

function attachmentFromRow(row: AttachmentRow): CommercialRequestAttachment {
  return {
    attachmentId: row.attachment_id,
    requestId: row.request_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export function listCommercialRequestAttachments(
  db: SqliteDatabase,
  requestId: string,
): CommercialRequestAttachment[] {
  const rows = db
    .prepare(
      `
      SELECT attachment_id, request_id, original_file_name, mime_type, size_bytes,
             storage_key, sha256, created_at
      FROM commercial_request_attachments
      WHERE request_id = ?
      ORDER BY created_at DESC, attachment_id DESC
    `,
    )
    .all(requestId) as AttachmentRow[];
  return rows.map(attachmentFromRow);
}

export function getCommercialRequestAttachment(
  db: SqliteDatabase,
  attachmentId: string,
): CommercialRequestAttachment | null {
  const row = db
    .prepare(
      `
      SELECT attachment_id, request_id, original_file_name, mime_type, size_bytes,
             storage_key, sha256, created_at
      FROM commercial_request_attachments
      WHERE attachment_id = ?
    `,
    )
    .get(attachmentId) as AttachmentRow | undefined;
  return row ? attachmentFromRow(row) : null;
}

export function insertCommercialRequestAttachment(
  db: SqliteDatabase,
  attachment: CommercialRequestAttachment,
): void {
  db.prepare(
    `
    INSERT INTO commercial_request_attachments (
      attachment_id, request_id, original_file_name, mime_type, size_bytes,
      storage_key, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    attachment.attachmentId,
    attachment.requestId,
    attachment.originalFileName,
    attachment.mimeType,
    attachment.sizeBytes,
    attachment.storageKey,
    attachment.sha256,
    attachment.createdAt,
  );
}
