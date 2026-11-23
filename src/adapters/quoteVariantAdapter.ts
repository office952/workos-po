/**
 * Commercial Continuity V2 · adapter from the variant and journal transport to what the interface
 * shows. It only checks shape. The state, its label and the single action come from the server.
 */

export type QuoteVariantAction =
  | "CONTINUE"
  | "VERIFY"
  | "SET_PRICE"
  | "REQUEST_APPROVAL"
  | "DECIDE_APPROVAL"
  | "ISSUE"
  | "OPEN"
  | "OPEN_QUOTE"
  | "RESUME";

export type QuoteVariantApproval = {
  status: string;
  statusLabel: string;
  requestedAt: string | null;
  requestedByLabel: string | null;
  decidedAt: string | null;
  decidedByLabel: string | null;
  decisionReason: string | null;
  staleReason: string | null;
  approvalId: string | null;
  requestNote: string | null;
};

export type QuoteVariantView = {
  variantId: string;
  requestId: string;
  indexLabel: string;
  productCode: string;
  productLabel: string;
  inscription: string | null;
  alternativeOfIndexLabel: string | null;
  lifecycle: "ACTIVE" | "WITHDRAWN";
  version: number;
  state: string;
  stateLabel: string;
  action: QuoteVariantAction;
  actionLabel: string;
  needsAction: boolean;
  missingCount: number;
  confirmedAt: string | null;
  confirmedByLabel: string | null;
  priceVisible: boolean;
  netPrice: number | null;
  priceForConfirmedConfiguration: boolean;
  priceSetByLabel: string | null;
  canSetPrice: boolean;
  priceBlockedReason: string | null;
  grossPrice: number | null;
  currency: string | null;
  installationNetPrice: number | null;
  approval: QuoteVariantApproval | null;
  notes: string | null;
  quoteSnapshotId: string | null;
  updatedAt: string;
  updatedByLabel: string;
};

const ACTIONS: readonly QuoteVariantAction[] = [
  "CONTINUE",
  "VERIFY",
  "SET_PRICE",
  "REQUEST_APPROVAL",
  "DECIDE_APPROVAL",
  "ISSUE",
  "OPEN",
  "OPEN_QUOTE",
  "RESUME",
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const amount = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function presentQuoteVariant(payload: unknown): QuoteVariantView | null {
  const raw = record(payload);
  if (!raw) return null;
  const variantId = text(raw.variantId);
  const requestId = text(raw.requestId);
  const productCode = text(raw.productCode);
  const stateLabel = text(raw.stateLabel);
  const actionLabel = text(raw.actionLabel);
  const action = ACTIONS.find((item) => item === raw.action);
  const version = amount(raw.version);
  if (!variantId || !requestId || !productCode || !stateLabel || !actionLabel || !action || version === null) {
    return null;
  }
  const confirmation = record(raw.confirmation);
  const price = record(raw.price);
  const totals = record(raw.totals);
  const approval = record(raw.approval);
  const alternativeOf = record(raw.alternativeOf);
  return {
    variantId,
    requestId,
    indexLabel: text(raw.indexLabel) ?? "",
    productCode,
    productLabel: text(raw.productLabel) ?? productCode,
    inscription: text(raw.inscription),
    alternativeOfIndexLabel: alternativeOf ? text(alternativeOf.indexLabel) : null,
    lifecycle: raw.lifecycle === "WITHDRAWN" ? "WITHDRAWN" : "ACTIVE",
    version,
    state: text(raw.state) ?? "",
    stateLabel,
    action,
    actionLabel,
    needsAction: raw.needsAction === true,
    missingCount: amount(raw.missingCount) ?? 0,
    confirmedAt: confirmation ? text(confirmation.confirmedAt) : null,
    confirmedByLabel: confirmation ? text(confirmation.confirmedByLabel) : null,
    priceVisible: raw.priceVisible === true,
    netPrice: price ? amount(price.netPrice) : null,
    priceForConfirmedConfiguration: price ? price.forConfirmedConfiguration === true : false,
    priceSetByLabel: price ? text(price.setByLabel) : null,
    canSetPrice: raw.canSetPrice === true,
    priceBlockedReason: text(raw.priceBlockedReason),
    grossPrice: totals ? amount(totals.grossPrice) : null,
    currency: totals ? text(totals.currency) : null,
    installationNetPrice: amount(raw.installationNetPrice),
    approval:
      approval && text(approval.status)
        ? {
            status: text(approval.status) as string,
            statusLabel: text(approval.statusLabel) ?? "",
            requestedAt: text(approval.requestedAt),
            requestedByLabel: text(approval.requestedByLabel),
            decidedAt: text(approval.decidedAt),
            decidedByLabel: text(approval.decidedByLabel),
            decisionReason: text(approval.decisionReason),
            staleReason: text(approval.staleReason),
            approvalId: text(approval.approvalId),
            requestNote: text(approval.requestNote),
          }
        : null,
    notes: text(raw.notes),
    quoteSnapshotId: text(raw.quoteSnapshotId),
    updatedAt: text(raw.updatedAt) ?? "",
    updatedByLabel: text(raw.updatedByLabel) ?? "",
  };
}

export function presentQuoteVariantList(payload: unknown): QuoteVariantView[] {
  const raw = record(payload);
  const list = raw && Array.isArray(raw.variants) ? raw.variants : [];
  return list.flatMap((item) => {
    const presented = presentQuoteVariant(item);
    return presented ? [presented] : [];
  });
}

export type QuoteVariantDetail = { variant: QuoteVariantView; values: Record<string, unknown> };

export function presentQuoteVariantDetail(payload: unknown): QuoteVariantDetail | null {
  const raw = record(payload);
  const variant = raw ? presentQuoteVariant(raw.variant) : null;
  if (!raw || !variant) return null;
  return { variant, values: record(raw.values) ?? {} };
}

/** The conflict the server reports when someone else saved first. */
export type QuoteVariantConflict = { updatedByLabel: string; updatedAt: string; version: number };

export function presentQuoteVariantConflict(body: unknown): QuoteVariantConflict | null {
  const raw = record(body);
  const current = raw && raw.error === "version_conflict" ? record(raw.current) : null;
  const version = current ? amount(current.version) : null;
  if (!current || version === null) return null;
  return { updatedByLabel: text(current.updatedByLabel) ?? "Altcineva", updatedAt: text(current.updatedAt) ?? "", version };
}

export type JournalItem = {
  key: string;
  source: "PERSON" | "APPLICATION";
  kindLabel: string;
  occurredAt: string;
  authorLabel: string;
  amountLabel: string | null;
  detail: string | null;
  notes: string | null;
  variantIndexLabel: string | null;
  rectified: boolean;
  rectifies: boolean;
  rectificationReason: string | null;
};

function money(value: number): string {
  return value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountLabel(min: number | null, max: number | null, currency: string | null): string | null {
  if (min === null && max === null) return null;
  const unit = currency ? ` ${currency}` : "";
  if (min !== null && max !== null) return min === max ? `${money(min)}${unit}` : `${money(min)} – ${money(max)}${unit}`;
  return min !== null ? `de la ${money(min)}${unit}` : `până la ${money(max as number)}${unit}`;
}

/** Person entries and application events in one thread, newest first. */
export function presentJournal(payload: unknown): JournalItem[] {
  const raw = record(payload);
  if (!raw) return [];
  const items: JournalItem[] = [];
  for (const entry of Array.isArray(raw.entries) ? raw.entries : []) {
    const item = record(entry);
    const key = item ? text(item.entryId) : null;
    if (!item || !key) continue;
    const detail = [text(item.channelLabel), text(item.interlocutor), text(item.vatBasisLabel), text(item.binding)]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    items.push({
      key,
      source: "PERSON",
      kindLabel: text(item.kindLabel) ?? "",
      occurredAt: text(item.occurredAt) ?? "",
      authorLabel: text(item.authorLabel) ?? "",
      amountLabel: amountLabel(amount(item.amountMin), amount(item.amountMax), text(item.currency)),
      detail: detail || null,
      notes: text(item.notes),
      variantIndexLabel: text(item.variantIndexLabel),
      rectified: record(item.rectifiedBy) !== null,
      rectifies: text(item.rectifiesEntryId) !== null,
      rectificationReason: text(item.rectificationReason),
    });
  }
  for (const event of Array.isArray(raw.officialEvents) ? raw.officialEvents : []) {
    const item = record(event);
    const key = item ? text(item.entryId) : null;
    if (!item || !key) continue;
    const net = amount(item.netPrice);
    items.push({
      key,
      source: "APPLICATION",
      kindLabel: text(item.kindLabel) ?? "",
      occurredAt: text(item.occurredAt) ?? "",
      authorLabel: text(item.authorLabel) ?? "",
      amountLabel: net !== null ? `${money(net)} ${text(item.currency) ?? ""} net`.trim() : null,
      detail: "din aplicație",
      notes: null,
      variantIndexLabel: text(item.variantIndexLabel),
      rectified: false,
      rectifies: false,
      rectificationReason: null,
    });
  }
  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
