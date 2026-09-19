import type { SpineContext } from "../routing/appRoute";

export type ConfiguratorContext = SpineContext;

export type FrozenQuoteRef = {
  productCode: string;
  quoteSnapshotId: string;
  customerId: string | null;
  requestId: string | null;
};

export type ConfiguratorSession = {
  drafts: Record<string, string>;
  draftContext: ConfiguratorContext;
  customerId: string | null;
  requestId: string | null;
  productCode: string | null;
  lastQuote: FrozenQuoteRef | null;
  customerLabel?: string | null;
  requestLabel?: string | null;
};

const STORAGE_KEY = "workos-ui20.configurator.v1";

const emptyContext: ConfiguratorContext = {
  productCode: null,
  requestId: null,
  customerId: null,
};

const empty: ConfiguratorSession = {
  drafts: {},
  draftContext: emptyContext,
  customerId: null,
  requestId: null,
  productCode: null,
  lastQuote: null,
  customerLabel: null,
  requestLabel: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function presentId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function presentContext(value: unknown): ConfiguratorContext | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    productCode: presentId(record.productCode),
    requestId: presentId(record.requestId),
    customerId: presentId(record.customerId),
  };
}

function presentQuoteRef(value: unknown): FrozenQuoteRef | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.productCode !== "string" ||
    typeof record.quoteSnapshotId !== "string"
  ) {
    return null;
  }
  return {
    productCode: record.productCode,
    quoteSnapshotId: record.quoteSnapshotId,
    customerId: presentId(record.customerId),
    requestId: presentId(record.requestId),
  };
}

export function configuratorContextKey(context: ConfiguratorContext): string {
  return `${context.productCode ?? ""}\u001f${context.requestId ?? ""}\u001f${context.customerId ?? ""}`;
}

export function draftContextMatches(
  stored: ConfiguratorContext,
  selected: ConfiguratorContext,
): boolean {
  if (!selected.productCode || stored.productCode !== selected.productCode) {
    return false;
  }
  if (selected.requestId) {
    return stored.requestId === selected.requestId;
  }
  if (selected.customerId) {
    return stored.customerId === selected.customerId && stored.requestId === null;
  }
  return stored.requestId === null && stored.customerId === null;
}

export function ownedDraftsForContext(
  stored: Pick<ConfiguratorSession, "drafts" | "draftContext">,
  selected: ConfiguratorContext,
): Record<string, string> {
  return draftContextMatches(stored.draftContext, selected) ? stored.drafts : {};
}

export function lastQuoteOwnedByContext(
  quote: FrozenQuoteRef | null,
  selected: ConfiguratorContext,
): FrozenQuoteRef | null {
  if (!quote) {
    return null;
  }
  return draftContextMatches(
    {
      productCode: quote.productCode,
      requestId: quote.requestId,
      customerId: quote.customerId,
    },
    selected,
  )
    ? quote
    : null;
}

export function readConfiguratorSession(): ConfiguratorSession {
  if (typeof sessionStorage === "undefined") {
    return empty;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return empty;
    }
    const record = asRecord(JSON.parse(raw));
    if (!record) {
      return empty;
    }
    const drafts = asRecord(record.drafts);
    const explicit = presentContext(record.draftContext);
    const customerId = presentId(record.customerId);
    const requestId = presentId(record.requestId);
    const productCode = presentId(record.productCode);
    return {
      drafts: drafts
        ? Object.fromEntries(
            Object.entries(drafts).filter((entry): entry is [string, string] => {
              return typeof entry[1] === "string";
            }),
          )
        : {},
      draftContext: explicit ?? {
        productCode: presentId(record.draftProductCode) ?? productCode,
        requestId,
        customerId,
      },
      customerId,
      requestId,
      productCode,
      lastQuote: presentQuoteRef(record.lastQuote),
      customerLabel: presentId(record.customerLabel),
      requestLabel: presentId(record.requestLabel),
    };
  } catch {
    return empty;
  }
}

export function labelsMatchingContext(
  stored: Pick<ConfiguratorSession, "customerId" | "requestId" | "customerLabel" | "requestLabel">,
  selected: Pick<ConfiguratorContext, "customerId" | "requestId">,
): Pick<ConfiguratorSession, "customerLabel" | "requestLabel"> {
  return {
    customerLabel:
      stored.customerId === selected.customerId ? stored.customerLabel ?? null : null,
    requestLabel: stored.requestId === selected.requestId ? stored.requestLabel ?? null : null,
  };
}

export function writeConfiguratorSession(next: ConfiguratorSession): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearConfiguratorSession(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
