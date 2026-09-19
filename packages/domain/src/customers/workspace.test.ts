import { describe, expect, it } from "vitest";
import type { JobOverviewItem } from "../jobs/overview.js";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import { createCustomer, renameCustomer, retireCustomer } from "./identity.js";
import {
  customerHref,
  filterCustomerRegistry,
  jobsForCustomer,
  projectCustomerRegistry,
  projectCustomerRegistryItem,
  projectCustomerWorkspace,
  quotesForCustomer,
  requestsForCustomer,
} from "./workspace.js";

function requestItem(
  customerId: string,
  overrides: Partial<RequestOverviewItem> = {},
): RequestOverviewItem {
  return {
    requestId: "crq:alpha",
    reference: "CER-AAAAAAAA",
    customerId,
    customerDisplayName: "Client Alpha",
    title: "Litere exterior",
    createdAt: "2026-08-17T10:00:00.000Z",
    status: "NEW",
    statusLabel: "Nouă",
    commercialProgress: null,
    commercialProgressLabel: null,
    nextAction: "OPEN_REQUEST",
    nextActionLabel: "Deschide cererea",
    href: "/requests/crq:alpha",
    nextActionHref: "/requests/crq:alpha",
    needsAttention: true,
    attentionLabel: "Cerere nouă",
    linkedQuoteCount: 0,
    ...overrides,
  };
}

function quoteItem(
  customerId: string,
  overrides: Partial<QuoteOverviewItem> = {},
): QuoteOverviewItem {
  return {
    quoteSnapshotId: "qts:alpha",
    reference: "OF-ABCDEF01",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription: "ALPHA",
    customerId,
    customerDisplayName: "Client Alpha",
    createdAt: "2026-08-17T11:00:00.000Z",
    grossDisplay: "624,82",
    currency: "EUR",
    stage: "QUOTE_CREATED",
    stageLabel: "Creată",
    nextAction: "ACCEPT_QUOTE",
    nextActionLabel: "Marchează acceptată",
    href: "/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06?quote=qts%3Aalpha",
    needsAttention: true,
    attentionLabel: "Urmează acceptarea",
    acceptanceId: null,
    orderSnapshotId: null,
    requestId: null,
    requestReference: null,
    ...overrides,
  };
}

function jobItem(
  customerId: string,
  overrides: Partial<JobOverviewItem> = {},
): JobOverviewItem {
  return {
    jobId: "ord:alpha",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription: "ALPHA",
    customerId,
    customerDisplayName: "Client Alpha",
    createdAt: "2026-08-17T12:00:00.000Z",
    stage: "ORDER_CREATED",
    stageLabel: "Comandă creată",
    nextAction: "RELEASE_TO_PRODUCTION",
    nextActionLabel: "Eliberează pentru producție",
    href: "/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06?order=ord%3Aalpha",
    needsAttention: true,
    attentionLabel: "Urmează eliberarea",
    completedCount: null,
    taskCount: null,
    inProgressCount: null,
    progressLabel: null,
    orderSnapshotId: "ord:alpha",
    releaseSnapshotId: null,
    planId: null,
    ...overrides,
  };
}

describe("customer workspace projection", () => {
  it("groups requests, quotes and jobs by stable customerId", () => {
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const other = requestItem("cus:beta", { requestId: "crq:beta", reference: "CER-BBBBBBBB" });
    const workspace = projectCustomerWorkspace({
      customer: created.customer,
      requests: requestsForCustomer(
        [requestItem("cus:alpha"), other],
        created.customer.customerId,
      ),
      quotes: quotesForCustomer(
        [quoteItem("cus:alpha"), quoteItem("cus:beta", { quoteSnapshotId: "qts:beta" })],
        created.customer.customerId,
      ),
      jobs: jobsForCustomer(
        [jobItem("cus:alpha"), jobItem("cus:beta", { jobId: "ord:beta" })],
        created.customer.customerId,
      ),
    });
    expect(workspace.requests).toHaveLength(1);
    expect(workspace.quotes).toHaveLength(1);
    expect(workspace.jobs).toHaveLength(1);
    expect(workspace.requests[0]?.customerId).toBe("cus:alpha");
    expect(workspace.quotes[0]?.customerId).toBe("cus:alpha");
    expect(workspace.jobs[0]?.customerId).toBe("cus:alpha");
    expect(workspace.customer).not.toHaveProperty("statusCopiedFromRequest");
  });

  it("keeps history after a current-name rename", () => {
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const renamed = renameCustomer(created.customer, "Client Alpha SRL");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    const workspace = projectCustomerWorkspace({
      customer: renamed.customer,
      requests: [requestItem(created.customer.customerId)],
      quotes: [
        quoteItem(created.customer.customerId, {
          customerDisplayName: "Client Alpha",
        }),
      ],
      jobs: [jobItem(created.customer.customerId)],
    });
    expect(workspace.customer.displayName).toBe("Client Alpha SRL");
    expect(customerHref(workspace.customer.customerId)).toBe("/clients/cus%3Aalpha");
    expect(workspace.quotes[0]?.customerDisplayName).toBe("Client Alpha");
    expect(workspace.requests[0]?.customerId).toBe(created.customer.customerId);
  });

  it("does not copy Request, Quote or Order status onto the customer", () => {
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const workspace = projectCustomerWorkspace({
      customer: created.customer,
      requests: [requestItem("cus:alpha", { status: "READY_FOR_QUOTE" })],
      quotes: [quoteItem("cus:alpha", { stage: "QUOTE_ACCEPTED" })],
      jobs: [jobItem("cus:alpha", { stage: "EXECUTION_IN_PROGRESS" })],
    });
    expect(workspace.customer.status).toBe("ACTIVE");
    expect(workspace.customer).not.toHaveProperty("requestStatus");
    expect(workspace.customer).not.toHaveProperty("quoteStage");
    expect(workspace.customer).not.toHaveProperty("jobStage");
    expect(workspace.requests[0]?.status).toBe("READY_FOR_QUOTE");
    expect(workspace.quotes[0]?.stage).toBe("QUOTE_ACCEPTED");
    expect(workspace.jobs[0]?.stage).toBe("EXECUTION_IN_PROGRESS");
  });

  it("counts open requests separately from requests that need action", () => {
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const linkedOpen = requestItem("cus:alpha", {
      requestId: "crq:linked",
      reference: "CER-LINKED01",
      status: "READY_FOR_QUOTE",
      needsAttention: false,
      linkedQuoteCount: 1,
    });
    const workspace = projectCustomerWorkspace({
      customer: created.customer,
      requests: [linkedOpen],
      quotes: [quoteItem("cus:alpha", { needsAttention: false })],
      jobs: [],
    });
    expect(workspace.summary.openRequestCount).toBe(1);
    expect(workspace.summary.requestNeedsAction).toBe(0);
    expect(
      workspace.nextActions.some((action) => action.label.includes("necesită acțiune")),
    ).toBe(false);

    const registryItem = projectCustomerRegistryItem({
      customer: created.customer,
      requests: [linkedOpen],
      quotes: [quoteItem("cus:alpha", { needsAttention: false })],
      jobs: [],
    });
    expect(registryItem.openRequestCount).toBe(1);
    expect(registryItem.needsAttention).toBe(false);
    expect(registryItem.attentionLabel).toBeNull();
  });

  it("keeps a retired customer readable and blocks new requests", () => {
    const created = createCustomer("Client Retras", { customerId: "cus:retired" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const retired = retireCustomer(created.customer, "2026-08-17T12:00:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    const workspace = projectCustomerWorkspace({
      customer: retired.customer,
      requests: [requestItem("cus:retired")],
      quotes: [quoteItem("cus:retired")],
      jobs: [jobItem("cus:retired")],
    });
    expect(workspace.canCreateRequest).toBe(false);
    expect(workspace.requests).toHaveLength(1);
    expect(workspace.quotes).toHaveLength(1);
    expect(workspace.jobs).toHaveLength(1);
  });

  it("filters the registry by status and searchable current profile", () => {
    const alpha = createCustomer("Client Alpha", {
      customerId: "cus:alpha",
      profile: { cui: "RO111", contactName: "Ana" },
    });
    const beta = createCustomer("Client Beta", { customerId: "cus:beta" });
    expect(alpha.ok && beta.ok).toBe(true);
    if (!alpha.ok || !beta.ok) {
      return;
    }
    const retired = retireCustomer(beta.customer, "2026-08-17T12:00:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    const registry = projectCustomerRegistry([
      projectCustomerRegistryItem({
        customer: alpha.customer,
        requests: [requestItem("cus:alpha")],
        quotes: [],
        jobs: [],
      }),
      projectCustomerRegistryItem({
        customer: retired.customer,
        requests: [],
        quotes: [],
        jobs: [],
      }),
    ]);
    expect(filterCustomerRegistry(registry, "ACTIVE")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "RETIRED")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "ALL", "RO111")[0]?.customerId).toBe("cus:alpha");
    expect(filterCustomerRegistry(registry, "ALL", "Ana")[0]?.customerId).toBe("cus:alpha");
  });

  it("searches secondary profile fields and folds Romanian diacritics", () => {
    const created = createCustomer("Cîmpean SRL", {
      customerId: "cus:cimpean",
      profile: {
        email: "office@cimpean.ro",
        phone: "0722000111",
        city: "Cluj",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const registry = projectCustomerRegistry([
      projectCustomerRegistryItem({
        customer: created.customer,
        requests: [],
        quotes: [],
        jobs: [],
      }),
    ]);
    expect(filterCustomerRegistry(registry, "ALL", "cimpean")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "ALL", "office@cimpean")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "ALL", "0722")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "ALL", "Cluj")).toHaveLength(1);
    expect(filterCustomerRegistry(registry, "ALL", "missing")).toHaveLength(0);
  });
});
