import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { cookieSecure, mutatingOriginAllowed, shouldSendHsts } from "../src/ops/origin.js";
import { cleanupCloudTemps, createCloudFixture, loginCloud, OWNER_PASSWORD, addOrganization, addUser } from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

describe("production origin and cookie policy", () => {
  it("rejects mutating production requests without a trusted origin", () => {
    const env = {
      NODE_ENV: "production",
      WORKOS_PUBLIC_ORIGIN: "https://workos.example",
    };
    expect(mutatingOriginAllowed(env, "POST", undefined)).toBe(false);
    expect(mutatingOriginAllowed(env, "POST", "https://evil.example")).toBe(false);
    expect(mutatingOriginAllowed(env, "POST", "https://workos.example")).toBe(true);
    expect(mutatingOriginAllowed(env, "GET", undefined)).toBe(true);
  });

  it("returns 403 for production login from a foreign origin", async () => {
    const fixture = createCloudFixture({
      env: {
        NODE_ENV: "production",
        WORKOS_PUBLIC_ORIGIN: "https://workos.example",
      },
    });
    const response = await fixture.app.request("/api/cloud/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ email: "a@b.test", password: "OwnerPass12" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_forbidden" });
    fixture.close();
  });

  it("sets Secure cookies only for HTTPS public origins", () => {
    expect(cookieSecure({ NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: "https://workos.example" })).toBe(
      true,
    );
    expect(
      cookieSecure({ NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: "http://127.0.0.1:8791" }),
    ).toBe(false);
    expect(shouldSendHsts({ NODE_ENV: "production", WORKOS_PUBLIC_ORIGIN: "https://workos.example" }, "https")).toBe(
      true,
    );
    expect(shouldSendHsts({ NODE_ENV: "development" }, "https")).toBe(false);
  });

  it("sets HttpOnly SameSite cloud cookies after login", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Origin Org", "SYNTHETIC_TEST");
    await addUser(fixture, {
      email: "owner@origin.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const { response } = await loginCloud(
      fixture.app,
      "owner@origin.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const cookie = response.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    fixture.close();
  });
});

describe("same-origin static frontend", () => {
  it("serves the built index without exposing API internals", async () => {
    const root = mkdtempSync(join(tmpdir(), "workos-static-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>WorkOS</title>");
    const app = createApp({ staticRoot: root });
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("WorkOS");
    const missingApi = await app.request("/not-an-api-page");
    expect(missingApi.status).toBe(200);
    expect(await missingApi.text()).toContain("WorkOS");
  });

  it("serves the frontend from the same process as an isolated Cloud API", async () => {
    const root = mkdtempSync(join(tmpdir(), "workos-static-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>WorkOS</title>");
    const fixture = createCloudFixture();
    const app = createApp({
      cloud: { controlPlane: fixture.controlPlane, registry: fixture.registry },
      staticRoot: root,
    });
    const page = await app.request("/");
    const ready = await app.request("/api/ready");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("WorkOS");
    expect(ready.status).toBe(200);
    fixture.close();
  });
});
