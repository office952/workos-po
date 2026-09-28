import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OWNER_REVIEW_BOOTSTRAP_POLICY,
  OWNER_REVIEW_DEFAULT_PASSWORD,
  OWNER_REVIEW_ORG_NAME,
  OWNER_REVIEW_OWNER_EMAIL,
  buildOwnerReviewIdentityFile,
} from "../src/cloud/ownerReviewIdentity.js";
import {
  classifyOwnerReviewRoot,
  ensureOwnerReviewProvisioned,
  hasSyntheticReferenceMarker,
  OwnerReviewResetError,
  resetOwnerReviewRoot,
  writeOwnerReviewIdentity,
} from "../src/cloud/ownerReviewReset.js";
import {
  createOperatorAppClient,
  loginAppSeedClient,
} from "../src/cloud/ownerReviewHttp.js";
import { seedOwnerReviewDataset } from "../src/cloud/ownerReviewSeed.js";
import { openProvisionedControlPlane } from "../src/cloud/provision.js";
import {
  cleanupCloudTemps,
  loginCloud,
  OWNER_PASSWORD,
  addOrganization,
  addUser,
  createCloudFixture,
  openCloudFixture,
  trackTempDir,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("owner-review reset safety", () => {
  it("refuses production, unclassified storage, and org-id selectors", async () => {
    await expect(
      resetOwnerReviewRoot({
        cloudRoot: trackTempDir(),
        env: { NODE_ENV: "production" },
      }),
    ).rejects.toMatchObject({ code: "production_refused" });

    await expect(
      resetOwnerReviewRoot({
        cloudRoot: trackTempDir(),
        organizationId: "org:anything",
      }),
    ).rejects.toMatchObject({ code: "org_id_selector_forbidden" });

    await expect(
      resetOwnerReviewRoot({
        cloudRoot: trackTempDir(),
        organizationName: "Real Customer Org",
      }),
    ).rejects.toMatchObject({ code: "arbitrary_org_forbidden" });

    await expect(
      resetOwnerReviewRoot({
        cloudRoot: trackTempDir(),
        allOrganizations: true,
      }),
    ).rejects.toMatchObject({ code: "arbitrary_org_forbidden" });

    const unclassified = trackTempDir();
    mkdirSync(join(unclassified, "control"), { recursive: true });
    writeFileSync(join(unclassified, "control", "control-plane.sqlite"), "not-a-db");
    expect(classifyOwnerReviewRoot(unclassified)).toBe("UNCLASSIFIED_BUSINESS_STORAGE");
    await expect(resetOwnerReviewRoot({ cloudRoot: unclassified })).rejects.toMatchObject({
      code: "root_unclassified",
    });
  });

  it("refuses reset of a nonempty unmarked directory and preserves planted files", async () => {
    const root = trackTempDir();
    const plantedPath = join(root, "unrelated-owner-file.txt");
    const plantedBody = "DO_NOT_DELETE_UNRELATED_CONTENT";
    writeFileSync(plantedPath, plantedBody);
    const beforeEntries = readdirSync(root).sort();

    expect(hasSyntheticReferenceMarker(root)).toBe(false);
    expect(classifyOwnerReviewRoot(root)).toBe("EMPTY_OR_UNKNOWN");
    expect(beforeEntries.length).toBeGreaterThan(0);

    await expect(resetOwnerReviewRoot({ cloudRoot: root })).rejects.toMatchObject({
      code: "synthetic_marker_required",
    });

    expect(existsSync(plantedPath)).toBe(true);
    expect(readFileSync(plantedPath, "utf8")).toBe(plantedBody);
    expect(readdirSync(root).sort()).toEqual(beforeEntries);
    expect(hasSyntheticReferenceMarker(root)).toBe(false);
  });

  it("refuses provision ownership claim on a nonempty unmarked directory", async () => {
    const root = trackTempDir();
    const plantedPath = join(root, "unrelated-provision-file.txt");
    const plantedBody = "DO_NOT_CLAIM_UNRELATED_CONTENT";
    writeFileSync(plantedPath, plantedBody);
    const beforeEntries = readdirSync(root).sort();

    expect(hasSyntheticReferenceMarker(root)).toBe(false);
    expect(classifyOwnerReviewRoot(root)).toBe("EMPTY_OR_UNKNOWN");

    await expect(ensureOwnerReviewProvisioned({ cloudRoot: root })).rejects.toMatchObject({
      code: "root_unclassified",
    });

    expect(hasSyntheticReferenceMarker(root)).toBe(false);
    expect(existsSync(plantedPath)).toBe(true);
    expect(readFileSync(plantedPath, "utf8")).toBe(plantedBody);
    expect(readdirSync(root).sort()).toEqual(beforeEntries);
  });

  it("allows safe create/provision on an absent path", async () => {
    const root = join(trackTempDir(), "owner-review-absent-provision");
    expect(classifyOwnerReviewRoot(root)).toBe("ABSENT");
    expect(hasSyntheticReferenceMarker(root)).toBe(false);

    const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root });
    expect(provisioned.identity.organization).toBe(OWNER_REVIEW_ORG_NAME);
    expect(provisioned.identity.bootstrapPolicy).toBe(OWNER_REVIEW_BOOTSTRAP_POLICY);
    expect(hasSyntheticReferenceMarker(root)).toBe(true);
    expect(classifyOwnerReviewRoot(root)).toBe("SYNTHETIC_REFERENCE");
  });

  it("refuses reset when an existing plane is not SYNTHETIC_TEST", async () => {
    const marked = trackTempDir();
    writeFileSync(
      join(marked, "SYNTHETIC_REFERENCE"),
      "SYNTHETIC_REFERENCE_DATA=YES\nCLASSIFICATION=SYNTHETIC_REFERENCE\n",
    );
    const { provisionNewOrganization } = await import("../src/cloud/provision.js");
    await provisionNewOrganization({
      cloudRoot: marked,
      displayName: OWNER_REVIEW_ORG_NAME,
      email: OWNER_REVIEW_OWNER_EMAIL,
      password: OWNER_REVIEW_DEFAULT_PASSWORD,
      bootstrapPolicy: "NEW_ORGANIZATION",
    });
    writeOwnerReviewIdentity(
      marked,
      buildOwnerReviewIdentityFile(OWNER_REVIEW_DEFAULT_PASSWORD),
    );
    await expect(resetOwnerReviewRoot({ cloudRoot: marked })).rejects.toMatchObject({
      code: "plane_not_synthetic",
    });
  });

  it("resets and provisions WorkOS Test with SYNTHETIC_TEST", async () => {
    // ABSENT path: create-only (no existing contents to wipe).
    const root = join(trackTempDir(), "owner-review-root");
    expect(classifyOwnerReviewRoot(root)).toBe("ABSENT");

    const result = await resetOwnerReviewRoot({ cloudRoot: root });
    expect(result.identity.organization).toBe(OWNER_REVIEW_ORG_NAME);
    expect(result.identity.bootstrapPolicy).toBe(OWNER_REVIEW_BOOTSTRAP_POLICY);
    expect(result.users.users.map((item) => item.email).sort()).toEqual(
      [
        "comercial@workos.test",
        "owner@workos.test",
        "productie@workos.test",
      ].sort(),
    );
    const controlPlane = openProvisionedControlPlane(root);
    try {
      const org = controlPlane
        .listOrganizations()
        .find((item) => item.displayName === OWNER_REVIEW_ORG_NAME);
      expect(org).toBeTruthy();
      const plane = controlPlane.getPlaneByOrganization(org!.organizationId);
      expect(plane?.bootstrapPolicy).toBe("SYNTHETIC_TEST");
    } finally {
      controlPlane.close();
    }
    expect(classifyOwnerReviewRoot(root)).toBe("SYNTHETIC_REFERENCE");

    // Marked synthetic root may be wiped and rebuilt.
    const again = await resetOwnerReviewRoot({ cloudRoot: root });
    expect(again.identity.organization).toBe(OWNER_REVIEW_ORG_NAME);
    expect(classifyOwnerReviewRoot(root)).toBe("SYNTHETIC_REFERENCE");
  });
});

describe("owner-review dataset seed", () => {
  it("creates a connected deterministic dataset and is idempotent", async () => {
    const root = trackTempDir();
    const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root });
    const fixture = openCloudFixture(root);

    try {
      const cloud = await loginAppSeedClient({
        app: fixture.app,
        email: OWNER_REVIEW_OWNER_EMAIL,
        password: OWNER_REVIEW_DEFAULT_PASSWORD,
        organizationId: provisioned.organizationId,
      });

      const report1 = await seedOwnerReviewDataset({
        client: cloud,
        createOperatorClient: async (personId, pin) =>
          createOperatorAppClient({
            app: fixture.app,
            cloudCookie: cloud.jar.cookie,
            personId,
            pin,
          }),
      });

      expect(report1.customers).toBeGreaterThanOrEqual(8);
      expect(report1.requests).toBeGreaterThanOrEqual(10);
      expect(report1.quotesFrozen).toBeGreaterThanOrEqual(3);
      expect(report1.quotesAccepted).toBeGreaterThanOrEqual(1);
      expect(report1.assemblies).toBe(1);
      expect(report1.scenarioA.customer).toBe("Nord Market Demo SRL");
      expect(report1.scenarioA.requestTitle).toContain("Cluj");
      expect(report1.scenarioA.assemblyId).toBeTruthy();
      expect(report1.people).toBeGreaterThanOrEqual(2);
      expect(report1.machines).toBeGreaterThanOrEqual(2);

      const customers = await cloud.request("GET", "/api/customers");
      const nord = (
        (customers.body?.customers as Array<{ customerId: string; displayName: string }>) ?? []
      ).find((item) => item.displayName === "Nord Market Demo SRL");
      expect(nord).toBeTruthy();

      const requests = await cloud.request("GET", "/api/requests");
      const nordRequest = (
        ((requests.body?.overview as { requests?: Array<Record<string, unknown>> })?.requests) ??
        []
      ).find(
        (item) =>
          item.customerId === nord?.customerId &&
          String(item.title).includes("Cluj"),
      );
      expect(nordRequest).toBeTruthy();

      const quotes = await cloud.request("GET", "/api/quotes");
      expect(
        ((quotes.body?.overview as { quotes?: unknown[] })?.quotes ?? []).length,
      ).toBeGreaterThanOrEqual(3);

      const jobs = await cloud.request("GET", "/api/jobs");
      const jobRows =
        ((jobs.body?.overview as { jobs?: Array<Record<string, unknown>> })?.jobs) ?? [];
      expect(jobRows.some((item) => item.kind === "ASSEMBLY")).toBe(true);
      expect(jobRows.some((item) => item.planId)).toBe(true);

      const report2 = await seedOwnerReviewDataset({
        client: cloud,
        createOperatorClient: async (personId, pin) =>
          createOperatorAppClient({
            app: fixture.app,
            cloudCookie: cloud.jar.cookie,
            personId,
            pin,
          }),
      });
      expect(report2.customers).toBe(report1.customers);
      expect(report2.requests).toBe(report1.requests);
      expect(report2.assemblies).toBe(1);

      const auth = await loginCloud(
        fixture.app,
        OWNER_REVIEW_OWNER_EMAIL,
        OWNER_REVIEW_DEFAULT_PASSWORD,
        provisioned.organizationId,
      );
      expect(auth.response.status).toBe(200);

      const commercial = await loginCloud(
        fixture.app,
        "comercial@workos.test",
        OWNER_REVIEW_DEFAULT_PASSWORD,
        provisioned.organizationId,
      );
      expect(commercial.response.status).toBe(200);
    } finally {
      fixture.close();
    }
  });

  it("does not treat a non-synthetic organization as an accidental reset target", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Real Looking Org", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner@real.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      await expect(
        resetOwnerReviewRoot({
          cloudRoot: fixture.cloudRoot,
          organizationId: org.organization.organizationId,
        }),
      ).rejects.toBeInstanceOf(OwnerReviewResetError);
      await expect(
        resetOwnerReviewRoot({
          cloudRoot: fixture.cloudRoot,
          organizationName: "Real Looking Org",
        }),
      ).rejects.toBeInstanceOf(OwnerReviewResetError);
      // Unmarked cloud fixture root must not be wipeable as owner-review.
      expect(classifyOwnerReviewRoot(fixture.cloudRoot)).toBe(
        "UNCLASSIFIED_BUSINESS_STORAGE",
      );
    } finally {
      fixture.close();
    }
  });
});

describe("dev provision bootstrap policy whitelist", () => {
  it("accepts SYNTHETIC_TEST and refuses ADOPT_EXISTING", async () => {
    const { parseDevProvisionBootstrapPolicy } = await import(
      "../src/cloud/devProvisionCli.js"
    );
    expect(parseDevProvisionBootstrapPolicy("SYNTHETIC_TEST")).toBe("SYNTHETIC_TEST");
    expect(parseDevProvisionBootstrapPolicy(undefined)).toBe("NEW_ORGANIZATION");
    expect(() => parseDevProvisionBootstrapPolicy("ADOPT_EXISTING")).toThrow(
      /Invalid --bootstrap-policy/,
    );
  });
});
