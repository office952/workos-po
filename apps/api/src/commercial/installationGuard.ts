import { randomUUID } from "node:crypto";
import { commonInstallationAllowed } from "@workos-final/domain";
import { listAssemblyOrders } from "../assembly/store.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { listCommercialRequestQuoteLinks } from "../requests/store.js";
import { getOrderSnapshotByQuoteSnapshotId } from "./store.js";
import {
  completePendingCommonInstallation,
  holderInstallationStarted,
  readInstallationCommitment,
  recordCommonInstallation,
  saveCommonInstallationIntent,
} from "./installationCommitmentStore.js";

/**
 * Commercial Continuity V2 · installation is a fact of the request, copied into every quote of
 * that request. Each V2 order still copies its quote lines, including SITE_INSTALLATION.
 * A second acceptance with installation is never silent: SEPARATE records two real installations;
 * COMMON records a request-level commitment so the physical operation and the customer obligation
 * count the shared installation once (Design B overlay). Frozen quotes are never rewritten.
 */

export type InstallationDecisionInput = { mode: "SEPARATE"; reason: string } | { mode: "COMMON" } | null | false;

const REASON_MAX_LENGTH = 500;

export function readInstallationDecision(body: unknown): InstallationDecisionInput {
  if (typeof body !== "object" || body === null || !("installationDecision" in body)) return null;
  const raw = (body as { installationDecision: unknown }).installationDecision;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return false;
  const mode = (raw as { mode?: unknown }).mode;
  if (mode === "COMMON") return { mode: "COMMON" };
  if (mode !== "SEPARATE") return false;
  const reason = (raw as { reason?: unknown }).reason;
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > REASON_MAX_LENGTH) return false;
  return { mode: "SEPARATE", reason: reason.trim() };
}

type AcceptedInstallation = {
  quoteSnapshotId: string;
  kind: "PRODUCT" | "ASSEMBLY";
  netPrice: number | null;
  orderSnapshotId: string | null;
};

function decisionsAvailable(db: SqliteDatabase): boolean {
  return Boolean(
    db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'commercial_installation_decisions'").get(),
  );
}

function hasInstallationLine(lines: readonly { kind: string }[] | undefined): boolean {
  return Boolean(lines?.some((line) => line.kind === "SITE_INSTALLATION"));
}

function installationNetPrice(lines: readonly { kind: string }[] | undefined): number | null {
  const line = lines?.find((item) => item.kind === "SITE_INSTALLATION") as
    | { commercial?: { netPrice?: number | null } }
    | undefined;
  return typeof line?.commercial?.netPrice === "number" ? line.commercial.netPrice : null;
}

/** Other accepted quotes of the request that already carry the installation. */
export function acceptedInstallationsOfRequest(
  runtime: ProductSystemRuntime,
  db: SqliteDatabase,
  organizationId: string,
  requestId: string,
  exceptQuoteSnapshotId: string,
): AcceptedInstallation[] {
  const found: AcceptedInstallation[] = [];
  for (const link of listCommercialRequestQuoteLinks(db, requestId)) {
    if (link.quoteSnapshotId === exceptQuoteSnapshotId) continue;
    if (!runtime.readQuoteAcceptance(link.quoteSnapshotId)) continue;
    const snapshot = runtime.readQuoteSnapshot(link.quoteSnapshotId);
    if (!snapshot || !hasInstallationLine(snapshot.lines)) continue;
    found.push({
      quoteSnapshotId: link.quoteSnapshotId,
      kind: "PRODUCT",
      netPrice: installationNetPrice(snapshot.lines),
      orderSnapshotId: getOrderSnapshotByQuoteSnapshotId(db, link.quoteSnapshotId)?.orderSnapshotId ?? null,
    });
  }
  for (const order of listAssemblyOrders(db, organizationId)) {
    if (order.requestId !== requestId || order.sourceQuoteSnapshotId === exceptQuoteSnapshotId) continue;
    if (!order.serviceLine) continue;
    found.push({
      quoteSnapshotId: order.sourceQuoteSnapshotId,
      kind: "ASSEMBLY",
      netPrice: order.serviceLine.commercial?.netPrice ?? null,
      orderSnapshotId: order.orderSnapshotId,
    });
  }
  return found;
}

export type InstallationAcceptanceCheck =
  | {
      ok: true;
      record: null | (() => void);
      onOrderCreated: null | ((orderSnapshotId: string) => void);
    }
  | { ok: false; status: 400 | 409; body: Record<string, unknown> };

/**
 * Decides whether a quote with installation may be accepted now. `record`, when present, must be
 * called inside the caller's acceptance transaction. `onOrderCreated` completes a COMMON overlay
 * once the new order snapshot id exists.
 */
export function checkInstallationAcceptance(input: {
  runtime: ProductSystemRuntime;
  db: SqliteDatabase;
  organizationId: string;
  requestId: string | null | undefined;
  quoteSnapshotId: string;
  quoteHasInstallation: boolean;
  quoteInstallationNet: number | null;
  alreadyAccepted: boolean;
  decision: InstallationDecisionInput;
  actor: { userId: string; label: string };
}): InstallationAcceptanceCheck {
  if (input.decision === false) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_installation_decision",
        reasons: ["Decizia de montaj nu este validă. Pentru montaj separat, motivul este obligatoriu (maximum 500 de caractere)."],
      },
    };
  }
  if (!input.quoteHasInstallation || !input.requestId || input.alreadyAccepted) {
    return { ok: true, record: null, onOrderCreated: null };
  }
  const others = acceptedInstallationsOfRequest(
    input.runtime,
    input.db,
    input.organizationId,
    input.requestId,
    input.quoteSnapshotId,
  );
  if (others.length === 0) return { ok: true, record: null, onOrderCreated: null };

  const available = decisionsAvailable(input.db);
  if (available) {
    const stored = input.db
      .prepare("SELECT decision_id FROM commercial_installation_decisions WHERE quote_snapshot_id = ?")
      .get(input.quoteSnapshotId);
    if (stored) {
      return {
        ok: true,
        record: null,
        onOrderCreated: (orderSnapshotId) => {
          completePendingCommonInstallation(input.db, input.quoteSnapshotId, orderSnapshotId, input.actor);
        },
      };
    }
  }
  const related = others.map((item) => item.quoteSnapshotId);
  const holder = others.find((item) => item.orderSnapshotId) ?? others[0];
  const holderOrderSnapshotId = holder?.orderSnapshotId ?? null;
  const holderNet = holder?.netPrice ?? null;
  const started = holderInstallationStarted(input.db, input.organizationId, input.requestId);
  const existingCommitment = readInstallationCommitment(input.db, input.requestId);
  const commonAllowed = commonInstallationAllowed(started);
  const availableDecisions = available ? (commonAllowed ? ["SEPARATE", "COMMON"] : ["SEPARATE"]) : [];

  if (input.decision?.mode === "SEPARATE" && available) {
    const { reason } = input.decision;
    const requestId = input.requestId;
    return {
      ok: true,
      record: () => {
        input.db
          .prepare(
            `INSERT INTO commercial_installation_decisions (
              decision_id, request_id, quote_snapshot_id, mode, reason, related_quote_snapshot_ids,
              decided_by_user_id, decided_by_label, decided_at
            ) VALUES (?, ?, ?, 'SEPARATE', ?, ?, ?, ?, ?)`,
          )
          .run(
            `ind:${randomUUID()}`,
            requestId,
            input.quoteSnapshotId,
            reason,
            JSON.stringify(related),
            input.actor.userId,
            input.actor.label,
            new Date().toISOString(),
          );
      },
      onOrderCreated: null,
    };
  }

  const base = {
    relatedQuoteSnapshotIds: related,
    installationNetPrice: holderNet,
    availableDecisions,
  };

  if (input.decision?.mode === "COMMON") {
    if (!commonAllowed) {
      return {
        ok: false,
        status: 409,
        body: {
          ...base,
          availableDecisions: ["SEPARATE"],
          error: "common_installation_started",
          reasons: [
            "Montajul comun a început pe lucrarea care îl deține. Pentru un al doilea montaj real, consemnează motivul ca montaj separat.",
          ],
        },
      };
    }
    if (!holderOrderSnapshotId || !holder?.quoteSnapshotId) {
      return {
        ok: false,
        status: 409,
        body: {
          ...base,
          error: "installation_holder_order_required",
          reasons: [
            "Montajul comun cere ca oferta deja acceptată cu montaj să aibă și comandă. Confirmă mai întâi comanda acelei oferte.",
          ],
        },
      };
    }
    if (
      typeof input.quoteInstallationNet === "number" &&
      typeof holderNet === "number" &&
      input.quoteInstallationNet !== holderNet
    ) {
      return {
        ok: false,
        status: 409,
        body: {
          ...base,
          error: "installation_price_mismatch",
          reasons: [
            "Prețul de montaj al acestei oferte nu coincide cu montajul deja acceptat. Aliniază prețul sau consemnează două montaje reale, separate.",
          ],
        },
      };
    }
    const netPrice = holderNet ?? input.quoteInstallationNet ?? 0;
    const requestId = input.requestId;
    const holderQuoteSnapshotId = holder.quoteSnapshotId;
    return {
      ok: true,
      record: () => {
        saveCommonInstallationIntent(input.db, {
          requestId,
          memberQuoteSnapshotId: input.quoteSnapshotId,
          holderOrderSnapshotId,
          holderQuoteSnapshotId,
          netPrice,
          actor: input.actor,
        });
      },
      onOrderCreated: (orderSnapshotId) => {
        if (existingCommitment) {
          recordCommonInstallation(input.db, {
            requestId,
            holderQuoteSnapshotId: existingCommitment.holderQuoteSnapshotId,
            memberQuoteSnapshotId: input.quoteSnapshotId,
            holderOrderSnapshotId: existingCommitment.holderOrderSnapshotId,
            memberOrderSnapshotId: orderSnapshotId,
            netPrice: existingCommitment.netPrice,
            actor: input.actor,
          });
          return;
        }
        recordCommonInstallation(input.db, {
          requestId,
          holderQuoteSnapshotId,
          memberQuoteSnapshotId: input.quoteSnapshotId,
          holderOrderSnapshotId,
          memberOrderSnapshotId: orderSnapshotId,
          netPrice,
          actor: input.actor,
        });
      },
    };
  }

  return {
    ok: false,
    status: 409,
    body: {
      ...base,
      error: "installation_decision_required",
      reasons: [
        "Cererea are deja o ofertă acceptată cu montaj. Această ofertă include același montaj; acceptată fără decizie, montajul ar apărea de două ori, ca preț și ca operație.",
        commonAllowed
          ? "Alege montaj comun (o singură dată, pe o lucrare) sau două montaje reale, cu motiv."
          : "Montajul comun a început. Dacă sunt două montaje reale, separate, consemnează motivul.",
      ],
    },
  };
}
