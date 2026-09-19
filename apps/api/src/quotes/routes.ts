import type { Hono } from "hono";
import { scopeQuoteSnapshot } from "@workos-final/domain";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { financialAccess } from "../financial/access.js";
import { httpPathIdentity } from "../httpPathIdentity.js";

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
      return c.json({ error: "not_found" }, 404);
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
}
