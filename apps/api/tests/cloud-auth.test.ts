import { PLEXIGLAS_3MM_OPAL_ID } from "@workos-final/domain";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ApiEnv } from "../src/cloud/context.js";
import { registerCloudRoutes } from "../src/cloud/routes.js";
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

describe("Cloud auth and authorization", () => {
  it("reports Cloud auth as unconfigured when the control plane is missing", async () => {
    const app = new Hono<ApiEnv>();
    app.use("/api/*", async (c, next) => {
      c.set("accessMode", "cloud");
      await next();
    });
    registerCloudRoutes(app);
    const session = await app.request("/api/cloud/session");
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      mode: "cloud",
      authConfigured: false,
      user: null,
      organization: null,
    });
  });

  it("keeps single-plane session public and login disabled", async () => {
    const app = createApp();
    const session = await app.request("/api/cloud/session");
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      mode: "single_plane",
      user: null,
    });
    const login = await app.request("/api/cloud/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: OWNER_PASSWORD }),
    });
    expect(login.status).toBe(404);
  });

  it("rejects anonymous Cloud domain reads and owner writes", async () => {
    const fixture = createCloudFixture();
    const health = await fixture.app.request("/api/health");
    expect(health.status).toBe(200);
    const session = await fixture.app.request("/api/cloud/session");
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      mode: "cloud",
      user: null,
    });
    expect((await fixture.app.request("/api/resources-admin")).status).toBe(401);
    expect(
      (
        await fixture.app.request("/api/resources-admin/cost-evidence/cev:missing", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: 18, note: "anonim" }),
        })
      ).status,
    ).toBe(401);
    fixture.close();
  });

  it("logs in an owner, ignores client org headers, and blocks a member write", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const member = await addUser(fixture, {
      email: "member@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });
    fixture.controlPlane.addMembership({
      userId: member.userId,
      organizationId: beta.organization.organizationId,
      role: "member",
    });

    const ownerLogin = await loginCloud(
      fixture.app,
      "owner@example.test",
      OWNER_PASSWORD,
    );
    expect(ownerLogin.response.status).toBe(200);
    expect(ownerLogin.body.user).toMatchObject({ email: "owner@example.test" });

    const sessionWithHeader = await fixture.app.request("/api/cloud/session", {
      headers: {
        cookie: ownerLogin.cookie ?? "",
        "X-Organization-Id": beta.organization.organizationId,
      },
    });
    const sessionBody = (await sessionWithHeader.json()) as {
      organization?: { organizationId?: string; displayName?: string };
    };
    expect(sessionBody.organization?.organizationId).toBe(alpha.organization.organizationId);
    expect(sessionBody.organization?.displayName).toBe("Atelier Alpha");

    const admin = (await (
      await fixture.app.request("/api/resources-admin", {
        headers: { cookie: ownerLogin.cookie ?? "" },
      })
    ).json()) as { costEvidence?: Array<Record<string, unknown>> };
    const plexi = admin.costEvidence?.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.evidenceRowId).toBeTruthy();

    const ownerWrite = await fixture.app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: {
          cookie: ownerLogin.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount: 18, note: "owner" }),
      },
    );
    expect(ownerWrite.status).toBe(200);

    const memberLogin = await loginCloud(
      fixture.app,
      "member@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    expect(memberLogin.response.status).toBe(200);
    const memberRead = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: memberLogin.cookie ?? "" },
    });
    expect(memberRead.status).toBe(200);
    const memberWrite = await fixture.app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: {
          cookie: memberLogin.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount: 19, note: "member" }),
      },
    );
    expect(memberWrite.status).toBe(403);
    const memberCreate = await fixture.app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: {
        cookie: memberLogin.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        resourceId: "aluminium_return_profile",
        amount: 2,
        when: { volumeDepthMm: 30 },
      }),
    });
    expect(memberCreate.status).toBe(403);
    fixture.close();
  });

  it("requires organization selection and clears the operator cookie on switch", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    const user = await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "beta-owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    fixture.controlPlane.addMembership({
      userId: user.userId,
      organizationId: beta.organization.organizationId,
      role: "member",
    });

    const first = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    expect(first.response.status).toBe(409);
    expect(first.body.error).toBe("organization_selection_required");

    const chosen = await loginCloud(
      fixture.app,
      "owner@example.test",
      OWNER_PASSWORD,
      alpha.organization.organizationId,
    );
    expect(chosen.response.status).toBe(200);

    const switched = await fixture.app.request("/api/cloud/active-organization", {
      method: "POST",
      headers: {
        cookie: chosen.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ organizationId: beta.organization.organizationId }),
    });
    expect(switched.status).toBe(200);
    const switchedBody = (await switched.json()) as {
      organization?: { displayName?: string; role?: string };
    };
    expect(switchedBody.organization).toMatchObject({
      displayName: "Atelier Beta",
      role: "member",
    });
    const setCookies = switched.headers.getSetCookie().join(";");
    expect(setCookies).toMatch(/workos_operator_session=/);
    fixture.close();
  });

  it("sets an HttpOnly Lax cookie and Secure in production", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    const cookie = login.response.headers.getSetCookie().find((item) =>
      item.startsWith("workos_cloud_session="),
    );
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=43200/);
    expect(cookie).not.toMatch(/Secure/i);
    fixture.close();

    const production = createCloudFixture({ env: { NODE_ENV: "production" } });
    const prodOrg = await addOrganization(production, "Atelier Alpha");
    await addUser(production, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: prodOrg.organization.organizationId,
      role: "owner",
    });
    const prodLogin = await loginCloud(
      production.app,
      "owner@example.test",
      OWNER_PASSWORD,
    );
    const prodCookie = prodLogin.response.headers.getSetCookie().find((item) =>
      item.startsWith("workos_cloud_session="),
    );
    expect(prodCookie).toMatch(/Secure/i);
    expect(prodCookie).toMatch(/HttpOnly/i);
    expect(prodCookie).toMatch(/SameSite=Lax/i);
    production.close();
  });

  it("does not advertise credentialed CORS to Vite origins in production", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "production" } });
    const response = await fixture.app.request("/api/health", {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    fixture.close();
  });

  it("revokes the Cloud session projection when membership is no longer usable", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const user = await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    expect(login.response.status).toBe(200);

    fixture.controlPlane.db
      .prepare(
        `UPDATE organization_memberships SET status = 'REVOKED' WHERE user_id = ?`,
      )
      .run(user.userId);

    const protectedRead = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(protectedRead.status).toBe(403);

    const session = await fixture.app.request("/api/cloud/session", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      mode: "cloud",
      user: null,
      organization: null,
    });
    fixture.close();
  });

  it("still requires real Cloud login for a SYNTHETIC_TEST organization", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Sintetic Auth", "SYNTHETIC_TEST");
    expect((await fixture.app.request("/api/resources-admin")).status).toBe(401);
    await addUser(fixture, {
      email: "synth-auth@example.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const missingPassword = await fixture.app.request("/api/cloud/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "synth-auth@example.test" }),
    });
    expect(missingPassword.status).toBe(400);
    const wrongPassword = await loginCloud(
      fixture.app,
      "synth-auth@example.test",
      "not-the-password",
      org.organization.organizationId,
    );
    expect(wrongPassword.response.status).toBe(401);
    expect(wrongPassword.cookie).toBeNull();
    const headerSpoof = await fixture.app.request("/api/resources-admin", {
      headers: { "X-Organization-Id": org.organization.organizationId },
    });
    expect(headerSpoof.status).toBe(401);
    const login = await loginCloud(
      fixture.app,
      "synth-auth@example.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    expect(login.response.status).toBe(200);
    expect(login.cookie).toMatch(/^workos_cloud_session=/);
    expect((await fixture.app.request("/api/resources-admin")).status).toBe(401);
    expect(
      (await fixture.app.request("/api/resources-admin", { headers: { cookie: login.cookie ?? "" } }))
        .status,
    ).toBe(200);
    fixture.close();
  });

  it("does not project a disabled organization as a usable Cloud session", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    fixture.controlPlane.db
      .prepare(`UPDATE organizations SET status = 'DISABLED' WHERE organization_id = ?`)
      .run(alpha.organization.organizationId);

    const protectedRead = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(protectedRead.status).toBe(403);
    await expect(protectedRead.json()).resolves.toEqual({ error: "organization_disabled" });

    const session = await fixture.app.request("/api/cloud/session", {
      headers: { cookie: login.cookie ?? "" },
    });
    await expect(session.json()).resolves.toMatchObject({
      user: null,
      organization: null,
    });
    fixture.close();
  });
});
