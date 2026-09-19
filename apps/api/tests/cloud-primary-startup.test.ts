import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CloudConfigurationRequiredError, startWorkosApi } from "../src/startApi.js";
import { addOrganization, cleanupCloudTemps, createCloudFixture } from "./cloud-harness.js";

const extraTemps: string[] = [];

afterEach(() => {
  cleanupCloudTemps();
  for (const dir of extraTemps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function productEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "0",
    WORKOS_CLOUD_ROOT: "",
    WORKOS_SQLITE_PATH: "",
    WORKOS_LOCAL_ROOT: "",
    WORKOS_PUBLIC_ORIGIN: "",
    ...overrides,
  };
}

describe("Cloud primary product startup", () => {
  it("starts the Cloud runtime when WORKOS_CLOUD_ROOT is configured", async () => {
    const fixture = createCloudFixture();
    await addOrganization(fixture, "Startup Org");
    const cloudRoot = fixture.cloudRoot;
    fixture.close();

    const started = await startWorkosApi(productEnv({ WORKOS_CLOUD_ROOT: cloudRoot }), {
      installSignals: false,
    });
    try {
      const health = await fetch(`http://127.0.0.1:${started.port}/api/health`);
      expect(health.status).toBe(200);
      const session = await fetch(`http://127.0.0.1:${started.port}/api/cloud/session`);
      expect(session.status).toBe(200);
      await expect(session.json()).resolves.toMatchObject({
        mode: "cloud",
        user: null,
      });
    } finally {
      await started.close();
    }
  });

  it("fails closed when WORKOS_CLOUD_ROOT is missing", async () => {
    await expect(startWorkosApi(productEnv(), { installSignals: false })).rejects.toBeInstanceOf(
      CloudConfigurationRequiredError,
    );
    await expect(startWorkosApi(productEnv(), { installSignals: false })).rejects.toMatchObject({
      code: "cloud_configuration_required",
    });
  });

  it("does not activate WorkOS from WORKOS_LOCAL_ROOT alone", async () => {
    const localRoot = mkdtempSync(join(tmpdir(), "workos-local-inert-"));
    extraTemps.push(localRoot);
    await expect(
      startWorkosApi(productEnv({ WORKOS_LOCAL_ROOT: localRoot }), { installSignals: false }),
    ).rejects.toMatchObject({
      name: "CloudConfigurationRequiredError",
      code: "cloud_configuration_required",
    });
  });

  it("uses Cloud when both WORKOS_CLOUD_ROOT and WORKOS_LOCAL_ROOT are present", async () => {
    const fixture = createCloudFixture();
    await addOrganization(fixture, "Cloud Wins Org");
    const cloudRoot = fixture.cloudRoot;
    fixture.close();
    const localRoot = mkdtempSync(join(tmpdir(), "workos-local-ignored-"));
    extraTemps.push(localRoot);

    const started = await startWorkosApi(
      productEnv({
        WORKOS_CLOUD_ROOT: cloudRoot,
        WORKOS_LOCAL_ROOT: localRoot,
      }),
      { installSignals: false },
    );
    try {
      const session = await fetch(`http://127.0.0.1:${started.port}/api/cloud/session`);
      expect(session.status).toBe(200);
      await expect(session.json()).resolves.toMatchObject({
        mode: "cloud",
        user: null,
      });
    } finally {
      await started.close();
    }
  });
});
