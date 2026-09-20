import { afterEach, describe, expect, it } from "vitest";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("organization capability providers", () => {
  it("lets an owner add a generic capability machine without HUB MEDIA ids", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Firma Utilaj", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner-utilaj@new.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const owner = await loginCloud(
        fixture.app,
        "owner-utilaj@new.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      };
      const created = await fixture.app.request("/api/organization-providers/capability", {
        method: "POST",
        headers,
        body: JSON.stringify({
          capabilityId: "CNC_ROUTING",
          label: "Utilaj debitare",
        }),
      });
      expect(created.status).toBe(200);
      const body = (await created.json()) as { machineId: string; alreadyApplied: boolean };
      expect(body.alreadyApplied).toBe(false);
      expect(body.machineId).toBe("mch:org-cnc-routing");
      expect(body.machineId).not.toMatch(/4020|HUB/i);

      const again = await fixture.app.request("/api/organization-providers/capability", {
        method: "POST",
        headers,
        body: JSON.stringify({
          capabilityId: "CNC_ROUTING",
          label: "Utilaj debitare",
        }),
      });
      expect(again.status).toBe(200);
      expect(((await again.json()) as { alreadyApplied: boolean }).alreadyApplied).toBe(true);
    } finally {
      fixture.close();
    }
  });
});
