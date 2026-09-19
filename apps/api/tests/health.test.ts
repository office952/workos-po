import { describe, expect, it } from "vitest";
import { API_CONTRACT_ID, createApp, HEALTH_SERVICE_NAME } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns HTTP 200 and a deterministic health payload", async () => {
    const app = createApp();
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: HEALTH_SERVICE_NAME,
      apiContractId: API_CONTRACT_ID,
    });
  });
});
