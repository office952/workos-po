import {
  acceptQuoteCommercialRefusal,
  decorateQuoteOverviewItem,
  defaultOpenCommercialLedger,
  isCommercialActorRole,
  isCommercialOfferDisposition,
  isCommercialState,
  newQuoteWhileClosedRefusal,
  projectCommercialRequestView,
  supersededAssemblyQuoteIds,
  type CommercialActor,
  type CommercialLedgerEvent,
  type CommercialLedgerEventDraft,
  type CommercialLedgerState,
  type CommercialMutationResult,
  type CommercialOfferFacts,
  type CommercialRequestView,
  type QuoteOverviewItem,
  type RecordedCommercialOperation,
} from "@workos-final/domain";
import {
  listAssemblyQuotes,
  readAssemblyOrderByQuote,
} from "../assembly/store.js";
import {
  getQuoteAcceptanceBySnapshotId,
  getOrderSnapshotByQuoteSnapshotId,
} from "./store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  getCommercialRequest,
  listCommercialRequestQuoteLinks,
} from "../requests/store.js";

type LedgerRow = {
  request_id: string;
  commercial_state: string;
  revision: number;
  closed_at: string | null;
  closed_by_account_id: string | null;
  closed_by_display_name: string | null;
  closed_by_role: string | null;
  close_reason: string | null;
  reopened_at: string | null;
  reopened_by_account_id: string | null;
  reopened_by_display_name: string | null;
  reopened_by_role: string | null;
  reopen_reason: string | null;
  updated_at: string;
};

type OperationRow = {
  operation_id: string;
  request_id: string;
  payload_fingerprint: string;
  result_revision: number;
};

type EventRow = {
  event_id: string;
  request_id: string;
  ledger_revision: number;
  sequence_in_operation: number;
  event_kind: string;
  quote_snapshot_id: string | null;
  disposition: string | null;
  reason: string;
  actor_account_id: string;
  actor_role: string;
  actor_display_name: string;
  occurred_at: string;
  operation_id: string;
  correlation_id: string;
  payload_fingerprint: string;
  supersedes_event_id: string | null;
};

type DispositionRow = {
  request_id: string;
  quote_snapshot_id: string;
  disposition: string;
  current_event_id: string;
  reason: string;
  actor_account_id: string;
  occurred_at: string;
};

function actorFromParts(
  accountId: string | null,
  role: string | null,
  displayName: string | null,
): CommercialActor | null {
  if (!accountId || !role || !isCommercialActorRole(role) || !displayName) {
    return null;
  }
  return { accountId, role, displayName };
}

export function readCommercialLedger(
  db: SqliteDatabase,
  requestId: string,
  fallbackUpdatedAt = new Date().toISOString(),
): CommercialLedgerState {
  const row = db
    .prepare(
      `
      SELECT request_id, commercial_state, revision, closed_at, closed_by_account_id,
             closed_by_display_name, closed_by_role, close_reason, reopened_at,
             reopened_by_account_id, reopened_by_display_name, reopened_by_role,
             reopen_reason, updated_at
      FROM commercial_request_ledger
      WHERE request_id = ?
    `,
    )
    .get(requestId) as LedgerRow | undefined;
  if (!row || !isCommercialState(row.commercial_state)) {
    return defaultOpenCommercialLedger(requestId, fallbackUpdatedAt);
  }
  return {
    requestId: row.request_id,
    state: row.commercial_state,
    revision: row.revision,
    closedAt: row.closed_at,
    closedBy: actorFromParts(
      row.closed_by_account_id,
      row.closed_by_role,
      row.closed_by_display_name,
    ),
    closeReason: row.close_reason,
    reopenedAt: row.reopened_at,
    reopenedBy: actorFromParts(
      row.reopened_by_account_id,
      row.reopened_by_role,
      row.reopened_by_display_name,
    ),
    reopenReason: row.reopen_reason,
    updatedAt: row.updated_at,
  };
}

export function readCommercialOperation(
  db: SqliteDatabase,
  operationId: string,
): RecordedCommercialOperation | null {
  const row = db
    .prepare(
      `
      SELECT operation_id, request_id, payload_fingerprint, result_revision
      FROM commercial_ledger_operations
      WHERE operation_id = ?
    `,
    )
    .get(operationId) as OperationRow | undefined;
  return row
    ? {
        operationId: row.operation_id,
        requestId: row.request_id,
        payloadFingerprint: row.payload_fingerprint,
        resultRevision: row.result_revision,
      }
    : null;
}

function listDispositionRows(db: SqliteDatabase, requestId: string): DispositionRow[] {
  return db
    .prepare(
      `
      SELECT request_id, quote_snapshot_id, disposition, current_event_id, reason,
             actor_account_id, occurred_at
      FROM commercial_offer_dispositions
      WHERE request_id = ?
    `,
    )
    .all(requestId) as DispositionRow[];
}

export function listCommercialOfferFacts(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
): CommercialOfferFacts[] {
  const dispositions = new Map(
    listDispositionRows(db, requestId).map((row) => [row.quote_snapshot_id, row]),
  );
  const standalone = listCommercialRequestQuoteLinks(db, requestId).map((link) => {
    const disposition = dispositions.get(link.quoteSnapshotId);
    const accepted = getQuoteAcceptanceBySnapshotId(db, link.quoteSnapshotId) !== null;
    const ordered = getOrderSnapshotByQuoteSnapshotId(db, link.quoteSnapshotId) !== null;
    return {
      quoteSnapshotId: link.quoteSnapshotId,
      kind: "PRODUCT" as const,
      superseded: false,
      accepted,
      ordered,
      currentDisposition:
        disposition && isCommercialOfferDisposition(disposition.disposition)
          ? disposition.disposition
          : null,
      currentDispositionEventId: disposition?.current_event_id ?? null,
    };
  });
  const assemblyQuotes = listAssemblyQuotes(db, organizationId).filter(
    (quote) => quote.requestId === requestId,
  );
  const superseded = supersededAssemblyQuoteIds(assemblyQuotes);
  const assembly = assemblyQuotes.map((quote) => {
    const disposition = dispositions.get(quote.quoteSnapshotId);
    const order = readAssemblyOrderByQuote(db, organizationId, quote.quoteSnapshotId);
    return {
      quoteSnapshotId: quote.quoteSnapshotId,
      kind: "ASSEMBLY" as const,
      superseded: superseded.has(quote.quoteSnapshotId),
      accepted: order !== null,
      ordered: order !== null,
      currentDisposition:
        disposition && isCommercialOfferDisposition(disposition.disposition)
          ? disposition.disposition
          : null,
      currentDispositionEventId: disposition?.current_event_id ?? null,
    };
  });
  return [...standalone, ...assembly];
}

export function listCommercialLedgerEvents(
  db: SqliteDatabase,
  requestId: string,
): CommercialLedgerEvent[] {
  const rows = db
    .prepare(
      `
      SELECT event_id, request_id, ledger_revision, sequence_in_operation, event_kind,
             quote_snapshot_id, disposition, reason, actor_account_id, actor_role,
             actor_display_name, occurred_at, operation_id, correlation_id,
             payload_fingerprint, supersedes_event_id
      FROM commercial_ledger_events
      WHERE request_id = ?
      ORDER BY occurred_at ASC, ledger_revision ASC, sequence_in_operation ASC
    `,
    )
    .all(requestId) as EventRow[];
  return rows.flatMap((row) => {
    if (
      row.event_kind !== "OFFER_DISPOSITION" &&
      row.event_kind !== "OFFER_RESUMED" &&
      row.event_kind !== "REQUEST_CLOSED" &&
      row.event_kind !== "REQUEST_REOPENED"
    ) {
      return [];
    }
    if (!isCommercialActorRole(row.actor_role)) {
      return [];
    }
    const disposition =
      row.disposition && isCommercialOfferDisposition(row.disposition)
        ? row.disposition
        : null;
    return [
      {
        eventId: row.event_id,
        requestId: row.request_id,
        ledgerRevision: row.ledger_revision,
        sequenceInOperation: row.sequence_in_operation,
        eventKind: row.event_kind,
        quoteSnapshotId: row.quote_snapshot_id,
        disposition,
        reason: row.reason,
        actor: {
          accountId: row.actor_account_id,
          role: row.actor_role,
          displayName: row.actor_display_name,
        },
        occurredAt: row.occurred_at,
        operationId: row.operation_id,
        correlationId: row.correlation_id,
        payloadFingerprint: row.payload_fingerprint,
        supersedesEventId: row.supersedes_event_id,
      },
    ];
  });
}

export function projectStoredCommercialView(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
  actorIsOwner: boolean,
  revealAccountId: boolean,
): CommercialRequestView | null {
  const request = getCommercialRequest(db, requestId);
  if (!request) {
    return null;
  }
  return projectCommercialRequestView({
    ledger: readCommercialLedger(db, requestId, request.updatedAt),
    offers: listCommercialOfferFacts(db, organizationId, requestId),
    events: listCommercialLedgerEvents(db, requestId),
    actorIsOwner,
    revealAccountId,
  });
}

export function requestHasExistingOrders(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
): boolean {
  return listCommercialOfferFacts(db, organizationId, requestId).some((offer) => offer.ordered);
}

function persistLedgerState(
  db: SqliteDatabase,
  ledger: CommercialLedgerState,
): void {
  db.prepare(
    `
    INSERT INTO commercial_request_ledger (
      request_id, commercial_state, revision, closed_at, closed_by_account_id,
      closed_by_display_name, closed_by_role, close_reason, reopened_at,
      reopened_by_account_id, reopened_by_display_name, reopened_by_role,
      reopen_reason, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO UPDATE SET
      commercial_state = excluded.commercial_state,
      revision = excluded.revision,
      closed_at = excluded.closed_at,
      closed_by_account_id = excluded.closed_by_account_id,
      closed_by_display_name = excluded.closed_by_display_name,
      closed_by_role = excluded.closed_by_role,
      close_reason = excluded.close_reason,
      reopened_at = excluded.reopened_at,
      reopened_by_account_id = excluded.reopened_by_account_id,
      reopened_by_display_name = excluded.reopened_by_display_name,
      reopened_by_role = excluded.reopened_by_role,
      reopen_reason = excluded.reopen_reason,
      updated_at = excluded.updated_at
  `,
  ).run(
    ledger.requestId,
    ledger.state,
    ledger.revision,
    ledger.closedAt,
    ledger.closedBy?.accountId ?? null,
    ledger.closedBy?.displayName ?? null,
    ledger.closedBy?.role ?? null,
    ledger.closeReason,
    ledger.reopenedAt,
    ledger.reopenedBy?.accountId ?? null,
    ledger.reopenedBy?.displayName ?? null,
    ledger.reopenedBy?.role ?? null,
    ledger.reopenReason,
    ledger.updatedAt,
  );
}

export function applyCommercialMutation(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
  actor: CommercialActor,
  occurredAt: string,
  operationId: string,
  planFor: (input: {
    ledger: CommercialLedgerState;
    offers: CommercialOfferFacts[];
    existingOperation: RecordedCommercialOperation | null;
  }) => CommercialMutationResult,
): CommercialMutationResult {
  return db.transaction((): CommercialMutationResult => {
    const request = getCommercialRequest(db, requestId);
    if (!request) {
      return {
        ok: false,
        error: "not_found",
        currentRevision: 0,
        blockingQuoteSnapshotIds: [],
        reasons: ["Cererea nu a fost găsită."],
      };
    }
    const ledger = readCommercialLedger(db, requestId, request.updatedAt);
    const offers = listCommercialOfferFacts(db, organizationId, requestId);
    const resolved = planFor({
      ledger,
      offers,
      existingOperation: readCommercialOperation(db, operationId),
    });
    if (!resolved.ok || resolved.idempotent) {
      return resolved;
    }
    db.prepare(
      `
      INSERT INTO commercial_ledger_operations (
        operation_id, request_id, payload_fingerprint, result_revision, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      resolved.operationId,
      requestId,
      resolved.payloadFingerprint,
      resolved.nextRevision,
      occurredAt,
    );
    const eventIds: string[] = [];
    resolved.events.forEach((draft: CommercialLedgerEventDraft, index: number) => {
      const eventId = `cle:${crypto.randomUUID()}`;
      eventIds.push(eventId);
      db.prepare(
        `
        INSERT INTO commercial_ledger_events (
          event_id, request_id, ledger_revision, sequence_in_operation, event_kind,
          quote_snapshot_id, disposition, reason, actor_account_id, actor_role,
          actor_display_name, occurred_at, operation_id, correlation_id,
          payload_fingerprint, supersedes_event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        eventId,
        requestId,
        resolved.nextRevision,
        index,
        draft.eventKind,
        draft.quoteSnapshotId,
        draft.disposition,
        draft.reason,
        actor.accountId,
        actor.role,
        actor.displayName,
        occurredAt,
        resolved.operationId,
        resolved.operationId,
        resolved.payloadFingerprint,
        draft.supersedesEventId,
      );
    });
    for (const write of resolved.dispositionWrites) {
      const eventId =
        eventIds[
          resolved.events.findIndex(
            (event: CommercialLedgerEventDraft) =>
              event.eventKind === "OFFER_DISPOSITION" &&
              event.quoteSnapshotId === write.quoteSnapshotId,
          )
        ] ?? eventIds[0];
      db.prepare(
        `
        INSERT INTO commercial_offer_dispositions (
          request_id, quote_snapshot_id, disposition, current_event_id, reason,
          actor_account_id, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id, quote_snapshot_id) DO UPDATE SET
          disposition = excluded.disposition,
          current_event_id = excluded.current_event_id,
          reason = excluded.reason,
          actor_account_id = excluded.actor_account_id,
          occurred_at = excluded.occurred_at
      `,
      ).run(
        requestId,
        write.quoteSnapshotId,
        write.disposition,
        eventId,
        write.reason,
        actor.accountId,
        occurredAt,
      );
    }
    for (const quoteSnapshotId of resolved.dispositionDeletes) {
      db.prepare(
        `DELETE FROM commercial_offer_dispositions WHERE request_id = ? AND quote_snapshot_id = ?`,
      ).run(requestId, quoteSnapshotId);
    }
    const nextLedger: CommercialLedgerState = {
      ...ledger,
      state: resolved.nextState,
      revision: resolved.nextRevision,
      updatedAt: occurredAt,
      closedAt: resolved.nextState === "CLOSED" ? occurredAt : ledger.closedAt,
      closedBy: resolved.nextState === "CLOSED" ? actor : ledger.closedBy,
      closeReason:
        resolved.nextState === "CLOSED" ? resolved.closeReason : ledger.closeReason,
      reopenedAt: resolved.nextState === "OPEN" && ledger.state === "CLOSED" ? occurredAt : ledger.reopenedAt,
      reopenedBy:
        resolved.nextState === "OPEN" && ledger.state === "CLOSED" ? actor : ledger.reopenedBy,
      reopenReason:
        resolved.nextState === "OPEN" && ledger.state === "CLOSED"
          ? resolved.reopenReason
          : ledger.reopenReason,
    };
    persistLedgerState(db, nextLedger);
    return resolved;
  }).immediate();
}

export function commercialStateOf(
  db: SqliteDatabase,
  requestId: string,
): "OPEN" | "CLOSED" {
  return readCommercialLedger(db, requestId).state;
}

export function refuseNewQuoteIfClosed(
  db: SqliteDatabase,
  requestId: string,
): ReturnType<typeof newQuoteWhileClosedRefusal> {
  return newQuoteWhileClosedRefusal(commercialStateOf(db, requestId));
}

export function refuseAcceptIfDispositioned(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string | null | undefined,
  quoteSnapshotId: string,
): ReturnType<typeof acceptQuoteCommercialRefusal> {
  if (!requestId) {
    return null;
  }
  const offer = listCommercialOfferFacts(db, organizationId, requestId).find(
    (item) => item.quoteSnapshotId === quoteSnapshotId,
  );
  return acceptQuoteCommercialRefusal(offer ?? null);
}

export function decorateQuotesWithCommercial(
  db: SqliteDatabase,
  organizationId: string,
  quotes: readonly QuoteOverviewItem[],
): QuoteOverviewItem[] {
  const factsByRequest = new Map<string, CommercialOfferFacts[]>();
  const stateByRequest = new Map<string, CommercialLedgerState["state"]>();
  return quotes.map((item) => {
    if (!item.requestId) {
      return item;
    }
    if (!factsByRequest.has(item.requestId)) {
      factsByRequest.set(
        item.requestId,
        listCommercialOfferFacts(db, organizationId, item.requestId),
      );
      stateByRequest.set(item.requestId, readCommercialLedger(db, item.requestId).state);
    }
    const offer = factsByRequest
      .get(item.requestId)
      ?.find((candidate) => candidate.quoteSnapshotId === item.quoteSnapshotId);
    return decorateQuoteOverviewItem(item, offer, stateByRequest.get(item.requestId) ?? "OPEN");
  });
}
