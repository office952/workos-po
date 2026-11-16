import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupCloudTemps, createCloudFixture } from "./cloud-harness.js";
import { registeredApiRoutes } from "./route-inventory-helper.js";

/**
 * V1 Organization Access · S0. The registered API surface is read from Hono itself, not from a
 * hand-written list, so a new route cannot silently escape the authorization policy.
 * Regenerate deliberately with WORKOS_WRITE_ROUTE_INVENTORY=1.
 */
const INVENTORY = fileURLToPath(new URL("./fixtures/api-route-inventory.json", import.meta.url));


afterEach(() => cleanupCloudTemps());

describe("API route inventory", () => {
  it("matches the recorded inventory of registered /api routes", () => {
    const fixture = createCloudFixture();
    try {
      const routes = registeredApiRoutes(fixture.app);
      if (process.env.WORKOS_WRITE_ROUTE_INVENTORY === "1") {
        writeFileSync(INVENTORY, `${JSON.stringify(routes, null, 2)}\n`);
      }
      const recorded = JSON.parse(readFileSync(INVENTORY, "utf8")) as string[];
      expect(routes).toEqual(recorded);
    } finally {
      fixture.close();
    }
  });
});
