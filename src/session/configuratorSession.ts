import type { WorkbenchNavigationState } from "../configuration/workbenchModel";
import type { SpineContext } from "../routing/appRoute";

export type ConfiguratorContext = SpineContext & { assemblyId?: string | null };
type DraftRecovery = { context: ConfiguratorContext; drafts: Record<string, string> };

export type FrozenQuoteRef = {
  productCode: string;
  quoteSnapshotId: string;
  customerId: string | null;
  requestId: string | null;
};

export type ConfiguratorSession = {
  draftRecovery?: Record<string, DraftRecovery>;
  drafts: Record<string, string>;
  draftContext: ConfiguratorContext;
  customerId: string | null;
  requestId: string | null;
  productCode: string | null;
  lastQuote: FrozenQuoteRef | null;
  customerLabel?: string | null;
  requestLabel?: string | null;
  workbenchNavigation?: Record<string, WorkbenchNavigationState>;
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
  workbenchNavigation: {},
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
    ...(presentId(record.assemblyId) ? { assemblyId: presentId(record.assemblyId) } : {}),
  };
}

function presentWorkbenchNavigation(
  value: unknown,
): Record<string, WorkbenchNavigationState> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) => {
      const navigation = asRecord(item);
      if (!navigation) {
        return [];
      }
      const composition = navigation.composition === true;
      const sectionId =
        typeof navigation.sectionId === "string" ? navigation.sectionId : null;
      return [[key, { sectionId, composition }]];
    }),
  );
}

export function workbenchNavigationForContext(
  stored: Pick<ConfiguratorSession, "workbenchNavigation">,
  selected: ConfiguratorContext,
): WorkbenchNavigationState | null {
  return stored.workbenchNavigation?.[configuratorContextKey(selected)] ?? null;
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
  return `${context.productCode ?? ""}\u001f${context.requestId ?? ""}\u001f${context.customerId ?? ""}${context.assemblyId ? `\u001f${context.assemblyId}` : ""}`;
}

export function draftContextMatches(
  stored: ConfiguratorContext,
  selected: ConfiguratorContext,
): boolean {
  if ((stored.assemblyId ?? null) !== (selected.assemblyId ?? null)) return false;
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
  stored: Pick<ConfiguratorSession, "drafts" | "draftContext" | "draftRecovery">,
  selected: ConfiguratorContext,
): Record<string, string> {
  if (draftContextMatches(stored.draftContext, selected)) return stored.drafts;
  const recovered = stored.draftRecovery?.[configuratorContextKey(selected)];
  return recovered && draftContextMatches(recovered.context, selected) ? recovered.drafts : {};
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
    const recovery = asRecord(record.draftRecovery);
    const draftRecovery = Object.fromEntries(Object.entries(recovery ?? {}).flatMap(([key, value]) => {
      const item = asRecord(value);
      const context = presentContext(item?.context);
      const values = asRecord(item?.drafts);
      return context && values ? [[key, { context, drafts: Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }]] : [];
    }));
    const explicit = presentContext(record.draftContext);
    const customerId = presentId(record.customerId);
    const requestId = presentId(record.requestId);
    const productCode = presentId(record.productCode);
    return {
      draftRecovery,
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
      workbenchNavigation: presentWorkbenchNavigation(record.workbenchNavigation),
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

export function bindConfiguratorSessionToCustomer(
  stored: ConfiguratorSession,
  customerId: string,
  customerLabel: string | null,
): ConfiguratorSession {
  if (stored.customerId === customerId) {
    return {
      ...stored,
      customerId,
      customerLabel: customerLabel ?? stored.customerLabel ?? null,
    };
  }
  return {
    ...stored,
    customerId,
    customerLabel,
    requestId: null,
    requestLabel: null,
  };
}

export type OwnedRequestRef = {
  requestId: string;
  customerId: string;
};

export function resolveOwnedSpine(input: {
  url: SpineContext;
  stored: Pick<ConfiguratorSession, "customerId" | "requestId">;
  requests: readonly OwnedRequestRef[] | null;
}): SpineContext {
  const productCode = input.url.productCode;
  const ownerOf = (requestId: string | null): string | null => {
    if (!requestId || !input.requests) {
      return null;
    }
    return input.requests.find((item) => item.requestId === requestId)?.customerId ?? null;
  };

  const urlCustomer = input.url.customerId;
  const urlRequest = input.url.requestId;
  if (urlRequest) {
    const owner = ownerOf(urlRequest);
    if (owner) {
      if (urlCustomer && urlCustomer !== owner) {
        return { customerId: urlCustomer, requestId: null, productCode };
      }
      return { customerId: urlCustomer ?? owner, requestId: urlRequest, productCode };
    }
    if (input.requests) {
      return { customerId: urlCustomer ?? input.stored.customerId, requestId: null, productCode };
    }
    const customerId = urlCustomer ?? input.stored.customerId;
    return { customerId, requestId: null, productCode };
  }

  const customerId = urlCustomer ?? input.stored.customerId;
  if (!customerId) {
    return { customerId: null, requestId: null, productCode };
  }
  const storedRequest =
    input.stored.customerId === customerId ? input.stored.requestId : null;
  if (!input.requests) {
    return { customerId, requestId: null, productCode };
  }
  if (storedRequest && input.requests && ownerOf(storedRequest) !== customerId) {
    return { customerId, requestId: null, productCode };
  }
  return { customerId, requestId: storedRequest, productCode };
}

export function writeConfiguratorSession(next: ConfiguratorSession): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const previous = readConfiguratorSession();
  const draftRecovery = { ...previous.draftRecovery };
  if (previous.draftContext.productCode) draftRecovery[configuratorContextKey(previous.draftContext)] = { context: previous.draftContext, drafts: previous.drafts };
  if (next.draftContext.productCode) {
    const key = configuratorContextKey(next.draftContext);
    delete draftRecovery[key];
    draftRecovery[key] = { context: next.draftContext, drafts: next.drafts };
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, draftRecovery: Object.fromEntries(Object.entries(draftRecovery).slice(-50)) }));
}

export function clearConfiguratorSession(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory resource cache is discarded independently at a session boundary.
  }
}
