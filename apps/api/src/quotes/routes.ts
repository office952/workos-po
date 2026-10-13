import type { Hono } from "hono";
import {
  freezeSellerIdentity,
  presentAssemblyQuoteDetail,
  presentAssemblyQuoteInternalCost,
  projectAssemblyQuoteDocument,
  scopeQuoteSnapshot,
} from "@workos-final/domain";
import { getProductSystem, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { financialAccess } from "../financial/access.js";
import { httpPathIdentity } from "../httpPathIdentity.js";
import { renderQuoteDocumentPdf } from "../quoteDocument/renderQuoteDocumentPdf.js";

export function registerQuoteRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/quotes", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ overview: runtime.listQuoteOverview() });
  });

  app.get("/api/quotes/:quoteSnapshotId", (c) => {
    const runtime = getProductSystem(c);
    const quoteSnapshotId = httpPathIdentity(c.req.path, "/api/quotes/");
    const snapshot = runtime.readQuoteSnapshot(quoteSnapshotId);
    if (!snapshot) {
      return assemblyQuoteEnvelope(c, quoteSnapshotId);
    }
    const item = runtime
      .listQuoteOverview()
      .quotes.find((quote) => quote.quoteSnapshotId === quoteSnapshotId);
    if (!item) {
      return c.json({ error: "not_found" }, 404);
    }
    const access = financialAccess(c, "commercial");
    const acceptance = runtime.readQuoteAcceptance(quoteSnapshotId);
    return c.json({
      quote: item,
      quoteSnapshot: scopeQuoteSnapshot(snapshot, access),
      acceptance: acceptance,
      order: item.orderSnapshotId
        ? {
            orderSnapshotId: item.orderSnapshotId,
            href: `/jobs/${encodeURIComponent(item.orderSnapshotId)}`,
          }
        : null,
      request: item.requestId
        ? {
            requestId: item.requestId,
            href: `/requests/${encodeURIComponent(item.requestId)}`,
            reference: item.requestReference,
          }
        : null,
    });
  });

  app.get("/api/assembly-quotes/:quoteSnapshotId/document", async (c) => {
    const runtime = getProductSystem(c);
    const quoteSnapshotId = httpPathIdentity(c.req.path, "/api/assembly-quotes/", "/document");
    const record = runtime.readAssemblyQuoteRecord(quoteSnapshotId);
    if (!record) {
      return c.json({ error: "not_found" }, 404);
    }
    const memberTruths = new Map(
      record.quote.members.flatMap((member) => {
        const child = record.confirmedChildren.find(
          (item) =>
            item.truthId === member.confirmedTruthId &&
            item.truthHash === member.confirmedTruthHash,
        );
        return child ? [[member.confirmedTruthId, child.truth] as const] : [];
      }),
    );
    if (memberTruths.size !== record.quote.members.length) {
      return c.json(
        {
          error: "assembly_document_unavailable",
          reasons: ["Configurația confirmată a unei secțiuni nu mai poate fi citită pentru document."],
        },
        422,
      );
    }
    const seller = runtime.getSellerProfile();
    const model = projectAssemblyQuoteDocument({
      quote: record.quote,
      memberTruths,
      customerDisplayName: record.item.customerDisplayName,
      seller: seller ? freezeSellerIdentity(seller) : null,
    });
    const bytes = await renderQuoteDocumentPdf(model);
    return c.body(Buffer.from(bytes), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${model.filename}"`,
    });
  });
}

/** Read-only: reading an assembly quote never mutates the assembly, its order or production. */
function assemblyQuoteEnvelope(c: ApiContext, quoteSnapshotId: string) {
  const runtime = getProductSystem(c);
  const record = runtime.readAssemblyQuoteRecord(quoteSnapshotId);
  if (!record) {
    return c.json({ error: "not_found" }, 404);
  }
  const internalCost =
    financialAccess(c, "commercial") === "owner"
      ? presentAssemblyQuoteInternalCost({
          quote: record.quote,
          order: record.order,
          production: record.production,
          confirmedChildren: record.confirmedChildren,
        })
      : undefined;
  return c.json({
    quote: record.item,
    assemblyQuote: presentAssemblyQuoteDetail({
      quote: record.quote,
      order: record.order,
      production: record.production,
      superseded: record.superseded,
    }),
    ...(internalCost === undefined ? {} : { internalCost }),
    order: record.order
      ? {
          orderSnapshotId: record.order.orderSnapshotId,
          href: `/jobs/${encodeURIComponent(record.order.orderSnapshotId)}`,
        }
      : null,
    request: record.item.requestId
      ? {
          requestId: record.item.requestId,
          href: `/requests/${encodeURIComponent(record.item.requestId)}`,
          reference: record.item.requestReference,
        }
      : null,
    assembly: {
      assemblyId: record.quote.assemblyId,
      href: `/assemblies/${encodeURIComponent(record.quote.assemblyId)}`,
    },
  });
}
