import { randomUUID } from "node:crypto";
import {
  INSTALL_AT_SITE_ID,
  PACK_PRODUCT_ID,
  commitmentAfterHolderLeft,
  commitmentAfterMemberLeft,
  consolidatedCustomerObligationNet,
  duplicatedInstallationDocumentNet,
  groupedOrderSnapshotIds,
  holderInstallationMayStart,
  shouldSkipSiteInstallationOperation,
  type InstallationCommitmentEventKind,
  type InstallationCommitmentState,
} from "@workos-final/domain";
import { readAssemblyOrder, readAssemblyOrderByQuote, readAssemblyProductionByOrder, readAssemblyProductionBySnapshot } from "../assembly/store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { getAcceptedProductionSnapshot, getAcceptedProductionSnapshotByOrder } from "../production/store.js";
import { getCommercialRequestQuoteLinkByQuote } from "../requests/store.js";
import { getOrderSnapshot, getOrderSnapshotByQuoteSnapshotId } from "./store.js";

type EventRow = {
  request_id: string;
  event_kind: InstallationCommitmentEventKind;
  holder_order_snapshot_id: string | null;
  holder_quote_snapshot_id: string | null;
  member_order_snapshot_ids: string;
  member_quote_snapshot_ids: string;
  net_price: number;
  actor_label: string;
  occurred_at: string;
};

export type InstallationObligationView = {
  mode: "COMMON";
  holderOrderSnapshotId: string;
  holderQuoteSnapshotId: string;
  memberOrderSnapshotIds: readonly string[];
  memberQuoteSnapshotIds: readonly string[];
  sharedInstallationNet: number;
  documentSumNet: number;
  duplicatedInstallationNet: number;
  consolidatedObligationNet: number;
  decidedByLabel: string;
  decidedAt: string;
};

type Actor = { userId: string; label: string };

function eventsAvailable(db: SqliteDatabase): boolean {
  return Boolean(
    db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'commercial_installation_commitment_events'").get(),
  );
}

function intentsAvailable(db: SqliteDatabase): boolean {
  return Boolean(
    db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'commercial_installation_common_intents'").get(),
  );
}

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function fromRow(row: EventRow): InstallationCommitmentState | null {
  if (row.event_kind === "ENDED" || !row.holder_order_snapshot_id || !row.holder_quote_snapshot_id) return null;
  return {
    requestId: row.request_id,
    holderOrderSnapshotId: row.holder_order_snapshot_id,
    holderQuoteSnapshotId: row.holder_quote_snapshot_id,
    memberOrderSnapshotIds: parseIds(row.member_order_snapshot_ids),
    memberQuoteSnapshotIds: parseIds(row.member_quote_snapshot_ids),
    netPrice: row.net_price,
    decidedByLabel: row.actor_label,
    decidedAt: row.occurred_at,
  };
}

export function readInstallationCommitment(db: SqliteDatabase, requestId: string): InstallationCommitmentState | null {
  if (!eventsAvailable(db)) return null;
  const row = db
    .prepare(
      `SELECT request_id, event_kind, holder_order_snapshot_id, holder_quote_snapshot_id,
              member_order_snapshot_ids, member_quote_snapshot_ids, net_price, actor_label, occurred_at
       FROM commercial_installation_commitment_events
       WHERE request_id = ?
       ORDER BY sequence DESC
       LIMIT 1`,
    )
    .get(requestId) as EventRow | undefined;
  return row ? fromRow(row) : null;
}

function nextSequence(db: SqliteDatabase, requestId: string): number {
  const row = db
    .prepare("SELECT MAX(sequence) AS sequence FROM commercial_installation_commitment_events WHERE request_id = ?")
    .get(requestId) as { sequence: number | null };
  return (row.sequence ?? 0) + 1;
}

function appendEvent(
  db: SqliteDatabase,
  state: InstallationCommitmentState | { requestId: string; netPrice: number },
  kind: InstallationCommitmentEventKind,
  actor: Actor,
  detail?: string,
): void {
  const holderOrder = "holderOrderSnapshotId" in state ? state.holderOrderSnapshotId : null;
  const holderQuote = "holderQuoteSnapshotId" in state ? state.holderQuoteSnapshotId : null;
  const members = "memberOrderSnapshotIds" in state ? [...state.memberOrderSnapshotIds] : [];
  const memberQuotes = "memberQuoteSnapshotIds" in state ? [...state.memberQuoteSnapshotIds] : [];
  db.prepare(
    `INSERT INTO commercial_installation_commitment_events (
      event_id, request_id, sequence, event_kind,
      holder_order_snapshot_id, holder_quote_snapshot_id,
      member_order_snapshot_ids, member_quote_snapshot_ids,
      net_price, actor_user_id, actor_label, occurred_at, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `ice:${randomUUID()}`,
    state.requestId,
    nextSequence(db, state.requestId),
    kind,
    holderOrder,
    holderQuote,
    JSON.stringify(members),
    JSON.stringify(memberQuotes),
    state.netPrice,
    actor.userId,
    actor.label,
    new Date().toISOString(),
    detail ?? null,
  );
}

export function recordCommonInstallation(
  db: SqliteDatabase,
  input: {
    requestId: string;
    holderQuoteSnapshotId: string;
    memberQuoteSnapshotId: string;
    holderOrderSnapshotId: string;
    memberOrderSnapshotId: string;
    netPrice: number;
    actor: Actor;
  },
): InstallationCommitmentState {
  const current = readInstallationCommitment(db, input.requestId);
  if (!current) {
    const created: InstallationCommitmentState = {
      requestId: input.requestId,
      holderOrderSnapshotId: input.holderOrderSnapshotId,
      holderQuoteSnapshotId: input.holderQuoteSnapshotId,
      memberOrderSnapshotIds: [input.memberOrderSnapshotId],
      memberQuoteSnapshotIds: [input.memberQuoteSnapshotId],
      netPrice: input.netPrice,
      decidedByLabel: input.actor.label,
      decidedAt: new Date().toISOString(),
    };
    appendEvent(db, created, "CREATED", input.actor);
    return created;
  }
  if (
    current.memberOrderSnapshotIds.includes(input.memberOrderSnapshotId) ||
    current.holderOrderSnapshotId === input.memberOrderSnapshotId
  ) {
    return current;
  }
  const joined: InstallationCommitmentState = {
    ...current,
    memberOrderSnapshotIds: [...current.memberOrderSnapshotIds, input.memberOrderSnapshotId],
    memberQuoteSnapshotIds: [...current.memberQuoteSnapshotIds, input.memberQuoteSnapshotId],
  };
  appendEvent(db, joined, "MEMBER_JOINED", input.actor);
  return joined;
}

export function saveCommonInstallationIntent(
  db: SqliteDatabase,
  input: {
    requestId: string;
    memberQuoteSnapshotId: string;
    holderOrderSnapshotId: string;
    holderQuoteSnapshotId: string;
    netPrice: number;
    actor: Actor;
  },
): void {
  if (!intentsAvailable(db)) return;
  db.prepare(
    `INSERT INTO commercial_installation_common_intents (
      quote_snapshot_id, request_id, holder_order_snapshot_id, holder_quote_snapshot_id,
      net_price, decided_by_user_id, decided_by_label, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(quote_snapshot_id) DO UPDATE SET
      holder_order_snapshot_id = excluded.holder_order_snapshot_id,
      holder_quote_snapshot_id = excluded.holder_quote_snapshot_id,
      net_price = excluded.net_price,
      decided_by_user_id = excluded.decided_by_user_id,
      decided_by_label = excluded.decided_by_label,
      decided_at = excluded.decided_at`,
  ).run(
    input.memberQuoteSnapshotId,
    input.requestId,
    input.holderOrderSnapshotId,
    input.holderQuoteSnapshotId,
    input.netPrice,
    input.actor.userId,
    input.actor.label,
    new Date().toISOString(),
  );
}

export function completePendingCommonInstallation(
  db: SqliteDatabase,
  memberQuoteSnapshotId: string,
  memberOrderSnapshotId: string,
  actor: Actor,
): InstallationCommitmentState | null {
  if (!intentsAvailable(db)) return null;
  const intent = db
    .prepare(
      `SELECT request_id AS requestId, holder_order_snapshot_id AS holderOrderSnapshotId,
              holder_quote_snapshot_id AS holderQuoteSnapshotId, net_price AS netPrice,
              decided_by_user_id AS userId, decided_by_label AS label
       FROM commercial_installation_common_intents WHERE quote_snapshot_id = ?`,
    )
    .get(memberQuoteSnapshotId) as
    | {
        requestId: string;
        holderOrderSnapshotId: string;
        holderQuoteSnapshotId: string;
        netPrice: number;
        userId: string;
        label: string;
      }
    | undefined;
  if (!intent) return null;
  const state = recordCommonInstallation(db, {
    requestId: intent.requestId,
    holderQuoteSnapshotId: intent.holderQuoteSnapshotId,
    memberQuoteSnapshotId,
    holderOrderSnapshotId: intent.holderOrderSnapshotId,
    memberOrderSnapshotId,
    netPrice: intent.netPrice,
    actor: actor.userId ? actor : { userId: intent.userId, label: intent.label },
  });
  db.prepare("DELETE FROM commercial_installation_common_intents WHERE quote_snapshot_id = ?").run(memberQuoteSnapshotId);
  return state;
}

export function recordCommitmentDeparture(
  db: SqliteDatabase,
  requestId: string,
  leavingOrderSnapshotId: string,
  leavingQuoteSnapshotId: string,
  actor: Actor,
): InstallationCommitmentState | null {
  const current = readInstallationCommitment(db, requestId);
  if (!current) return null;
  const holderLeft = leavingOrderSnapshotId === current.holderOrderSnapshotId;
  const next = holderLeft
    ? commitmentAfterHolderLeft(current)
    : commitmentAfterMemberLeft(current, leavingOrderSnapshotId, leavingQuoteSnapshotId);
  if (!next) {
    appendEvent(db, { requestId, netPrice: current.netPrice }, "ENDED", actor, leavingOrderSnapshotId);
    return null;
  }
  appendEvent(db, next, holderLeft ? "HOLDER_REASSIGNED" : "MEMBER_LEFT", actor, leavingOrderSnapshotId);
  return next;
}

function documentNetForQuote(db: SqliteDatabase, organizationId: string, quoteSnapshotId: string): number {
  const product = getOrderSnapshotByQuoteSnapshotId(db, quoteSnapshotId);
  if (product) {
    if (typeof product.jobCommercial?.netPrice === "number") return product.jobCommercial.netPrice;
    const productNet = typeof product.commercial?.netPrice === "number" ? product.commercial.netPrice : 0;
    const install = product.lines?.find((line) => line.kind === "SITE_INSTALLATION");
    const installNet = install && "commercial" in install ? (install.commercial?.netPrice ?? 0) : 0;
    return productNet + installNet;
  }
  const assembly = readAssemblyOrderByQuote(db, organizationId, quoteSnapshotId);
  return assembly && typeof assembly.totals?.netPrice === "number" ? assembly.totals.netPrice : 0;
}

export function presentInstallationObligation(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
): InstallationObligationView | null {
  const commitment = readInstallationCommitment(db, requestId);
  if (!commitment) return null;
  const quoteIds = [commitment.holderQuoteSnapshotId, ...commitment.memberQuoteSnapshotIds];
  const documentNets = quoteIds.map((quoteId) => documentNetForQuote(db, organizationId, quoteId));
  const documentSumNet = documentNets.reduce((sum, value) => sum + value, 0);
  return {
    mode: "COMMON",
    holderOrderSnapshotId: commitment.holderOrderSnapshotId,
    holderQuoteSnapshotId: commitment.holderQuoteSnapshotId,
    memberOrderSnapshotIds: commitment.memberOrderSnapshotIds,
    memberQuoteSnapshotIds: commitment.memberQuoteSnapshotIds,
    sharedInstallationNet: commitment.netPrice,
    documentSumNet,
    duplicatedInstallationNet: duplicatedInstallationDocumentNet(quoteIds.length, commitment.netPrice),
    consolidatedObligationNet: consolidatedCustomerObligationNet(documentNets, commitment.netPrice),
    decidedByLabel: commitment.decidedByLabel,
    decidedAt: commitment.decidedAt,
  };
}

export function skipSiteInstallationForOrder(
  db: SqliteDatabase,
  requestId: string | null | undefined,
  orderSnapshotId: string,
): boolean {
  if (!requestId) return false;
  return shouldSkipSiteInstallationOperation(orderSnapshotId, readInstallationCommitment(db, requestId));
}

function productionSnapshotIdForOrder(db: SqliteDatabase, organizationId: string, orderSnapshotId: string): string | null {
  return (
    getAcceptedProductionSnapshotByOrder(db, orderSnapshotId)?.snapshotId ??
    readAssemblyProductionByOrder(db, organizationId, orderSnapshotId)?.snapshotId ??
    null
  );
}

function taskStamp(
  db: SqliteDatabase,
  sourceSnapshotId: string,
  processId: string,
): { startedAt: string | null; completedAt: string | null } | null {
  const row = db
    .prepare(
      `SELECT t.started_at AS startedAt, t.completed_at AS completedAt
       FROM execution_tasks t
       INNER JOIN execution_plans p ON p.plan_id = t.plan_id
       WHERE p.source_snapshot_id = ? AND t.process_id = ?
       LIMIT 1`,
    )
    .get(sourceSnapshotId, processId) as { startedAt: string | null; completedAt: string | null } | undefined;
  return row ?? null;
}

function packComplete(db: SqliteDatabase, organizationId: string, orderSnapshotId: string): boolean {
  const snapshotId = productionSnapshotIdForOrder(db, organizationId, orderSnapshotId);
  if (!snapshotId) return false;
  return Boolean(taskStamp(db, snapshotId, PACK_PRODUCT_ID)?.completedAt);
}

export function holderInstallationStarted(db: SqliteDatabase, organizationId: string, requestId: string): boolean {
  const commitment = readInstallationCommitment(db, requestId);
  if (!commitment) return false;
  const snapshotId = productionSnapshotIdForOrder(db, organizationId, commitment.holderOrderSnapshotId);
  if (!snapshotId) return false;
  return Boolean(taskStamp(db, snapshotId, INSTALL_AT_SITE_ID)?.startedAt);
}

export function holderInstallationStartBlocked(
  db: SqliteDatabase,
  organizationId: string,
  sourceSnapshotId: string,
  processId: string,
): { blocked: true; reasons: string[] } | { blocked: false } {
  if (processId !== INSTALL_AT_SITE_ID) return { blocked: false };
  const product = getAcceptedProductionSnapshot(db, sourceSnapshotId);
  const assembly = readAssemblyProductionBySnapshot(db, organizationId, sourceSnapshotId);
  const orderSnapshotId = product?.sourceOrderSnapshotId ?? assembly?.sourceOrderSnapshotId ?? null;
  if (!orderSnapshotId) return { blocked: false };
  const productOrder = getOrderSnapshot(db, orderSnapshotId);
  const assemblyOrder = readAssemblyOrder(db, organizationId, orderSnapshotId);
  const quoteId = productOrder?.sourceQuoteSnapshotId ?? assemblyOrder?.sourceQuoteSnapshotId ?? null;
  const requestId =
    assemblyOrder?.requestId ?? (quoteId ? getCommercialRequestQuoteLinkByQuote(db, quoteId)?.requestId : null) ?? null;
  if (!requestId) return { blocked: false };
  const commitment = readInstallationCommitment(db, requestId);
  if (!commitment || commitment.holderOrderSnapshotId !== orderSnapshotId) return { blocked: false };
  const packed = commitment.memberOrderSnapshotIds.map((memberId) => packComplete(db, organizationId, memberId));
  if (holderInstallationMayStart(packed)) return { blocked: false };
  return {
    blocked: true,
    reasons: [
      "Montajul comun pornește după ce fiecare lucrare din grup este ambalată. Nu se creează o a doua operație de montaj.",
    ],
  };
}

export function orderIdsInCommitment(state: InstallationCommitmentState): readonly string[] {
  return groupedOrderSnapshotIds(state);
}
