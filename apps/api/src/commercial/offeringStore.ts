import { randomUUID } from "node:crypto";
import {
  DEFAULT_OFFERING_POLICY,
  OFFERING_POLICY_SCHEMA,
  OFFERING_RULE_IDS,
  isOfferingPolicyMode,
  type IncompleteCostAcceptance,
  type OfferingPolicy,
  type OfferingPolicyMode,
  type OfferingPolicyRules,
  type OfferingRuleId,
  type PriceApprovalRecord,
  type PriceApprovalStatus,
  type PriceApprovalSubject,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type PolicyRow = {
  version: number;
  mode: string;
  incomplete_cost_requires_approval: number;
  minimum_margin_percent: number | null;
  maximum_net_value: number | null;
  created_at: string;
  created_by_user_id: string;
  created_by_label: string;
};

function policyFromRow(row: PolicyRow): OfferingPolicy | null {
  if (!isOfferingPolicyMode(row.mode)) return null;
  return {
    schema: OFFERING_POLICY_SCHEMA,
    mode: row.mode,
    rules: {
      incompleteCostRequiresApproval: row.incomplete_cost_requires_approval === 1,
      minimumMarginPercent: row.minimum_margin_percent,
      maximumNetValue: row.maximum_net_value,
    },
    version: row.version,
    source: "ORGANIZATION",
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    createdByLabel: row.created_by_label,
  };
}

/** Effective policy: latest stored version, or OWNER_ONLY (platform default, never stored). */
export function readEffectiveOfferingPolicy(db: SqliteDatabase): OfferingPolicy {
  const row = db
    .prepare("SELECT * FROM organization_offering_policy_versions ORDER BY version DESC LIMIT 1")
    .get() as PolicyRow | undefined;
  if (!row) return DEFAULT_OFFERING_POLICY;
  // An unreadable stored row fails closed to the Owner-only behaviour.
  return policyFromRow(row) ?? { ...DEFAULT_OFFERING_POLICY, version: row.version, source: "ORGANIZATION" };
}

export function listOfferingPolicyVersions(db: SqliteDatabase): OfferingPolicy[] {
  const rows = db
    .prepare("SELECT * FROM organization_offering_policy_versions ORDER BY version DESC")
    .all() as PolicyRow[];
  return rows.flatMap((row) => {
    const policy = policyFromRow(row);
    return policy ? [policy] : [];
  });
}

export type OfferingPolicySaveResult =
  | { ok: true; policy: OfferingPolicy; alreadyApplied: boolean }
  | { ok: false; error: "version_conflict"; currentVersion: number };

export function saveOfferingPolicy(
  db: SqliteDatabase,
  input: { mode: OfferingPolicyMode; rules: OfferingPolicyRules },
  actor: { userId: string; label: string },
  expectedVersion: number,
  now = new Date().toISOString(),
): OfferingPolicySaveResult {
  return db.transaction((): OfferingPolicySaveResult => {
    const current = readEffectiveOfferingPolicy(db);
    if (expectedVersion !== current.version) {
      return { ok: false, error: "version_conflict", currentVersion: current.version };
    }
    if (
      current.mode === input.mode &&
      current.rules.incompleteCostRequiresApproval === input.rules.incompleteCostRequiresApproval &&
      current.rules.minimumMarginPercent === input.rules.minimumMarginPercent &&
      current.rules.maximumNetValue === input.rules.maximumNetValue
    ) {
      return { ok: true, policy: current, alreadyApplied: true };
    }
    const version = current.version + 1;
    db.prepare(
      `INSERT INTO organization_offering_policy_versions (
        version, policy_schema, mode, incomplete_cost_requires_approval, minimum_margin_percent,
        maximum_net_value, created_at, created_by_user_id, created_by_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      version,
      OFFERING_POLICY_SCHEMA,
      input.mode,
      input.rules.incompleteCostRequiresApproval ? 1 : 0,
      input.rules.minimumMarginPercent,
      input.rules.maximumNetValue,
      now,
      actor.userId,
      actor.label,
    );
    return { ok: true, policy: readEffectiveOfferingPolicy(db), alreadyApplied: false };
  })();
}

// ---------------------------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------------------------

type ApprovalRow = {
  approval_id: string;
  subject_kind: string;
  request_id: string;
  product_code: string;
  binding_hash: string;
  policy_version: number;
  policy_mode: string;
  net_price: number;
  installation_net_price: number | null;
  internal_cost_complete: number;
  triggered_rules: string;
  status: string;
  requested_by_user_id: string;
  requested_by_label: string;
  requested_at: string;
  request_note: string | null;
  decided_by_user_id: string | null;
  decided_by_label: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};

function approvalFromRow(row: ApprovalRow, organizationId: string): PriceApprovalRecord {
  let rules: OfferingRuleId[] = [];
  try {
    const parsed = JSON.parse(row.triggered_rules) as unknown;
    rules = Array.isArray(parsed)
      ? parsed.filter((item): item is OfferingRuleId => (OFFERING_RULE_IDS as readonly string[]).includes(item))
      : [];
  } catch {
    rules = [];
  }
  return {
    approvalId: row.approval_id,
    subject: {
      kind: "PRODUCT_QUOTE",
      organizationId,
      requestId: row.request_id,
      productCode: row.product_code,
    },
    bindingHash: row.binding_hash,
    policyVersion: row.policy_version,
    policyMode: isOfferingPolicyMode(row.policy_mode) ? row.policy_mode : "OWNER_ONLY",
    netPrice: row.net_price,
    installationNetPrice: row.installation_net_price,
    currency: "EUR",
    internalCostComplete: row.internal_cost_complete === 1,
    triggeredRules: rules,
    status: row.status as PriceApprovalStatus,
    requestedByUserId: row.requested_by_user_id,
    requestedByLabel: row.requested_by_label,
    requestedAt: row.requested_at,
    requestNote: row.request_note,
    decidedByUserId: row.decided_by_user_id,
    decidedByLabel: row.decided_by_label,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
  };
}

export function readLatestPriceApproval(
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
  productCode: string,
): PriceApprovalRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM commercial_price_approvals
       WHERE request_id = ? AND product_code = ? AND subject_kind = 'PRODUCT_QUOTE'
       ORDER BY requested_at DESC, rowid DESC LIMIT 1`,
    )
    .get(requestId, productCode) as ApprovalRow | undefined;
  return row ? approvalFromRow(row, organizationId) : null;
}

export function readPriceApproval(
  db: SqliteDatabase,
  organizationId: string,
  approvalId: string,
): PriceApprovalRecord | null {
  const row = db.prepare("SELECT * FROM commercial_price_approvals WHERE approval_id = ?").get(approvalId) as
    | ApprovalRow
    | undefined;
  return row ? approvalFromRow(row, organizationId) : null;
}

export function listPriceApprovals(
  db: SqliteDatabase,
  organizationId: string,
  options: { status?: PriceApprovalStatus; limit?: number } = {},
): PriceApprovalRecord[] {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = (
    options.status
      ? db
          .prepare("SELECT * FROM commercial_price_approvals WHERE status = ? ORDER BY requested_at DESC LIMIT ?")
          .all(options.status, limit)
      : db.prepare("SELECT * FROM commercial_price_approvals ORDER BY requested_at DESC LIMIT ?").all(limit)
  ) as ApprovalRow[];
  return rows.map((row) => approvalFromRow(row, organizationId));
}

export type ApprovalEvent = {
  eventId: string;
  approvalId: string;
  sequence: number;
  kind: PriceApprovalStatus;
  actorUserId: string;
  actorLabel: string;
  occurredAt: string;
  reason: string | null;
};

export function listPriceApprovalEvents(db: SqliteDatabase, approvalId: string): ApprovalEvent[] {
  const rows = db
    .prepare("SELECT * FROM commercial_price_approval_events WHERE approval_id = ? ORDER BY sequence ASC")
    .all(approvalId) as {
    event_id: string;
    approval_id: string;
    sequence: number;
    event_kind: string;
    actor_user_id: string;
    actor_label: string;
    occurred_at: string;
    reason: string | null;
  }[];
  return rows.map((row) => ({
    eventId: row.event_id,
    approvalId: row.approval_id,
    sequence: row.sequence,
    kind: row.event_kind as PriceApprovalStatus,
    actorUserId: row.actor_user_id,
    actorLabel: row.actor_label,
    occurredAt: row.occurred_at,
    reason: row.reason,
  }));
}

function appendApprovalEvent(
  db: SqliteDatabase,
  approvalId: string,
  kind: PriceApprovalStatus,
  actor: { userId: string; label: string },
  at: string,
  reason: string | null,
): void {
  const next = db
    .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM commercial_price_approval_events WHERE approval_id = ?")
    .get(approvalId) as { next: number };
  db.prepare(
    `INSERT INTO commercial_price_approval_events
      (event_id, approval_id, sequence, event_kind, actor_user_id, actor_label, occurred_at, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`ape:${randomUUID()}`, approvalId, next.next, kind, actor.userId, actor.label, at, reason);
}

export type ApprovalRequestResult =
  | { ok: true; approval: PriceApprovalRecord; alreadyRequested: boolean }
  | { ok: false; error: "approval_already_decided"; approval: PriceApprovalRecord };

/**
 * Records a new request for the exact binding. An open request for the same binding is reused; an
 * open request for an older binding is withdrawn (journaled) so only one request is open.
 */
export function requestPriceApproval(
  db: SqliteDatabase,
  input: {
    subject: PriceApprovalSubject;
    bindingHash: string;
    policyVersion: number;
    policyMode: OfferingPolicyMode;
    netPrice: number;
    installationNetPrice: number | null;
    internalCostComplete: boolean;
    triggeredRules: readonly OfferingRuleId[];
    note: string | null;
  },
  actor: { userId: string; label: string },
  now = new Date().toISOString(),
): ApprovalRequestResult {
  return db.transaction((): ApprovalRequestResult => {
    const latest = readLatestPriceApproval(db, input.subject.organizationId, input.subject.requestId, input.subject.productCode);
    if (latest && latest.bindingHash === input.bindingHash) {
      if (latest.status === "REQUESTED") return { ok: true, approval: latest, alreadyRequested: true };
      if (latest.status === "APPROVED" || latest.status === "REJECTED") {
        return { ok: false, error: "approval_already_decided", approval: latest };
      }
    }
    if (latest && latest.status === "REQUESTED") {
      db.prepare("UPDATE commercial_price_approvals SET status = 'WITHDRAWN' WHERE approval_id = ? AND status = 'REQUESTED'").run(
        latest.approvalId,
      );
      appendApprovalEvent(db, latest.approvalId, "WITHDRAWN", actor, now, "Oferta s-a schimbat; solicitare nouă.");
    }
    const approvalId = `apr:${randomUUID()}`;
    db.prepare(
      `INSERT INTO commercial_price_approvals (
        approval_id, subject_kind, request_id, product_code, binding_hash, policy_version, policy_mode,
        net_price, installation_net_price, internal_cost_complete, triggered_rules, status,
        requested_by_user_id, requested_by_label, requested_at, request_note
      ) VALUES (?, 'PRODUCT_QUOTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
    ).run(
      approvalId,
      input.subject.requestId,
      input.subject.productCode,
      input.bindingHash,
      input.policyVersion,
      input.policyMode,
      input.netPrice,
      input.installationNetPrice,
      input.internalCostComplete ? 1 : 0,
      JSON.stringify(input.triggeredRules),
      actor.userId,
      actor.label,
      now,
      input.note,
    );
    appendApprovalEvent(db, approvalId, "REQUESTED", actor, now, input.note);
    return {
      ok: true,
      approval: readPriceApproval(db, input.subject.organizationId, approvalId) as PriceApprovalRecord,
      alreadyRequested: false,
    };
  })();
}

export type ApprovalDecisionResult =
  | { ok: true; approval: PriceApprovalRecord }
  | { ok: false; error: "not_found" | "approval_not_open" };

/** The decision is written once, only on an open request (no retroactive approvals). */
export function decidePriceApproval(
  db: SqliteDatabase,
  organizationId: string,
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null,
  actor: { userId: string; label: string },
  now = new Date().toISOString(),
): ApprovalDecisionResult {
  return db.transaction((): ApprovalDecisionResult => {
    const current = readPriceApproval(db, organizationId, approvalId);
    if (!current) return { ok: false, error: "not_found" };
    if (current.status !== "REQUESTED") return { ok: false, error: "approval_not_open" };
    db.prepare(
      `UPDATE commercial_price_approvals
       SET status = ?, decided_by_user_id = ?, decided_by_label = ?, decided_at = ?, decision_reason = ?
       WHERE approval_id = ? AND status = 'REQUESTED'`,
    ).run(decision, actor.userId, actor.label, now, reason, approvalId);
    appendApprovalEvent(db, approvalId, decision, actor, now, reason);
    return { ok: true, approval: readPriceApproval(db, organizationId, approvalId) as PriceApprovalRecord };
  })();
}

// ---------------------------------------------------------------------------------------------
// AUD-PRICING-002 incomplete cost acceptance registry
// ---------------------------------------------------------------------------------------------

export function persistIncompleteCostAcceptance(
  db: SqliteDatabase,
  acceptanceId: string,
  value: IncompleteCostAcceptance,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO quote_incomplete_cost_acceptances (
      acceptance_id, quote_snapshot_id, quote_content_hash, policy, cost_completeness,
      accepted_by_user_id, accepted_at, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    acceptanceId,
    value.quoteSnapshotId,
    value.quoteContentHash,
    value.policy,
    value.costCompleteness,
    value.acceptedByUserId,
    value.acceptedAt,
    value.reason,
  );
}

export function readIncompleteCostAcceptance(
  db: SqliteDatabase,
  quoteSnapshotId: string,
): IncompleteCostAcceptance | null {
  const row = db
    .prepare("SELECT * FROM quote_incomplete_cost_acceptances WHERE quote_snapshot_id = ?")
    .get(quoteSnapshotId) as
    | {
        quote_snapshot_id: string;
        quote_content_hash: string;
        policy: string;
        cost_completeness: string;
        accepted_by_user_id: string;
        accepted_at: string;
        reason: string;
      }
    | undefined;
  if (!row || row.policy !== "INCOMPLETE_COST_ACCEPTANCE_V1" || row.cost_completeness !== "PARTIAL") return null;
  return {
    policy: "INCOMPLETE_COST_ACCEPTANCE_V1",
    quoteSnapshotId: row.quote_snapshot_id,
    quoteContentHash: row.quote_content_hash,
    costCompleteness: "PARTIAL",
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    reason: row.reason,
  };
}
