import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ASSEMBLY_LEGACY_IDENTITY_NOTICE,
  CANONICAL_PRODUCT_CODE,
  assemblyQuoteContentHashMatches,
  freezeAssemblyQuote,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";
import {
  readAssemblyQuote,
  readAssemblyTruth,
  readConfirmedChild,
  saveAssemblyQuote,
} from "../src/assembly/store.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

type App = ReturnType<typeof createApp>;
type Runtime = ReturnType<typeof createProductSystemRuntime>;

const lettersValues = {
  "root.inscription": "NORD",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

const temps: string[] = [];
const runtimes: Runtime[] = [];

afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.close();
  }
  cleanupCloudTemps();
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle on a closed SQLite file.
    }
  }
});

function sqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-assembly-identity-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

function openRuntime(path: string): Runtime {
  const runtime = createProductSystemRuntime(path, { documentsRoot: join(path, "..", "documents") });
  runtimes.push(runtime);
  return runtime;
}

function send(app: App, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function issueAssemblyQuote(app: App, customerName: string, headers: Record<string, string> = {}) {
  const customer = await json(await send(app, "POST", "/api/customers", { displayName: customerName }, headers));
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await send(app, "POST", "/api/requests", { customerId, title: customerName, description: "Ansamblu" }, headers),
  );
  const requestId = (request.request as { requestId: string }).requestId;
  const created = await send(app, "POST", "/api/assemblies", { requestId }, headers);
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  const review = async (productCode: string, values: Record<string, unknown>) =>
    (await json(await send(app, "POST", `/api/products/${productCode}/preview`, { values }, headers))).reviewId;
  for (const [role, productCode, values] of [
    ["SUPPORT_PANEL", ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues],
    ["SIGNAGE_LETTERS", CANONICAL_PRODUCT_CODE, lettersValues],
  ] as const) {
    const attached = await send(
      app,
      "POST",
      `/api/assemblies/${assemblyId}/members`,
      { manualProductNetPrice: 400, role, values, reviewId: await review(productCode, values) },
      headers,
    );
    expect(attached.status).toBe(200);
  }
  expect((await send(app, "POST", `/api/assemblies/${assemblyId}/confirm`, undefined, headers)).status).toBe(200);
  expect(
    (
      await freezeAcknowledgingRates((body) =>
        send(app, "POST", `/api/assemblies/${assemblyId}/quote`, body, headers),
      )
    ).status,
  ).toBe(200);
  const overview = (await json(await app.request("/api/quotes", { headers }))).overview as {
    quotes: { quoteSnapshotId: string; kind: string; reference: string; grossPrice: number }[];
  };
  const quote = overview.quotes.find((item) => item.kind === "ASSEMBLY");
  if (!quote) {
    throw new Error("expected an assembly quote");
  }
  return { customerId, quoteSnapshotId: quote.quoteSnapshotId, reference: quote.reference };
}

async function documentText(app: App, quoteSnapshotId: string, headers: Record<string, string> = {}) {
  const response = await app.request(
    `/api/assembly-quotes/${encodeURIComponent(quoteSnapshotId)}/document`,
    { headers },
  );
  expect(response.status).toBe(200);
  return pdfText(new Uint8Array(await response.arrayBuffer()));
}

/** Reads the drawn text back out of the PDF through its ToUnicode map. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const streams: string[] = [];
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      const compressed = object.dict.get(PDFName.of("Filter")) !== undefined;
      streams.push(Buffer.from(compressed ? inflateSync(object.contents) : object.contents).toString("latin1"));
    }
  }
  const glyphs = new Map<number, string>();
  const unicode = (hex: string) =>
    String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((unit) => Number.parseInt(unit, 16)));
  for (const stream of streams) {
    for (const block of stream.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
      for (const [, code, target] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        glyphs.set(Number.parseInt(code!, 16), unicode(target!));
      }
    }
    for (const block of stream.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
      for (const [, low, , list] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g)) {
        (list!.match(/<([0-9A-Fa-f]+)>/g) ?? []).forEach((target, offset) => {
          glyphs.set(Number.parseInt(low!, 16) + offset, unicode(target.slice(1, -1)));
        });
      }
      for (const [, low, high, target] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const start = Number.parseInt(low!, 16);
        const first = Number.parseInt(target!, 16);
        for (let code = start; code <= Number.parseInt(high!, 16); code += 1) {
          glyphs.set(code, String.fromCharCode(first + code - start));
        }
      }
    }
  }
  const lines: string[] = [];
  for (const stream of streams) {
    for (const [, hex] of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      lines.push(
        (hex!.match(/.{4}/g) ?? []).map((code) => glyphs.get(Number.parseInt(code, 16)) ?? "?").join(""),
      );
    }
  }
  return lines.join("\n");
}

describe("assembly quote frozen commercial identity", () => {
  it("prints the identities frozen at issue time after the customer and seller change, also after reload", async () => {
    const path = sqlitePath();
    const app = createApp({ productSystem: openRuntime(path) });
    expect(
      (await send(app, "PATCH", "/api/seller", { legalName: "Emitent Inițial SRL", fiscalId: "RO11111111" })).status,
    ).toBe(200);
    const issued = await issueAssemblyQuote(app, "Client Inițial SRL");
    const before = await documentText(app, issued.quoteSnapshotId);
    expect(before).toContain("Emitent Inițial SRL");
    expect(before).toContain("CIF RO11111111");
    expect(before).toContain("Client Inițial SRL");
    expect(before).toContain(`Referință: ${issued.reference}`);
    expect(before).not.toContain(ASSEMBLY_LEGACY_IDENTITY_NOTICE.slice(0, 40));

    expect(
      (await send(app, "PATCH", `/api/customers/${issued.customerId}`, { displayName: "Client Redenumit SRL" })).status,
    ).toBe(200);
    expect(
      (await send(app, "PATCH", "/api/seller", { legalName: "Emitent Nou SRL", fiscalId: "RO22222222" })).status,
    ).toBe(200);
    const after = await documentText(app, issued.quoteSnapshotId);
    expect(after).toBe(before);
    expect(after).not.toMatch(/Client Redenumit|Emitent Nou|RO22222222/);

    const reloaded = createApp({ productSystem: openRuntime(path) });
    expect(await documentText(reloaded, issued.quoteSnapshotId)).toBe(before);

    const stored = readAssemblyQuote(openRuntime(path).assemblyPlane().db, "single-plane", issued.quoteSnapshotId);
    expect(stored?.customer).toEqual({ customerId: issued.customerId, displayName: "Client Inițial SRL" });
    expect(stored?.seller).toMatchObject({ legalName: "Emitent Inițial SRL", fiscalId: "RO11111111" });
    expect(stored && assemblyQuoteContentHashMatches(stored)).toBe(true);
  });

  it("keeps a legacy quote readable with its original hash and labels current identities", async () => {
    const path = sqlitePath();
    const runtime = openRuntime(path);
    const app = createApp({ productSystem: runtime });
    const issued = await issueAssemblyQuote(app, "Client Istoric SRL");
    const plane = runtime.assemblyPlane();
    const current = readAssemblyQuote(plane.db, plane.organizationId, issued.quoteSnapshotId)!;
    const frozen = freezeAssemblyQuote({
      quoteSnapshotId: `${current.quoteSnapshotId}:legacy`,
      truth: readAssemblyTruth(plane.db, plane.organizationId, current.assemblyTruthId)!,
      children: current.members.map(
        (member) => readConfirmedChild(plane.db, plane.organizationId, member.confirmedTruthId)!,
      ),
      createdAt: "2026-09-01T08:00:00.000Z",
    });
    if (!frozen.ok) {
      throw new Error(frozen.error);
    }
    const legacy = frozen.quote;
    expect(legacy.totals).toEqual(current.totals);
    saveAssemblyQuote(plane.db, legacy);
    const reread = readAssemblyQuote(plane.db, plane.organizationId, legacy.quoteSnapshotId)!;
    expect(reread.contentHash).toBe(legacy.contentHash);
    expect(reread).not.toHaveProperty("seller");
    expect(assemblyQuoteContentHashMatches(reread)).toBe(true);

    expect((await send(app, "PATCH", "/api/seller", { legalName: "Emitent Curent SRL" })).status).toBe(200);
    const text = await documentText(app, legacy.quoteSnapshotId);
    expect(text).toContain("Emitent Curent SRL");
    expect(text).toContain("Client Istoric SRL");
    expect(text.replace(/\s+/g, " ")).toContain(ASSEMBLY_LEGACY_IDENTITY_NOTICE);
    expect(text).toContain(`Total: ${current.totals.grossPrice.toFixed(2).replace(".", ",")} EUR`);
    expect(readAssemblyQuote(plane.db, plane.organizationId, legacy.quoteSnapshotId)).toEqual(reread);
  });

  it("refuses to print a quote whose frozen identity was altered", async () => {
    const path = sqlitePath();
    const runtime = openRuntime(path);
    const app = createApp({ productSystem: runtime });
    const issued = await issueAssemblyQuote(app, "Client Integru SRL");
    const plane = runtime.assemblyPlane();
    const stored = readAssemblyQuote(plane.db, plane.organizationId, issued.quoteSnapshotId)!;
    plane.db
      .prepare("UPDATE assembly_quote_snapshots SET payload = ? WHERE quote_snapshot_id = ?")
      .run(
        JSON.stringify({ ...stored, seller: { ...stored.seller, legalName: "Emitent Falsificat SRL" } }),
        issued.quoteSnapshotId,
      );
    const response = await app.request(
      `/api/assembly-quotes/${encodeURIComponent(issued.quoteSnapshotId)}/document`,
    );
    expect(response.status).toBe(422);
    expect(await json(response)).toMatchObject({ error: "assembly_document_integrity" });
  });

  it("prints each organization's own seller and denies another organization's quote", async () => {
    const fixture = createCloudFixture();
    try {
      await crossOrganizationScenario(fixture);
    } finally {
      fixture.close();
    }
  });
});

async function crossOrganizationScenario(fixture: ReturnType<typeof createCloudFixture>) {
  const orgA = await addOrganization(fixture, "Org A");
  const orgB = await addOrganization(fixture, "Org B");
  for (const [email, org] of [
    ["a@identity.test", orgA],
    ["b@identity.test", orgB],
  ] as const) {
    await addUser(fixture, {
      email,
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
  }
  const headersFor = async (email: string, organizationId: string) => ({
    cookie: (await loginCloud(fixture.app, email, OWNER_PASSWORD, organizationId)).cookie ?? "",
  });
  const headersA = await headersFor("a@identity.test", orgA.organization.organizationId);
  const headersB = await headersFor("b@identity.test", orgB.organization.organizationId);
  await send(fixture.app, "PATCH", "/api/seller", { legalName: "Emitent A SRL" }, headersA);
  await send(fixture.app, "PATCH", "/api/seller", { legalName: "Emitent B SRL" }, headersB);

  const quoteA = await issueAssemblyQuote(fixture.app, "Client A SRL", headersA);
  const textA = await documentText(fixture.app, quoteA.quoteSnapshotId, headersA);
  expect(textA).toContain("Emitent A SRL");
  expect(textA).not.toContain("Emitent B SRL");

  const crossOrg = await fixture.app.request(
    `/api/assembly-quotes/${encodeURIComponent(quoteA.quoteSnapshotId)}/document`,
    { headers: headersB },
  );
  expect(crossOrg.status).toBe(404);
  const anonymous = await fixture.app.request(
    `/api/assembly-quotes/${encodeURIComponent(quoteA.quoteSnapshotId)}/document`,
  );
  expect(anonymous.status).toBe(401);
}
