import type {
  CustomerRegistryItemTransport,
  CustomerRegistryTransport,
  CustomerTransport,
  CustomerWorkspaceTransport,
} from "../api/types";
import { presentJobItem } from "./jobAdapter";
import { presentQuoteListItem } from "./quoteListAdapter";
import { asBoolean, asNumber, asRecord, asString } from "./record";
import { presentRequestListItem } from "./requestAdapter";

function customerStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Activ";
    case "RETIRED":
      return "Retras";
    default:
      return status;
  }
}

export function presentCustomer(value: unknown): CustomerTransport | null {
  const record = asRecord(value);
  const customer = record ? asRecord(record.customer) ?? record : null;
  if (!customer || typeof customer.customerId !== "string" || typeof customer.displayName !== "string") {
    return null;
  }
  const status = asString(customer.status) ?? "ACTIVE";
  return {
    customerId: customer.customerId,
    displayName: customer.displayName,
    status,
    statusLabel: asString(customer.statusLabel) ?? customerStatusLabel(status),
    city: asString(customer.city),
    cui: asString(customer.cui),
    contactName: asString(customer.contactName),
    phone: asString(customer.phone),
    email: asString(customer.email),
    address: asString(customer.address),
    notes: asString(customer.notes),
  };
}

export function presentCustomerList(payload: unknown): CustomerTransport[] {
  const record = asRecord(payload);
  const customers = record?.customers;
  if (!Array.isArray(customers)) {
    return [];
  }
  return customers.flatMap((item) => {
    const presented = presentCustomer(item);
    return presented ? [presented] : [];
  });
}

function presentRegistryItem(value: unknown): CustomerRegistryItemTransport | null {
  const presented = presentCustomer(value);
  const row = asRecord(value);
  if (!presented || !row) {
    return null;
  }
  return {
    ...presented,
    openRequestCount: asNumber(row.openRequestCount) ?? 0,
    quoteCount: asNumber(row.quoteCount) ?? 0,
    jobCount: asNumber(row.jobCount) ?? 0,
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
  };
}

export function presentCustomerRegistry(payload: unknown): CustomerRegistryTransport {
  const record = asRecord(payload);
  const registry = asRecord(record?.registry);
  const summary = asRecord(registry?.summary);
  const fromRegistry = Array.isArray(registry?.customers)
    ? registry.customers.flatMap((item) => {
        const presented = presentRegistryItem(item);
        return presented ? [presented] : [];
      })
    : [];
  const customers = fromRegistry.length > 0
    ? fromRegistry
    : presentCustomerList(payload).map((item) => ({
        ...item,
        openRequestCount: 0,
        quoteCount: 0,
        jobCount: 0,
        needsAttention: false,
        attentionLabel: null,
      }));
  return {
    summary: {
      total: asNumber(summary?.total) ?? customers.length,
      active: asNumber(summary?.active) ?? customers.filter((item) => item.status === "ACTIVE").length,
      retired: asNumber(summary?.retired) ?? customers.filter((item) => item.status === "RETIRED").length,
      needsAttention:
        asNumber(summary?.needsAttention) ?? customers.filter((item) => item.needsAttention).length,
    },
    customers,
  };
}

export function presentCustomerWorkspace(payload: unknown): CustomerWorkspaceTransport | null {
  const record = asRecord(payload);
  const workspace = asRecord(record?.workspace) ?? record;
  if (!workspace) {
    return null;
  }
  const customer = presentCustomer(workspace.customer ?? workspace);
  if (!customer || typeof workspace.canCreateRequest !== "boolean") {
    return null;
  }
  const summary = asRecord(workspace.summary);
  const requests = Array.isArray(workspace.requests)
    ? workspace.requests.flatMap((item) => {
        const presented = presentRequestListItem(item);
        return presented ? [presented] : [];
      })
    : [];
  const quotes = Array.isArray(workspace.quotes)
    ? workspace.quotes.flatMap((item) => {
        const presented = presentQuoteListItem(item);
        return presented ? [presented] : [];
      })
    : [];
  const jobs = Array.isArray(workspace.jobs)
    ? workspace.jobs.flatMap((item) => {
        const presented = presentJobItem(item);
        return presented ? [presented] : [];
      })
    : [];
  return {
    customer,
    canCreateRequest: workspace.canCreateRequest,
    summary: {
      requestCount: asNumber(summary?.requestCount) ?? requests.length,
      openRequestCount: asNumber(summary?.openRequestCount) ?? requests.length,
      requestNeedsAction:
        asNumber(summary?.requestNeedsAction) ?? requests.filter((item) => item.needsAttention).length,
      quoteCount: asNumber(summary?.quoteCount) ?? quotes.length,
      quoteNeedsAction:
        asNumber(summary?.quoteNeedsAction) ?? quotes.filter((item) => item.needsAttention).length,
      jobCount: asNumber(summary?.jobCount) ?? jobs.length,
      jobNeedsAction:
        asNumber(summary?.jobNeedsAction) ?? jobs.filter((item) => item.needsAttention).length,
    },
    requests,
    quotes,
    jobs,
  };
}
