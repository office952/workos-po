import { afterEach, describe, expect, it } from "vitest";
import { API_CONTRACT_ID, HEALTH_SERVICE_NAME, createApp } from "../src/app.js";
import { evaluateReadiness } from "../src/ops/readiness.js";
import { cleanupCloudTemps, createCloudFixture } from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("GET /api/ready", () => {
  it("returns ready for single-plane without leaking paths", async () => {
    const app = createApp();
    const response = await app.request("/api/ready");
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ready",
      service: HEALTH_SERVICE_NAME,
      apiContractId: API_CONTRACT_ID,
      mode: "single_plane",
    });
    expect(JSON.stringify(body)).not.toMatch(/tmp\\|Users\\|password|planeKey|sqlitePath/i);
  });

  it("returns ready for an isolated cloud fixture", async () => {
    const fixture = createCloudFixture();
    const response = await fixture.app.request("/api/ready");
    const body = (await response.json()) as {
      status: string;
      mode: string;
      checks: Record<string, boolean>;
    };
    expect(response.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.mode).toBe("cloud");
    expect(Object.values(body.checks).every(Boolean)).toBe(true);
    fixture.close();
  });

  it("keeps health lightweight and distinct from readiness", async () => {
    const app = createApp();
    const health = await app.request("/api/health");
    expect(await health.json()).toEqual({
      status: "ok",
      service: HEALTH_SERVICE_NAME,
      apiContractId: API_CONTRACT_ID,
    });
  });
});

describe("evaluateReadiness", () => {
  it("fails closed when cloud mode has no control plane", () => {
    const body = evaluateReadiness({ mode: "cloud" });
    expect(body.status).toBe("not_ready");
    expect(body.checks.controlPlaneOpen).toBe(false);
  });
});
