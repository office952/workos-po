import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LAB_SITE_INSTALL_ID,
  SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED,
  SERVICE_QUOTE_NOT_ACCEPTABLE_REASON,
  compileAggregate,
  compileDefinition,
  compileEic,
  composeProductProcessesFromTruth,
  confirmReviewedDefinition,
  freezeOrderSnapshot,
  freezeQuoteSnapshot,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
  projectCommercialPrice,
  projectManualFixedServicePrice,
  collectFinancialKeys,
  seededDisplayLabelCatalog,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

type JsonObject = Record<string, unknown>;

const temps: string[] = [];
const runtimes: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.close();
  }
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may still hold a closed sqlite handle briefly.
    }
  }
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function createRuntimeApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-os-s7-"));
  temps.push(dir);
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
  runtimes.push(runtime);
  const app = createApp({ productSystem: runtime });
  return { app, runtime };
}

function frozenInstallQuote() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: readyValues,
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  const eic = compileEic(aggregate, composition);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    {
      createdAt: "2026-09-04T00:00:00.000Z",
      installation: {
        label: "Montaj la locație",
        providerMode: "INTERNAL",
        requestId: "req:os-s7-api",
        technicalConfiguration: {
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 3,
          plannedDurationHours: 4,
        },
        evidence: {
          resourceId: LAB_SITE_INSTALL_ID,
          amount: 25,
          currency: "EUR",
          perUnit: "person_hour",
          source: "OWNER_CONFIRMED_WORKSHOP",
          classification: "OWNER_CONFIRMED",
          note: "Tarif intern sintetic.",
        },
        eic: {
          completeness: "COMPLETE",
          completenessReasons: [],
          geometryLabel: null,
          currency: "EUR",
          lines: [
            {
              resourceId: LAB_SITE_INSTALL_ID,
              label: "Manoperă montaj la locație",
              quantity: 12,
              unit: "person_hour",
              rate: 25,
              currency: "EUR",
              cost: 300,
              kind: "LABOR",
              group: "labor",
            },
          ],
          total: 300,
          excludedComponentLabels: [],
        },
        commercial: projectManualFixedServicePrice({ netPrice: 200 }),
      },
    },
  );
  if (!frozen.ok) {
    throw new Error("expected v2 quote");
  }
  return frozen.snapshot;
}

describe("OS-S7 order service truth", () => {
  it("creates Order v2 from a persisted Quote v2 plus synthetic acceptance and keeps live gates closed", async () => {
    const { app, runtime } = createRuntimeApp();
    const quote = frozenInstallQuote();
    const acceptance = {
      acceptanceId: `qad:${quote.quoteSnapshotId}`,
      schemaVersion: 1 as const,
      quoteSnapshotId: quote.quoteSnapshotId,
      quoteContentHash: quote.contentHash,
      acceptedAt: "2026-09-04T01:00:00.000Z",
    };
    runtime.persistQuoteSnapshot(quote);
    runtime.persistQuoteAcceptance(acceptance);

    const liveAcceptance = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quote.quoteSnapshotId)}/acceptance`,
      { method: "POST" },
    );
    expect(liveAcceptance.status).toBe(422);
    expect((await readBody(liveAcceptance)).error).toBe("service_quote_not_acceptable");

    const livePdf = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quote.quoteSnapshotId)}/document`,
    );
    expect(livePdf.status).toBe(422);
    expect((await readBody(livePdf)).error).toBe(SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED);

    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quote.quoteSnapshotId)}/order`,
      { method: "POST" },
    );
    expect(created.status).toBe(200);
    const body = await readBody(created);
    const order = body.orderSnapshot as JsonObject;
    expect(order.schemaVersion).toBe(2);
    expect(order.jobCommercial).toMatchObject({
      grossPrice: quote.jobCommercial?.grossPrice,
    });
    expect((order.lines as unknown[]).length).toBe(2);
    expect(order.commercial).toMatchObject({ grossPrice: 624.82 });
    expect(order.eic).toMatchObject({ total: 382.5 });
    expect(collectFinancialKeys(order).has("eic")).toBe(true);

    const read = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(String(order.orderSnapshotId))}`,
    );
    expect(read.status).toBe(200);
    const readOrder = ((await readBody(read)).orderSnapshot as JsonObject);
    expect(readOrder.schemaVersion).toBe(2);
    expect(readOrder.contentHash).toBe(order.contentHash);

    const release = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${encodeURIComponent(String(order.orderSnapshotId))}/production-release`,
      { method: "POST" },
    );
    expect(release.status).toBe(422);
    expect((await readBody(release)).error).toBe("incompatible_order_source");
  });

  it("keeps the public v2 acceptance reason unchanged", () => {
    expect(SERVICE_QUOTE_NOT_ACCEPTABLE_REASON).toBe(
      "Oferta cu montaj nu poate fi acceptată în această etapă.",
    );
  });

  it("does not compile current truth on the order create path", () => {
    const source = readFileSync(new URL("../src/product.ts", import.meta.url), "utf8");
    const start = source.indexOf(
      '"/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order"',
    );
    const end = source.indexOf('"/api/products/:productCode/orders/:orderSnapshotId"');
    const createPath = source.slice(start, end);
    expect(createPath).toContain("freezeOrderSnapshot");
    expect(createPath).not.toMatch(/compileAcceptedProduct|compileDefinition|compileAggregate/);
    expect(createPath).not.toMatch(/compileEic|projectCommercialPrice|listActiveCostEvidence/);
  });

  it("domain Order v2 copy stays snapshot-only", () => {
    const quote = frozenInstallQuote();
    const frozen = freezeOrderSnapshot(quote, {
      acceptanceId: `qad:${quote.quoteSnapshotId}`,
      schemaVersion: 1,
      quoteSnapshotId: quote.quoteSnapshotId,
      quoteContentHash: quote.contentHash,
      acceptedAt: "2026-09-04T01:00:00.000Z",
    });
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(frozen.snapshot.schemaVersion).toBe(2);
    expect(frozen.snapshot.eic.total).toBe(382.5);
    expect(frozen.snapshot.commercial.grossPrice).toBe(624.82);
  });
});
