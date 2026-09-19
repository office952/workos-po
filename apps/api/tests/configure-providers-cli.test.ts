import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runConfigureProvidersCli } from "../src/cloud/configureProvidersCli.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { LETTERS_TWO_MACHINE_PROVIDER_CONFIG } from "./fixtures/lettersTwoMachineProviderConfig.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("configure providers CLI", () => {
  it("rejects name-based selection and requires exactly one mode", async () => {
    await expect(
      runConfigureProvidersCli(
        ["--root", "x", "--org", "HUB MEDIA", "--dry-run", "--config-stdin"],
        {},
      ),
    ).rejects.toThrow(/organization-id/);
    await expect(
      runConfigureProvidersCli(["--root", "x", "--organization-id", "org:1", "--config-stdin"], {}),
    ).rejects.toThrow(/dry-run or --execute/);
    await expect(runConfigureProvidersCli(["--root", "x"], { NODE_ENV: "production" })).rejects.toThrow(
      /must not run as production/,
    );
  });

  it("applies an explicit organization id from stdin", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Firma Noua", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const stdin = Readable.from([JSON.stringify(LETTERS_TWO_MACHINE_PROVIDER_CONFIG)]);
      await runConfigureProvidersCli(
        [
          "--root",
          fixture.cloudRoot,
          "--organization-id",
          org.organization.organizationId,
          "--execute",
          "--config-stdin",
        ],
        { NODE_ENV: "test" },
        stdin,
      );
      const workcenters = fixture.registry.getOrOpen(org.plane, fixture.cloudRoot).providerRegistry;
      expect(workcenters.machines).toHaveLength(2);
    } finally {
      fixture.close();
    }
  });
});
