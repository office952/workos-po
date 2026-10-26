import {
  CUSTOMER_DOCUMENT_KINDS,
  CUSTOMER_HISTORY_STATES,
  CUSTOMER_PHOTO_STAGES,
  createCustomerDocumentLinkLabeler,
  customerDocumentKindLabel,
  customerHistoryStateLabel,
  customerPhotoStageLabel,
  MAX_CUSTOMER_DOCUMENT_BYTES,
  projectCustomerDocument,
  projectCustomerHistory,
  projectCustomerWorks,
  readCustomerHistoryQuery,
  readCustomerWorksQuery,
  type CustomerHistoryInput,
} from "@workos-final/domain";
import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import { dossierPermissions, dossierPlane, requireDossierPermission, type DossierPlane } from "./access.js";
import { customerDocumentContentHref, listCustomerDocumentLinks, listCustomerDocuments } from "./documents.js";
import { listHistoricalWorks } from "./historicalWorks.js";
import { listCustomerSites, listSiteAssignments, presentCustomerSite, siteUsage } from "./sites.js";

/**
 * Everything the history needs for one customer, as metadata: existing requests, quotes and
 * jobs (the customer workspace), sites, historical works, documents and their links.
 * File bytes are never read here.
 */
export function readCustomerHistoryInput(plane: DossierPlane, customerId: string): CustomerHistoryInput | null {
  const workspace = plane.runtime.readCustomerWorkspace(customerId);
  if (!workspace) return null;
  return {
    requests: workspace.requests,
    quotes: workspace.quotes,
    jobs: workspace.jobs,
    historicalWorks: listHistoricalWorks(plane.db, customerId),
    documents: listCustomerDocuments(plane.db, customerId),
    documentLinks: listCustomerDocumentLinks(plane.db, customerId),
    sites: listCustomerSites(plane.db, customerId),
    siteAssignments: listSiteAssignments(plane.db, customerId),
    documentContentHref: (documentId, disposition) => customerDocumentContentHref(customerId, documentId, disposition),
  };
}

export function registerCustomerHistoryRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/customers/:customerId/history", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const input = readCustomerHistoryInput(plane, c.req.param("customerId"));
    if (!input) return c.json({ error: "not_found" }, 404);
    return c.json({ history: projectCustomerHistory(input, readCustomerHistoryQuery(c.req.query())) });
  });

  /** N-020 · the client's works: every WorkOS job and every historical record, each once. */
  app.get("/api/customers/:customerId/works", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const input = readCustomerHistoryInput(plane, c.req.param("customerId"));
    if (!input) return c.json({ error: "not_found" }, 404);
    return c.json({ works: projectCustomerWorks(input, readCustomerWorksQuery(c.req.query())) });
  });

  /** The working set of the dossier tabs: sites, documents, historical works and link targets. */
  app.get("/api/customers/:customerId/dossier", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const input = readCustomerHistoryInput(plane, customerId);
    if (!input) return c.json({ error: "not_found" }, 404);
    const label = createCustomerDocumentLinkLabeler(input);
    return c.json({
      dossier: {
        customerId,
        permissions: dossierPermissions(c),
        vocabulary: {
          documentKinds: CUSTOMER_DOCUMENT_KINDS.map((value) => ({ value, label: customerDocumentKindLabel(value) })),
          photoStages: CUSTOMER_PHOTO_STAGES.map((value) => ({ value, label: customerPhotoStageLabel(value) })),
          historyStates: CUSTOMER_HISTORY_STATES.map((value) => ({ value, label: customerHistoryStateLabel(value) })),
          maxFileBytes: MAX_CUSTOMER_DOCUMENT_BYTES,
        },
        sites: input.sites.map((site) => presentCustomerSite(site, siteUsage(plane.db, site.siteId))),
        siteAssignments: input.siteAssignments,
        documents: input.documents.map((document) =>
          projectCustomerDocument(document, input.documentLinks.get(document.documentId) ?? [], label, input.documentContentHref),
        ),
        historicalWorks: input.historicalWorks,
        linkTargets: {
          requests: input.requests.map((request) => ({ subjectId: request.requestId, label: `${request.reference} · ${request.title}` })),
          jobs: input.jobs.map((job) => ({
            subjectId: job.jobId,
            label: `${job.productLabel}${job.inscription ? ` · ${job.inscription}` : ""}`,
          })),
          historicalWorks: input.historicalWorks.map((work) => ({ subjectId: work.workId, label: `${work.title} (${work.eventDate.slice(0, 4)})` })),
          sites: input.sites.filter((site) => site.status === "ACTIVE").map((site) => ({ subjectId: site.siteId, label: site.name })),
        },
      },
    });
  });
}
