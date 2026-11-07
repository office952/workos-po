import type {
  CommercialJourneyItemTransport,
  CommercialJourneyOfferSummaryTransport,
  CommercialJourneyTransport,
  OfferCommercialStatusTransport,
} from "../api/types";
import { asBoolean, asNumber, asRecord, asString } from "./record";

/** Reads the server offer status; absent fields stay null and never get re-derived here. */
export function presentOfferCommercialStatus(
  row: Record<string, unknown>,
): OfferCommercialStatusTransport {
  return {
    commercialStatus: asString(row.commercialStatus),
    commercialStatusLabel: asString(row.commercialStatusLabel),
    obligationKind: asString(row.obligationKind),
    followUp: asBoolean(row.followUp) ?? false,
    decided: asBoolean(row.decided) ?? false,
  };
}

function presentJourneyItems(value: unknown): CommercialJourneyItemTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    const kind = asString(row?.kind);
    const title = asString(row?.title);
    const href = asString(row?.href);
    if (!row || !kind || !title || !href) {
      return [];
    }
    return [
      {
        kind,
        key: asString(row.key) ?? `${kind}:${href}`,
        quoteSnapshotId: asString(row.quoteSnapshotId),
        quoteKind: row.quoteKind === "ASSEMBLY" || row.quoteKind === "PRODUCT" ? row.quoteKind : null,
        productCode: asString(row.productCode),
        assemblyId: asString(row.assemblyId),
        title,
        detail: asString(row.detail) ?? "",
        hint: asString(row.hint),
        actionLabel: asString(row.actionLabel) ?? "",
        href,
        action: asString(row.action) ?? "",
      },
    ];
  });
}

function presentOfferSummary(value: unknown): CommercialJourneyOfferSummaryTransport {
  const row = asRecord(value);
  const count = (key: string) => asNumber(row?.[key]) ?? 0;
  return {
    count: count("count"),
    awaitingCustomer: count("awaitingCustomer"),
    acceptedWithoutOrder: count("acceptedWithoutOrder"),
    ordered: count("ordered"),
    declined: count("declined"),
    notPursued: count("notPursued"),
    superseded: count("superseded"),
    undecided: count("undecided"),
    summaryLabel: asString(row?.summaryLabel) ?? "",
  };
}

export function presentCommercialJourney(value: unknown): CommercialJourneyTransport | null {
  const row = asRecord(value);
  const phase = asString(row?.phase);
  const nextAction = asString(row?.nextAction);
  if (!row || !phase || !nextAction) {
    return null;
  }
  const actionable = presentJourneyItems(row.actionable);
  const waiting = presentJourneyItems(row.waiting);
  return {
    offerSummary: presentOfferSummary(row.offerSummary),
    actionable,
    waiting,
    actionableCount: asNumber(row.actionableCount) ?? actionable.length,
    waitingCount: asNumber(row.waitingCount) ?? waiting.length,
    orderCount: asNumber(row.orderCount) ?? 0,
    nextAction,
    nextActionLabel: asString(row.nextActionLabel) ?? "",
    nextActionHref: asString(row.nextActionHref),
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
    phase,
    phaseLabel: asString(row.phaseLabel) ?? "",
    phaseAt: asString(row.phaseAt),
    administrativeNote: asString(row.administrativeNote),
  };
}
