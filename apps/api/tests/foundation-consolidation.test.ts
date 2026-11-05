import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LOGO_PRODUCT_CODE,
  PRODUCT_NOT_ENABLED_FOR_NEW_WORK,
} from "@workos-final/domain";
import { ensureOwnerReviewProvisioned } from "../src/cloud/ownerReviewReset.js";
import { loginAppSeedClient } from "../src/cloud/ownerReviewHttp.js";
import {
  ACM,
  LETTERS,
  SYNTHETIC_MANUAL_NET_PRICE,
  ensureAssemblyScenarioA,
  ensureCustomer,
  ensureRequest,
  ensureSeller,
  lettersValues,
} from "../src/cloud/ownerReviewSeed.js";
import {
  EIGHT_COMMERCIAL_BRANCHES,
  seedEightCommercialBranches,
} from "../src/cloud/foundationConsolidationScenarios.js";
import {
  OWNER_REVIEW_DEFAULT_PASSWORD,
  OWNER_REVIEW_OWNER_EMAIL,
} from "../src/cloud/ownerReviewIdentity.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  openCloudFixture,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("synthetic foundation consolidation", () => {
  it("persists eight commercial branches and does not create them twice", async () => {
    const root = trackTempDir();
    const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root });
    const fixture = openCloudFixture(root);
    try {
      const client = await loginAppSeedClient({
        app: fixture.app,
        email: OWNER_REVIEW_OWNER_EMAIL,
        password: OWNER_REVIEW_DEFAULT_PASSWORD,
        organizationId: provisioned.organizationId,
      });
      const first = await seedEightCommercialBranches({ client });
      expect(first.version).toBe("SYNTHETIC_FOUNDATION_CONSOLIDATION_V1");
      expect(first.scenarioKey).toBe(EIGHT_COMMERCIAL_BRANCHES.scenarioKey);
      expect(first.created).toBe(8);
      expect(first.reused).toBe(0);
      expect(new Set(first.branches.map((branch) => branch.quoteSnapshotId)).size).toBe(8);
      const letters = first.branches.filter((branch) => branch.productCode === LETTERS);
      const panels = first.branches.filter((branch) => branch.productCode === ACM);
      expect(letters).toHaveLength(4);
      expect(panels).toHaveLength(4);
      expect(new Set(letters.map((branch) => branch.quoteSnapshotId)).size).toBe(4);
      expect(new Set(panels.map((branch) => branch.quoteSnapshotId)).size).toBe(4);
      for (const branch of letters) {
        expect(branch.quoteSnapshotId.startsWith(`qts:${LETTERS}:`)).toBe(true);
      }
      for (const branch of panels) {
        expect(branch.quoteSnapshotId.startsWith(`qts:${ACM}:`)).toBe(true);
      }

      const detail = await client.request(
        "GET",
        `/api/requests/${encodeURIComponent(first.requestId)}`,
      );
      const offers =
        ((detail.body?.detail as { linkedOffers?: Array<{ kind?: string; quoteSnapshotId?: string }> })
          ?.linkedOffers) ?? [];
      expect(offers.filter((offer) => offer.kind === "PRODUCT")).toHaveLength(8);
      expect(
        ((detail.body?.detail as { assemblies?: unknown[] } | undefined)?.assemblies ?? []),
      ).toHaveLength(0);

      const second = await seedEightCommercialBranches({ client });
      expect(second.created).toBe(0);
      expect(second.reused).toBe(8);
      expect(second.requestId).toBe(first.requestId);
      expect(second.branches.map((branch) => branch.quoteSnapshotId)).toEqual(
        first.branches.map((branch) => branch.quoteSnapshotId),
      );
      const listed = await client.request("GET", "/api/quotes");
      const quotes =
        ((listed.body?.overview as { quotes?: Array<{ requestId?: string }> })?.quotes) ?? [];
      expect(quotes.filter((quote) => quote.requestId === first.requestId)).toHaveLength(8);
    } finally {
      fixture.close();
    }
  }, 120_000);

  it("refuses a newer assembly quote after the accepted order and keeps the job on the original snapshot", async () => {
    const root = trackTempDir();
    const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root });
    const fixture = openCloudFixture(root);
    try {
      const client = await loginAppSeedClient({
        app: fixture.app,
        email: OWNER_REVIEW_OWNER_EMAIL,
        password: OWNER_REVIEW_DEFAULT_PASSWORD,
        organizationId: provisioned.organizationId,
      });
      await ensureSeller(client);
      const customer = await ensureCustomer(client, "Ansamblu Sintetic Demo SRL");
      const request = await ensureRequest(
        client,
        customer.customerId,
        "Ansamblu acceptat, fără ofertă nouă",
        "Cerere sintetică pentru limita de revizie după comandă. Date de demonstrație.",
      );
      const assembly = await ensureAssemblyScenarioA(client, customer.customerId, request.requestId);
      const viewed = await client.request(
        "GET",
        `/api/assemblies/${encodeURIComponent(assembly.assemblyId)}`,
      );
      const current = viewed.body?.assembly as
        | { quoteSnapshotId?: string | null; orderId?: string | null }
        | undefined;
      const acceptedQuoteId = current?.quoteSnapshotId ?? "";
      const orderId = current?.orderId ?? "";
      expect(acceptedQuoteId.startsWith("asmq:")).toBe(true);
      expect(orderId.length).toBeGreaterThan(0);

      const preview = await client.request("POST", `/api/products/${LETTERS}/preview`, {
        values: lettersValues("SFC-REV"),
        requestId: request.requestId,
      });
      const reviewId = (preview.body as { reviewId?: unknown } | null)?.reviewId;
      expect(typeof reviewId).toBe("string");
      const member = await client.request(
        "POST",
        `/api/assemblies/${encodeURIComponent(assembly.assemblyId)}/members`,
        {
          role: "SIGNAGE_LETTERS",
          values: lettersValues("SFC-REV"),
          reviewId,
          manualProductNetPrice: SYNTHETIC_MANUAL_NET_PRICE,
        },
      );
      expect(member.status).toBe(409);
      expect(member.body?.error).toBe("assembly_order_frozen");

      await client.request(
        "POST",
        `/api/assemblies/${encodeURIComponent(assembly.assemblyId)}/quote`,
        {},
      );
      const quotes = await client.request("GET", "/api/quotes");
      const assemblyQuotes = (
        ((quotes.body?.overview as { quotes?: Array<Record<string, unknown>> })?.quotes) ?? []
      ).filter((quote) => quote.assemblyId === assembly.assemblyId);
      expect(assemblyQuotes.map((quote) => quote.quoteSnapshotId)).toEqual([acceptedQuoteId]);
      expect(assemblyQuotes[0]?.orderSnapshotId).toBe(orderId);

      const jobs = await client.request("GET", "/api/jobs");
      const job = (
        ((jobs.body?.overview as { jobs?: Array<Record<string, unknown>> })?.jobs) ?? []
      ).find((item) => item.requestId === request.requestId && item.kind === "ASSEMBLY");
      expect(job?.orderSnapshotId).toBe(orderId);
      const reread = await client.request(
        "GET",
        `/api/assemblies/${encodeURIComponent(assembly.assemblyId)}`,
      );
      expect((reread.body?.assembly as { quoteSnapshotId?: string } | undefined)?.quoteSnapshotId).toBe(
        acceptedQuoteId,
      );
      expect((reread.body?.assembly as { orderId?: string } | undefined)?.orderId).toBe(orderId);
    } finally {
      fixture.close();
    }
  }, 120_000);

  it("separates an open manufacturing catalog from a catalog with ACM disabled", async () => {
    const fixture = createCloudFixture();
    try {
      const manufacturing = await addOrganization(fixture, "Atelier avansat sintetic", "SYNTHETIC_TEST");
      const commercial = await addOrganization(fixture, "Flux comercial restrâns sintetic", "SYNTHETIC_TEST");
      await addUser(fixture, {
        email: "atelier@foundation.test",
        password: OWNER_PASSWORD,
        organizationId: manufacturing.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "comercial@foundation.test",
        password: OWNER_PASSWORD,
        organizationId: commercial.organization.organizationId,
        role: "owner",
      });
      const atelier = await loginCloud(
        fixture.app,
        "atelier@foundation.test",
        OWNER_PASSWORD,
        manufacturing.organization.organizationId,
      );
      const desk = await loginCloud(
        fixture.app,
        "comercial@foundation.test",
        OWNER_PASSWORD,
        commercial.organization.organizationId,
      );
      expect(atelier.cookie).toBeTruthy();
      expect(desk.cookie).toBeTruthy();
      const atelierClient = await loginAppSeedClient({
        app: fixture.app,
        email: "atelier@foundation.test",
        password: OWNER_PASSWORD,
        organizationId: manufacturing.organization.organizationId,
      });
      const deskClient = await loginAppSeedClient({
        app: fixture.app,
        email: "comercial@foundation.test",
        password: OWNER_PASSWORD,
        organizationId: commercial.organization.organizationId,
      });

      const openCatalog = await atelierClient.request("GET", "/api/admin/product-enablement");
      const openProducts =
        (openCatalog.body?.products as Array<{ templateCode?: string; enabled?: boolean }>) ?? [];
      expect(openProducts.find((item) => item.templateCode === CANONICAL_PRODUCT_CODE)?.enabled).toBe(
        true,
      );
      expect(
        openProducts.find((item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE)?.enabled,
      ).toBe(true);

      const restricted = await deskClient.request("POST", "/api/admin/product-enablement", {
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
          { templateCode: LOGO_PRODUCT_CODE, enabled: false },
        ],
      });
      expect(restricted.ok).toBe(true);
      const refused = await deskClient.request("POST", `/api/products/${ACM}/preview`, {
        values: {
          "root.inscription": "SFC-A",
          "face.widthMm": 1000,
          "face.heightMm": 500,
          "face.cassetteDepthMm": 40,
        },
      });
      expect(refused.status).toBe(409);
      expect(refused.body?.error).toBe(PRODUCT_NOT_ENABLED_FOR_NEW_WORK);
      const stillOpen = await atelierClient.request("POST", `/api/products/${ACM}/preview`, {
        values: {
          "root.inscription": "SFC-A",
          "face.widthMm": 1000,
          "face.heightMm": 500,
          "face.cassetteDepthMm": 40,
        },
      });
      expect(stillOpen.ok).toBe(true);

      await ensureSeller(deskClient);
      const customer = await ensureCustomer(deskClient, "Client comercial restrâns");
      const request = await ensureRequest(
        deskClient,
        customer.customerId,
        "Ofertă de litere, fără panou",
        "Cerere sintetică pe un catalog fără panoul ACM. Date de demonstrație.",
      );
      const lettersPreview = await deskClient.request("POST", `/api/products/${LETTERS}/preview`, {
        values: lettersValues("SFC-DESK"),
        requestId: request.requestId,
      });
      expect(lettersPreview.ok).toBe(true);

      const crossed = await atelierClient.request(
        "GET",
        `/api/customers/${encodeURIComponent(customer.customerId)}`,
      );
      expect(crossed.status).toBe(404);
      expect(JSON.stringify(crossed.body ?? {})).not.toContain("Client comercial restrâns");
      const mutated = await atelierClient.request(
        "PATCH",
        `/api/customers/${encodeURIComponent(customer.customerId)}`,
        { displayName: "Client comercial restrâns modificat" },
      );
      expect(mutated.status).toBe(404);
      const own = await deskClient.request(
        "GET",
        `/api/customers/${encodeURIComponent(customer.customerId)}`,
      );
      expect(own.ok).toBe(true);
      expect((own.body?.customer as { displayName?: string } | undefined)?.displayName).toBe(
        "Client comercial restrâns",
      );
    } finally {
      fixture.close();
    }
  }, 60_000);
});
