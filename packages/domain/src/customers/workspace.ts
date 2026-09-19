import type { JobOverviewItem } from "../jobs/overview.js";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import { matchesSearchFields } from "../searchNormalize.js";
import {
  customerStatusLabel,
  type Customer,
  type CustomerStatus,
} from "./identity.js";

export const CUSTOMER_REGISTRY_FILTERS = ["ALL", "ACTIVE", "RETIRED"] as const;
export type CustomerRegistryFilter = (typeof CUSTOMER_REGISTRY_FILTERS)[number];

export const CUSTOMER_WORKSPACE_SECTIONS = [
  "OVERVIEW",
  "REQUESTS",
  "QUOTES",
  "JOBS",
] as const;
export type CustomerWorkspaceSection = (typeof CUSTOMER_WORKSPACE_SECTIONS)[number];

export type CustomerRegistryItem = {
  customerId: string;
  displayName: string;
  cui: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: CustomerStatus;
  statusLabel: string;
  openRequestCount: number;
  quoteCount: number;
  jobCount: number;
  needsAttention: boolean;
  attentionLabel: string | null;
  href: string;
};

export type CustomerRegistryProjection = {
  summary: {
    total: number;
    active: number;
    retired: number;
    needsAttention: number;
  };
  customers: readonly CustomerRegistryItem[];
};

export type CustomerWorkspaceNextAction = {
  label: string;
  href: string;
};

export type CustomerWorkspaceActivity = {
  at: string;
  label: string;
  href: string;
};

export type CustomerWorkspaceProjection = {
  customer: Customer;
  statusLabel: string;
  canCreateRequest: boolean;
  summary: {
    requestCount: number;
    openRequestCount: number;
    requestNeedsAction: number;
    quoteCount: number;
    quoteNeedsAction: number;
    jobCount: number;
    jobNeedsAction: number;
  };
  nextActions: readonly CustomerWorkspaceNextAction[];
  recentActivity: readonly CustomerWorkspaceActivity[];
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
};

export function customerHref(customerId: string): string {
  return `/clients/${encodeURIComponent(customerId)}`;
}

export function customerRegistryFilterLabel(filter: CustomerRegistryFilter): string {
  switch (filter) {
    case "ALL":
      return "Toți";
    case "ACTIVE":
      return "Activi";
    case "RETIRED":
      return "Retrasi";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function customerWorkspaceSectionLabel(section: CustomerWorkspaceSection): string {
  switch (section) {
    case "OVERVIEW":
      return "Prezentare";
    case "REQUESTS":
      return "Cereri";
    case "QUOTES":
      return "Oferte";
    case "JOBS":
      return "Lucrări";
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

export function matchesCustomerSearch(
  item: CustomerRegistryItem,
  query: string,
): boolean {
  return matchesSearchFields(
    [item.displayName, item.cui, item.contactName, item.phone, item.email, item.city],
    query,
  );
}

export function filterCustomerRegistry(
  overview: CustomerRegistryProjection,
  filter: CustomerRegistryFilter,
  query = "",
): readonly CustomerRegistryItem[] {
  const filtered = overview.customers.filter((item) => {
    switch (filter) {
      case "ALL":
        return true;
      case "ACTIVE":
        return item.status === "ACTIVE";
      case "RETIRED":
        return item.status === "RETIRED";
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  });
  return filtered.filter((item) => matchesCustomerSearch(item, query));
}

export function projectCustomerRegistryItem(input: {
  customer: Customer;
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
}): CustomerRegistryItem {
  const openRequestCount = input.requests.filter(
    (request) => request.status !== "CANCELLED",
  ).length;
  const requestNeedsAction = input.requests.filter((request) => request.needsAttention).length;
  const quoteNeedsAction = input.quotes.filter((quote) => quote.needsAttention).length;
  const jobNeedsAction = input.jobs.filter((job) => job.needsAttention).length;
  const attention = deriveCustomerAttention({
    requestNeedsAction,
    quoteNeedsAction,
    jobNeedsAction,
  });
  return {
    customerId: input.customer.customerId,
    displayName: input.customer.displayName,
    cui: input.customer.cui,
    contactName: input.customer.contactName,
    phone: input.customer.phone,
    email: input.customer.email,
    city: input.customer.city,
    status: input.customer.status,
    statusLabel: customerStatusLabel(input.customer.status),
    openRequestCount,
    quoteCount: input.quotes.length,
    jobCount: input.jobs.length,
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    href: customerHref(input.customer.customerId),
  };
}

export function projectCustomerRegistry(
  customers: readonly CustomerRegistryItem[],
): CustomerRegistryProjection {
  const sorted = [...customers].sort((left, right) => {
    if (left.needsAttention !== right.needsAttention) {
      return left.needsAttention ? -1 : 1;
    }
    return left.displayName.localeCompare(right.displayName, "ro");
  });
  return {
    summary: {
      total: sorted.length,
      active: sorted.filter((item) => item.status === "ACTIVE").length,
      retired: sorted.filter((item) => item.status === "RETIRED").length,
      needsAttention: sorted.filter((item) => item.needsAttention).length,
    },
    customers: sorted,
  };
}

export function projectCustomerWorkspace(input: {
  customer: Customer;
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
}): CustomerWorkspaceProjection {
  const openRequestCount = input.requests.filter(
    (request) => request.status !== "CANCELLED",
  ).length;
  const requestNeedsAction = input.requests.filter((request) => request.needsAttention).length;
  const quoteNeedsAction = input.quotes.filter((quote) => quote.needsAttention).length;
  const jobNeedsAction = input.jobs.filter((job) => job.needsAttention).length;
  return {
    customer: input.customer,
    statusLabel: customerStatusLabel(input.customer.status),
    canCreateRequest: input.customer.status === "ACTIVE",
    summary: {
      requestCount: input.requests.length,
      openRequestCount,
      requestNeedsAction,
      quoteCount: input.quotes.length,
      quoteNeedsAction,
      jobCount: input.jobs.length,
      jobNeedsAction,
    },
    nextActions: deriveWorkspaceNextActions({
      customerId: input.customer.customerId,
      canCreateRequest: input.customer.status === "ACTIVE",
      requests: input.requests,
      quotes: input.quotes,
      jobs: input.jobs,
      requestNeedsAction,
      quoteNeedsAction,
    }),
    recentActivity: deriveRecentActivity(input),
    requests: input.requests,
    quotes: input.quotes,
    jobs: input.jobs,
  };
}

export function quotesForCustomer(
  quotes: readonly QuoteOverviewItem[],
  customerId: string,
): QuoteOverviewItem[] {
  return quotes.filter((quote) => quote.customerId === customerId);
}

export function jobsForCustomer(
  jobs: readonly JobOverviewItem[],
  customerId: string,
): JobOverviewItem[] {
  return jobs.filter((job) => job.customerId === customerId);
}

export function requestsForCustomer(
  requests: readonly RequestOverviewItem[],
  customerId: string,
): RequestOverviewItem[] {
  return requests.filter((request) => request.customerId === customerId);
}

function deriveCustomerAttention(input: {
  requestNeedsAction: number;
  quoteNeedsAction: number;
  jobNeedsAction: number;
}): { needsAttention: boolean; attentionLabel: string | null } {
  if (input.requestNeedsAction > 0) {
    return {
      needsAttention: true,
      attentionLabel:
        input.requestNeedsAction === 1
          ? "1 cerere necesită acțiune"
          : `${input.requestNeedsAction} cereri necesită acțiune`,
    };
  }
  if (input.quoteNeedsAction > 0) {
    return {
      needsAttention: true,
      attentionLabel:
        input.quoteNeedsAction === 1
          ? "1 ofertă necesită acțiune"
          : `${input.quoteNeedsAction} oferte necesită acțiune`,
    };
  }
  if (input.jobNeedsAction > 0) {
    return {
      needsAttention: true,
      attentionLabel:
        input.jobNeedsAction === 1
          ? "1 lucrare necesită acțiune"
          : `${input.jobNeedsAction} lucrări necesită acțiune`,
    };
  }
  return { needsAttention: false, attentionLabel: null };
}

function deriveWorkspaceNextActions(input: {
  customerId: string;
  canCreateRequest: boolean;
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
  requestNeedsAction: number;
  quoteNeedsAction: number;
}): CustomerWorkspaceNextAction[] {
  const actions: CustomerWorkspaceNextAction[] = [];
  const request = input.requests.find((item) => item.needsAttention);
  if (request) {
    actions.push({
      label:
        input.requestNeedsAction === 1
          ? "1 cerere necesită acțiune"
          : `${input.requestNeedsAction} cereri necesită acțiune`,
      href: request.href,
    });
  }
  const quote = input.quotes.find((item) => item.needsAttention);
  if (quote) {
    actions.push({
      label:
        quote.stage === "QUOTE_ACCEPTED"
          ? "1 ofertă acceptată trebuie transformată în comandă"
          : input.quoteNeedsAction === 1
            ? "1 ofertă așteaptă acceptarea"
            : `${input.quoteNeedsAction} oferte necesită acțiune`,
      href: quote.href,
    });
  }
  const job = input.jobs.find((item) => item.needsAttention);
  if (job) {
    actions.push({
      label: job.attentionLabel ?? "O lucrare necesită acțiune",
      href: job.href,
    });
  }
  if (actions.length === 0 && input.canCreateRequest) {
    actions.push({
      label: "Creează o cerere de ofertă",
      href: `/requests?customer=${encodeURIComponent(input.customerId)}`,
    });
  }
  return actions;
}

function deriveRecentActivity(input: {
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
}): CustomerWorkspaceActivity[] {
  return [
    ...input.requests.map((request) => ({
      at: request.createdAt,
      label: `Cerere ${request.reference}`,
      href: request.href,
    })),
    ...input.quotes.map((quote) => ({
      at: quote.createdAt,
      label: `Ofertă ${quote.reference}`,
      href: quote.href,
    })),
    ...input.jobs.map((job) => ({
      at: job.createdAt,
      label: `Lucrare ${job.inscription}`,
      href: job.href,
    })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 8);
}
