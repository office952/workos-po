import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { backupLocalRuntime } from "../src/local/backup.js";
import { LocalRuntimeError } from "../src/local/errors.js";
import {
  assertSafeLocalRoot,
  defaultLocalRoot,
  isLocalRootConfigured,
  resolveLocalRoot,
} from "../src/local/paths.js";
import { ensureLocalProfile } from "../src/local/profile.js";
import { startWorkosApi } from "../src/startApi.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function writeStaticRoot(): string {
  const dir = tempDir("workos-local-static-");
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><html><body>workos-local-spa</body></html>\n",
  );
  return dir;
}

function localEnv(
  root: string,
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "0",
    WORKOS_LOCAL_ROOT: root,
    WORKOS_CLOUD_ROOT: "",
    WORKOS_BACKUP_ROOT: "",
    WORKOS_STATIC_ROOT: extra.WORKOS_STATIC_ROOT ?? writeStaticRoot(),
    ...extra,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const PRINCIPAL_ROUTES = [
  "/clienti",
  "/cereri",
  "/catalog",
  "/configurator",
  "/oferte",
  "/lucrari",
  "/atelier",
] as const;

describe("local runtime profile", () => {
  it("initializes a first-run local layout without business data", () => {
    const root = tempDir("workos-local-init-");
    const profile = ensureLocalProfile({
      ...process.env,
      WORKOS_LOCAL_ROOT: root,
      WORKOS_CLOUD_ROOT: "",
    });
    expect(profile.profile).toBe("local");
    expect(profile.firstRun).toBe(true);
    expect(profile.root).toBe(root);
    expect(profile.sqlitePath.endsWith("product-system.sqlite")).toBe(true);
    const again = ensureLocalProfile({
      ...process.env,
      WORKOS_LOCAL_ROOT: root,
      WORKOS_CLOUD_ROOT: "",
    });
    expect(again.firstRun).toBe(true);
    expect(again.configPath).toBe(profile.configPath);
  });

  it("reopens an existing local database without resetting it", async () => {
    const root = tempDir("workos-local-reopen-");
    const staticRoot = writeStaticRoot();
    const first = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const created = await fetch(`http://127.0.0.1:${first.port}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client local sintetic" }),
    });
    expect(created.status).toBe(201);
    const customer = (await readJson(created)).customer as { customerId: string };
    await first.close();

    const profile = ensureLocalProfile({
      ...process.env,
      WORKOS_LOCAL_ROOT: root,
      WORKOS_CLOUD_ROOT: "",
    });
    expect(profile.firstRun).toBe(false);

    const second = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const listed = await readJson(await fetch(`http://127.0.0.1:${second.port}/api/customers`));
    const customers = listed.customers as { customerId: string }[];
    expect(customers.some((item) => item.customerId === customer.customerId)).toBe(true);
    await second.close();
  });

  it("refuses an invalid local root and a Cloud-shaped root", () => {
    expect(() => assertSafeLocalRoot("   ", { WORKOS_CLOUD_ROOT: "" })).toThrow(LocalRuntimeError);
    const driveRoot = process.platform === "win32" ? "C:\\" : "/";
    expect(() => assertSafeLocalRoot(driveRoot, { WORKOS_CLOUD_ROOT: "" })).toThrowError(
      /local_root_invalid/,
    );
    const asFile = join(tempDir("workos-local-file-"), "not-a-dir");
    writeFileSync(asFile, "nope");
    expect(() => assertSafeLocalRoot(asFile, { WORKOS_CLOUD_ROOT: "" })).toThrowError(
      /local_root_is_file/,
    );
    const cloudShaped = tempDir("workos-local-cloudshaped-");
    mkdirSync(join(cloudShaped, "organizations"));
    expect(() => assertSafeLocalRoot(cloudShaped, { WORKOS_CLOUD_ROOT: "" })).toThrowError(
      /local_root_looks_like_cloud/,
    );
    expect(() =>
      assertSafeLocalRoot(join(process.cwd(), "should-not-write-local"), { WORKOS_CLOUD_ROOT: "" }),
    ).toThrowError(/local_root_inside_source/);
    expect(isLocalRootConfigured({ WORKOS_LOCAL_ROOT: "" })).toBe(false);
    expect(() => resolveLocalRoot({ VITEST: "1", WORKOS_CLOUD_ROOT: "" })).toThrowError(
      /local_root_missing/,
    );
    expect(defaultLocalRoot().includes("WorkOS")).toBe(true);
  });

  it("refuses LOCAL and CLOUD roots together", async () => {
    const root = tempDir("workos-local-conflict-");
    await expect(
      startWorkosApi(
        localEnv(root, {
          WORKOS_CLOUD_ROOT: tempDir("workos-not-real-cloud-"),
        }),
        { installSignals: false },
      ),
    ).rejects.toThrowError(/local_cloud_conflict/);
  });
});

describe("local runtime HTTP", () => {
  it("serves health, readiness, and principal SPA routes from the built-site contract", async () => {
    const root = tempDir("workos-local-http-");
    const staticRoot = writeStaticRoot();
    const started = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const base = `http://127.0.0.1:${started.port}`;
    const health = await readJson(await fetch(`${base}/api/health`));
    expect(health.status).toBe("ok");
    const ready = await fetch(`${base}/api/ready`);
    expect(ready.status).toBe(200);
    const readyBody = await readJson(ready);
    expect(readyBody.status).toBe("ready");
    expect(readyBody.mode).toBe("single_plane");
    for (const route of PRINCIPAL_ROUTES) {
      const page = await fetch(`${base}${route}`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("workos-local-spa");
    }
    await started.close();
  });

  it("persists a synthetic customer across restart", async () => {
    const root = tempDir("workos-local-persist-");
    const staticRoot = writeStaticRoot();
    const first = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const created = await fetch(`http://127.0.0.1:${first.port}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Persistenta locala" }),
    });
    const customer = (await readJson(created)).customer as { customerId: string; displayName: string };
    expect(customer.displayName).toBe("Persistenta locala");
    await first.close();

    const second = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const listed = await readJson(await fetch(`http://127.0.0.1:${second.port}/api/customers`));
    const customers = listed.customers as { customerId: string; displayName: string }[];
    expect(customers.some((item) => item.customerId === customer.customerId)).toBe(true);
    await second.close();
  });

  it("persists a synthetic request attachment across restart", async () => {
    const root = tempDir("workos-local-doc-");
    const staticRoot = writeStaticRoot();
    const bytes = Buffer.from("atasament-local-sintetic-v1");
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const first = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const base = `http://127.0.0.1:${first.port}`;
    const customer = (await readJson(
      await fetch(`${base}/api/customers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Client atasament" }),
      }),
    )).customer as { customerId: string };
    const request = (await readJson(
      await fetch(`${base}/api/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: customer.customerId,
          title: "Cerere locala sintetica",
          description: "Atasament de proba.",
        }),
      }),
    )).request as { requestId: string };
    const form = new FormData();
    form.append("file", new File([bytes], "proba.txt", { type: "text/plain" }));
    const uploaded = await fetch(`${base}/api/requests/${request.requestId}/attachments`, {
      method: "POST",
      body: form,
    });
    expect(uploaded.status).toBe(201);
    const attachment = (await readJson(uploaded)).attachment as { attachmentId: string };
    const firstDownload = await fetch(
      `${base}/api/requests/${request.requestId}/attachments/${attachment.attachmentId}/download`,
    );
    expect(firstDownload.status).toBe(200);
    await first.close();

    const second = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const restartBase = `http://127.0.0.1:${second.port}`;
    const restarted = await fetch(
      `${restartBase}/api/requests/${request.requestId}/attachments/${attachment.attachmentId}/download`,
    );
    expect(restarted.status).toBe(200);
    const restartedBytes = Buffer.from(await restarted.arrayBuffer());
    expect(createHash("sha256").update(restartedBytes).digest("hex")).toBe(expectedHash);
    expect(restartedBytes.equals(bytes)).toBe(true);
    await second.close();
  });

  it("serves the accepted built frontend when repo dist exists", async () => {
    const repoDist = resolve(fileURLToPath(new URL("../../../dist", import.meta.url)));
    if (!existsSync(join(repoDist, "index.html"))) {
      return;
    }
    const root = tempDir("workos-local-dist-");
    const started = await startWorkosApi(
      localEnv(root, {
        WORKOS_STATIC_ROOT: repoDist,
        PORT: "0",
        NODE_ENV: "production",
      }),
      { installSignals: false },
    );
    const base = `http://127.0.0.1:${started.port}`;
    const health = await readJson(await fetch(`${base}/api/health`));
    expect(health.status).toBe("ok");
    const ready = await fetch(`${base}/api/ready`);
    expect(ready.status).toBe(200);
    expect((await readJson(ready)).status).toBe("ready");
    for (const route of PRINCIPAL_ROUTES) {
      const page = await fetch(`${base}${route}`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      const html = await page.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
      expect(html).toContain("<title>WorkOS</title>");
      expect(html).toContain("Se încarcă WorkOS.");
      expect(html).toContain("/assets/index-D87y8Kui.js");
      expect(html).toContain("/assets/index-h89T23-N.css");
      expect(html).not.toContain("workos-local-spa");
    }
    await started.close();
  });

  it("refuses a second local runtime on the same root", async () => {
    const root = tempDir("workos-local-lease-");
    const staticRoot = writeStaticRoot();
    const first = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    await expect(
      startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), { installSignals: false }),
    ).rejects.toThrowError(/local_runtime_active/);
    await first.close();
  });
});

describe("local backup", () => {
  it("writes a local sqlite and document backup when the runtime is stopped", async () => {
    const root = tempDir("workos-local-backup-");
    const staticRoot = writeStaticRoot();
    const started = await startWorkosApi(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }), {
      installSignals: false,
    });
    const base = `http://127.0.0.1:${started.port}`;
    await fetch(`${base}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client backup" }),
    });
    await expect(
      backupLocalRuntime(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot })),
    ).rejects.toThrowError(/local_runtime_active/);
    await started.close();

    const result = await backupLocalRuntime(localEnv(root, { WORKOS_STATIC_ROOT: staticRoot }));
    expect(result.manifest.profile).toBe("local");
    expect(result.manifest.sqlite.bytes).toBeGreaterThan(0);
    expect(result.manifest.sqlite.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
