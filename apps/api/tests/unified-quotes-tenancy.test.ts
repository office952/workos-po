import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { collectFinancialKeys, type AssemblyQuoteSnapshot } from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { cleanupCloudTemps } from "./cloud-harness.js";
import { provisionHostileIsolationWorld } from "./cloud-isolation-fixture.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

type Json = Record<string, unknown>;

function syntheticAssemblyQuote(input: {
  quoteSnapshotId: string;
  organizationId: string;
  requestId: string | null;
}): AssemblyQuoteSnapshot {
  const commercial = {
    policyId: "policy",
    policyVersion: 1,
    markupPercent: 35,
    markupAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    netPrice: 100,
    vatPercent: 21,
    vatAmount: 21,
    grossPrice: 121,
    currency: "EUR" as const,
    completeness: "COMPLETE" as const,
  };
  const member = (role: "SUPPORT_PANEL" | "SIGNAGE_LETTERS") => ({
    memberId: `mem:${role}`,
    role,
    roleLabel: role === "SUPPORT_PANEL" ? "Panou ACM" : "Litere",
    productCode: role,
    productLabel: role,
    inscription: role,
    childQuoteSnapshotId: `qts:${input.quoteSnapshotId}:${role}`,
    childQuoteContentHash: `hash:${role}`,
    confirmedTruthId: `pct:${input.quoteSnapshotId}:${role}`,
    confirmedTruthHash: `truth:${role}`,
    commercial,
  });
  return {
    quoteSnapshotId: input.quoteSnapshotId,
    schemaVersion: 1,
    status: "FROZEN",
    organizationId: input.organizationId,
    requestId: input.requestId,
    assemblyKind: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
    assemblyContractVersion: "product-assembly-v1",
    assemblyId: `asm:${input.quoteSnapshotId}`,
    assemblyTruthId: `truth:${input.quoteSnapshotId}`,
    assemblyTruthHash: `truth-hash:${input.quoteSnapshotId}`,
    label: "Panou ACM + litere volumetrice",
    createdAt: new Date().toISOString(),
    contentHash: `content:${input.quoteSnapshotId}`,
    members: [member("SUPPORT_PANEL"), member("SIGNAGE_LETTERS")],
    relationCommercialPrice: null,
    totals: { netPrice: 200, vatAmount: 42, grossPrice: 242, currency: "EUR", completeness: "COMPLETE" },
  };
}

function insertAssemblyQuote(planeRoot: string, quote: AssemblyQuoteSnapshot): void {
  const db = new Database(join(planeRoot, "product-system.sqlite"));
  db.prepare(
    `INSERT INTO assembly_quote_snapshots (
      quote_snapshot_id, organization_id, assembly_id, content_hash, payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    quote.quoteSnapshotId,
    quote.organizationId,
    quote.assemblyId,
    quote.contentHash,
    JSON.stringify(quote),
    quote.createdAt,
  );
  db.close();
}

async function read(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  path: string,
  cookie: string,
): Promise<{ status: number; body: Json }> {
  const response = await app.request(path, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as Json };
}

function quoteIds(body: Json): string[] {
  return ((body.overview as { quotes: { quoteSnapshotId: string }[] }).quotes ?? []).map(
    (item) => item.quoteSnapshotId,
  );
}

describe("unified Oferte registry tenancy and roles", () => {
  it("never shows another organisation's assembly quotes and hides internal cost from members", async () => {
    const world = await provisionHostileIsolationWorld();
    const { fixture, alpha, testCompany, cookies } = world;
    fixture.registry.evict(alpha.organizationId);
    const alphaQuote = syntheticAssemblyQuote({
      quoteSnapshotId: "asmq:alpha-isolation",
      organizationId: alpha.organizationId,
      requestId: alpha.requestId,
    });
    insertAssemblyQuote(alpha.planeRoot, alphaQuote);
    insertAssemblyQuote(
      alpha.planeRoot,
      syntheticAssemblyQuote({
        quoteSnapshotId: "asmq:spoofed-org",
        organizationId: testCompany.organizationId,
        requestId: null,
      }),
    );

    const ownerList = await read(fixture.app, "/api/quotes", cookies.userA);
    expect(ownerList.status).toBe(200);
    expect(quoteIds(ownerList.body)).toEqual(expect.arrayContaining([alpha.quoteId, alphaQuote.quoteSnapshotId]));
    expect(quoteIds(ownerList.body)).not.toContain("asmq:spoofed-org");
    expect(quoteIds(ownerList.body)).not.toContain(testCompany.quoteId);
    expect((await read(fixture.app, "/api/quotes/asmq%3Aspoofed-org", cookies.userA)).status).toBe(404);

    const foreignList = await read(fixture.app, "/api/quotes", cookies.userB);
    expect(quoteIds(foreignList.body)).not.toContain(alphaQuote.quoteSnapshotId);
    expect(quoteIds(foreignList.body)).not.toContain("asmq:spoofed-org");
    const foreignRead = await read(
      fixture.app,
      `/api/quotes/${encodeURIComponent(alphaQuote.quoteSnapshotId)}`,
      cookies.userB,
    );
    expect(foreignRead.status).toBe(404);
    expect(JSON.stringify(foreignRead.body)).not.toContain(alpha.customerName);
    const crossMemberRead = await read(
      fixture.app,
      `/api/quotes/${encodeURIComponent(alphaQuote.quoteSnapshotId)}`,
      cookies.memberB,
    );
    expect(crossMemberRead.status).toBe(404);

    const ownerDetail = await read(
      fixture.app,
      `/api/quotes/${encodeURIComponent(alphaQuote.quoteSnapshotId)}`,
      cookies.userA,
    );
    expect(ownerDetail.status).toBe(200);
    expect(ownerDetail.body.quote).toMatchObject({
      kind: "ASSEMBLY",
      customerDisplayName: alpha.customerName,
      requestId: alpha.requestId,
      sectionCount: 2,
    });
    expect("internalCost" in ownerDetail.body).toBe(true);

    const memberList = await read(fixture.app, "/api/quotes", cookies.memberA);
    expect(quoteIds(memberList.body)).toContain(alphaQuote.quoteSnapshotId);
    const memberDetail = await read(
      fixture.app,
      `/api/quotes/${encodeURIComponent(alphaQuote.quoteSnapshotId)}`,
      cookies.memberA,
    );
    expect(memberDetail.status).toBe(200);
    expect("internalCost" in memberDetail.body).toBe(false);
    const memberKeys = collectFinancialKeys(memberDetail.body);
    expect(memberKeys.has("grossPrice")).toBe(true);
    for (const key of ["internalCost", "eicTotal", "eic", "cost", "markupPercent", "marginAmount"]) {
      expect(memberKeys.has(key)).toBe(false);
    }
    expect(collectFinancialKeys(memberList.body).has("markupPercent")).toBe(false);
  });
});
