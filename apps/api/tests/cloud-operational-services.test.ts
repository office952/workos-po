import { SITE_INSTALLATION_SCOPE_ID } from "@workos-final/domain";
import { afterEach, describe, expect, it } from "vitest";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("Cloud operational service authorization", () => {
  it("refuses a member write and keeps organization offers inside the active plane", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, {
      email: "owner-a@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "owner-b@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });

    const ownerA = await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD);
    const ownerB = await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD);
    const memberA = await loginCloud(
      fixture.app,
      "member-a@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    expect(ownerA.response.status).toBe(200);
    expect(ownerB.response.status).toBe(200);
    expect(memberA.response.status).toBe(200);

    const memberWrite = await fixture.app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: {
          cookie: memberA.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ offerMode: "INTERNAL" }),
      },
    );
    expect(memberWrite.status).toBe(403);
    expect(((await memberWrite.json()) as { error: string }).error).toBe("forbidden");

    const memberRead = (await (
      await fixture.app.request("/api/operational-services", {
        headers: { cookie: memberA.cookie ?? "" },
      })
    ).json()) as {
      services: { capabilities: Array<{ capabilityId: string; configured: boolean }> };
    };
    expect(
      memberRead.services.capabilities.find(
        (item) => item.capabilityId === SITE_INSTALLATION_SCOPE_ID,
      )?.configured,
    ).toBe(false);

    const ownerWrite = await fixture.app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: {
          cookie: ownerA.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ offerMode: "INTERNAL" }),
      },
    );
    expect(ownerWrite.status).toBe(200);

    const readB = (await (
      await fixture.app.request("/api/operational-services", {
        headers: { cookie: ownerB.cookie ?? "" },
      })
    ).json()) as {
      services: {
        capabilities: Array<{
          capabilityId: string;
          configured: boolean;
          offerMode: string | null;
        }>;
      };
    };
    expect(
      readB.services.capabilities.find((item) => item.capabilityId === SITE_INSTALLATION_SCOPE_ID),
    ).toMatchObject({ configured: false, offerMode: null });

    const crossWrite = await fixture.app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: {
          cookie: ownerB.cookie ?? "",
          "content-type": "application/json",
          "x-organization-id": alpha.organization.organizationId,
        },
        body: JSON.stringify({ offerMode: "SUBCONTRACTED" }),
      },
    );
    expect(crossWrite.status).toBe(200);
    const stillA = (await (
      await fixture.app.request("/api/operational-services", {
        headers: { cookie: ownerA.cookie ?? "" },
      })
    ).json()) as {
      services: {
        capabilities: Array<{ capabilityId: string; offerMode: string | null }>;
      };
    };
    expect(
      stillA.services.capabilities.find((item) => item.capabilityId === SITE_INSTALLATION_SCOPE_ID)
        ?.offerMode,
    ).toBe("INTERNAL");
    const nowB = (await (
      await fixture.app.request("/api/operational-services", {
        headers: { cookie: ownerB.cookie ?? "" },
      })
    ).json()) as {
      services: {
        capabilities: Array<{ capabilityId: string; offerMode: string | null }>;
      };
    };
    expect(
      nowB.services.capabilities.find((item) => item.capabilityId === SITE_INSTALLATION_SCOPE_ID)
        ?.offerMode,
    ).toBe("SUBCONTRACTED");
    fixture.close();
  });
});
