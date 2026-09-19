import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildLocalPackage } from "../../../packaging/build-package.mjs";
import { installWorkos } from "../../../packaging/installer/install.mjs";
import { uninstallWorkos } from "../../../packaging/installer/uninstall.mjs";
import { buildRuntimeEnv, inspectLocalEndpoint, localUrl } from "../../../packaging/launcher/launch-core.mjs";
import { launchWorkos } from "../../../packaging/launcher/launch.mjs";
import { operatorMessage } from "../../../packaging/launcher/messages.mjs";
import {
  installedAppDir,
  installedDataDir,
  LOCAL_BIND_HOST,
  readProductIdentity,
} from "../../../packaging/paths.mjs";

const temps: string[] = [];
const stoppers: Array<() => Promise<void>> = [];
const proofRoot = mkdtempSync(join(tmpdir(), "workos-install-shared-"));
let packageRoot = "";
let packagedNode = "";

afterEach(async () => {
  while (stoppers.length > 0) {
    const stop = stoppers.pop();
    if (stop) {
      await stop();
    }
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  rmSync(proofRoot, { recursive: true, force: true });
});

beforeAll(() => {
  packageRoot = join(proofRoot, "package");
  const built = buildLocalPackage({ destRoot: packageRoot });
  packagedNode = built.nodePath;
}, 180000);

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, LOCAL_BIND_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("port_unavailable"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
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

describe("local installation contracts", () => {
  it("keeps a single product version source and per-user Windows layout", () => {
    const product = readProductIdentity(join(process.cwd(), "..", "..", "packaging", "product.json"));
    expect(product.productName).toBe("WorkOS");
    expect(product.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(product.bindHost).toBe("127.0.0.1");
    expect(product.defaultPort).toBe(8790);
    expect(installedAppDir({ LOCALAPPDATA: "C:\\Users\\Demo\\AppData\\Local" })).toBe(
      "C:\\Users\\Demo\\AppData\\Local\\Programs\\WorkOS",
    );
    expect(installedDataDir({ LOCALAPPDATA: "C:\\Users\\Demo\\AppData\\Local" })).toBe(
      "C:\\Users\\Demo\\AppData\\Local\\WorkOS\\local",
    );
  });

  it("exposes operator-safe messages without Node or SQLite jargon", () => {
    for (const code of [
      "already_running",
      "port_busy",
      "data_inaccessible",
      "database_cannot_open",
      "runtime_not_ready",
      "browser_cannot_open",
    ] as const) {
      const message = operatorMessage(code);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/tsx|pnpm|node_modules|TypeScript|EADDRINUSE|sqlite/i);
    }
  });

  it("strips development and Cloud variables from the packaged runtime env", () => {
    const env = buildRuntimeEnv({
      env: {
        VITEST: "true",
        WORKOS_SQLITE_PATH: ":memory:",
        WORKOS_CLOUD_ROOT: "C:\\not-used",
        NODE_OPTIONS: "--import tsx",
        PATH: "C:\\dev\\pnpm",
      },
      port: 8790,
      dataRoot: "C:\\Users\\Demo\\AppData\\Local\\WorkOS\\local",
      staticRoot: "C:\\WorkOS\\app\\web",
      version: "1.0.0-local.1",
      strippedPath: "C:\\Windows\\System32",
    });
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.VITEST).toBeUndefined();
    expect(env.WORKOS_CLOUD_ROOT).toBe("");
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.WORKOS_SQLITE_PATH).toBeUndefined();
    expect(env.PATH).toBe("C:\\Windows\\System32");
    expect(env.WORKOS_PRODUCT_VERSION).toBe("1.0.0-local.1");
  });

  it("reuses a live WorkOS listener and refuses a foreign port occupant", async () => {
    const workos = createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "workos-final-api" }));
        return;
      }
      if (req.url === "/api/ready") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const foreign = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "other" }));
    });
    const workosPort = await new Promise<number>((resolve, reject) => {
      workos.listen(0, LOCAL_BIND_HOST, () => {
        const address = workos.address();
        if (!address || typeof address === "string") {
          reject(new Error("bind"));
          return;
        }
        resolve(address.port);
      });
    });
    const foreignPort = await new Promise<number>((resolve, reject) => {
      foreign.listen(0, LOCAL_BIND_HOST, () => {
        const address = foreign.address();
        if (!address || typeof address === "string") {
          reject(new Error("bind"));
          return;
        }
        resolve(address.port);
      });
    });
    stoppers.push(async () => {
      await new Promise<void>((resolve) => workos.close(() => resolve()));
      await new Promise<void>((resolve) => foreign.close(() => resolve()));
    });
    await expect(inspectLocalEndpoint(workosPort)).resolves.toEqual({ kind: "workos", ready: true });
    await expect(inspectLocalEndpoint(foreignPort)).resolves.toEqual({ kind: "foreign" });
    expect(localUrl(workosPort)).toBe(`http://127.0.0.1:${workosPort}`);
  });
});

describe("local installation packaged runtime", () => {
  it("packages compiled JavaScript without tsx, Vite, or the source tree", () => {
    expect(existsSync(join(packageRoot, "app", "dist", "index.js"))).toBe(true);
    expect(existsSync(join(packageRoot, "app", "web", "index.html"))).toBe(true);
    expect(existsSync(join(packageRoot, "app", "node_modules", "@workos-final", "domain", "dist", "index.js"))).toBe(
      true,
    );
    expect(existsSync(join(packageRoot, "app", "src"))).toBe(false);
    expect(existsSync(join(packageRoot, "app", "node_modules", "tsx"))).toBe(false);
    expect(existsSync(join(packageRoot, "app", "node_modules", "vite"))).toBe(false);
    expect(readFileSync(join(packageRoot, "app", "dist", "index.js"), "utf8")).not.toContain("tsx src");
    expect(existsSync(join(packageRoot, "app", "node_modules", "tsx"))).toBe(false);
  });

  it(
    "installs, launches, persists, backs up, upgrades, and uninstalls on a synthetic root",
    async () => {
      const workspace = tempDir("workos-install-proof-");
      const installDir = join(workspace, "Programs", "WorkOS");
      const dataRoot = join(workspace, "WorkOS", "local");
      const startMenuDir = join(workspace, "StartMenu");
      const desktopPath = join(workspace, "Desktop", "WorkOS.lnk");
      const installed = await installWorkos(process.env, {
        packageRoot,
        installDir,
        dataRoot,
        startMenuDir,
        desktopPath,
      });
      expect(installed.ok).toBe(true);
      expect(installed.upgraded).toBe(false);

      const launchEnv: NodeJS.ProcessEnv = {
        ...process.env,
        WORKOS_INSTALL_DIR: installDir,
        WORKOS_LOCAL_ROOT: dataRoot,
        WORKOS_NODE_PATH: packagedNode,
        WORKOS_CLOUD_ROOT: "",
        HOST: LOCAL_BIND_HOST,
        PATH: join(process.env.WINDIR ?? "C:\\Windows", "System32"),
      };
      delete launchEnv.VITEST;
      delete launchEnv.WORKOS_SQLITE_PATH;

      let first: Awaited<ReturnType<typeof launchWorkos>> | undefined;
      let port = 0;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        port = await freePort();
        launchEnv.PORT = String(port);
        first = await launchWorkos(launchEnv, { command: "start", openBrowser: false });
        if (first.ok) {
          break;
        }
      }
      expect(first?.ok).toBe(true);
      expect(first?.reused).toBe(false);
      stoppers.push(async () => {
        await launchWorkos(launchEnv, { command: "stop", openBrowser: false });
      });

      const base = `http://127.0.0.1:${port}`;
      expect((await readJsonResponse(await fetch(`${base}/api/health`))).status).toBe("ok");
      const ready = await fetch(`${base}/api/ready`);
      expect(ready.status).toBe(200);
      expect((await readJsonResponse(ready)).status).toBe("ready");
      for (const route of PRINCIPAL_ROUTES) {
        const page = await fetch(`${base}${route}`);
        expect(page.status).toBe(200);
        expect(page.headers.get("content-type")).toContain("text/html");
      }

      const origin = `http://127.0.0.1:${port}`;
      const createCustomerResponse = await fetch(`${base}/api/customers`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ displayName: "Client instalare sintetic" }),
      });
      expect(createCustomerResponse.status).toBe(201);
      const createdCustomer = (await readJsonResponse(createCustomerResponse)) as {
        customer: { customerId: string };
      };
      expect(createdCustomer.customer.customerId).toMatch(/^cus:/);
      const createdRequest = (await readJsonResponse(
        await fetch(`${base}/api/requests`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            customerId: createdCustomer.customer.customerId,
            title: "Cerere instalare sintetica",
            description: "Proba izolata.",
          }),
        }),
      )) as { request: { requestId: string } };
      expect(createdRequest.request.requestId).toMatch(/^crq:/);
      const bytes = Buffer.from("atasament-instalare-sintetic-v1");
      const form = new FormData();
      form.append("file", new File([bytes], "proba.txt", { type: "text/plain" }));
      const uploaded = await fetch(`${base}/api/requests/${createdRequest.request.requestId}/attachments`, {
        method: "POST",
        headers: { origin },
        body: form,
      });
      expect(uploaded.status).toBe(201);
      const attachment = ((await uploaded.json()) as { attachment: { attachmentId: string } }).attachment;

      const reused = await launchWorkos(launchEnv, { command: "start", openBrowser: false });
      expect(reused.ok).toBe(true);
      expect(reused.reused).toBe(true);

      const stopped = await launchWorkos(launchEnv, { command: "stop", openBrowser: false });
      expect(stopped.ok).toBe(true);

      const backup = await launchWorkos(launchEnv, { command: "backup", openBrowser: false });
      expect(backup.ok).toBe(true);

      const second = await launchWorkos(launchEnv, { command: "start", openBrowser: false });
      expect(second.ok).toBe(true);
      const listed = (await readJsonResponse(await fetch(`${base}/api/customers`))).customers as {
        customerId: string;
      }[];
      expect(listed.some((item) => item.customerId === createdCustomer.customer.customerId)).toBe(true);
      const download = await fetch(
        `${base}/api/requests/${createdRequest.request.requestId}/attachments/${attachment.attachmentId}/download`,
      );
      expect(download.status).toBe(200);
      const downloaded = Buffer.from(await download.arrayBuffer());
      expect(createHash("sha256").update(downloaded).digest("hex")).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      await launchWorkos(launchEnv, { command: "stop", openBrowser: false });

      const upgraded = await installWorkos(process.env, {
        packageRoot,
        installDir,
        dataRoot,
        startMenuDir,
        desktopPath,
      });
      expect(upgraded.ok).toBe(true);
      expect(upgraded.upgraded).toBe(true);
      expect(existsSync(join(dataRoot, "data", "product-system.sqlite"))).toBe(true);

      const afterUpgrade = await launchWorkos(launchEnv, { command: "start", openBrowser: false });
      expect(afterUpgrade.ok).toBe(true);
      const stillListed = (await readJsonResponse(await fetch(`${base}/api/customers`))).customers as {
        customerId: string;
      }[];
      expect(stillListed.some((item) => item.customerId === createdCustomer.customer.customerId)).toBe(
        true,
      );
      await launchWorkos(launchEnv, { command: "stop", openBrowser: false });

      const removed = await uninstallWorkos(process.env, {
        installDir,
        dataRoot,
        startMenuDir,
        desktopPath,
        purgeData: false,
      });
      expect(removed.ok).toBe(true);
      expect(removed.dataPreserved).toBe(true);
      expect(existsSync(installDir)).toBe(false);
      expect(existsSync(join(dataRoot, "data", "product-system.sqlite"))).toBe(true);
    },
    180000,
  );

  it("does not overwrite an existing synthetic database during first install", async () => {
    const workspace = tempDir("workos-install-preserve-");
    const installDir = join(workspace, "Programs", "WorkOS");
    const dataRoot = join(workspace, "WorkOS", "local");
    mkdirSync(join(dataRoot, "data"), { recursive: true });
    const sqlitePath = join(dataRoot, "data", "product-system.sqlite");
    writeFileSync(sqlitePath, "synthetic-sqlite-marker");
    const installed = await installWorkos(process.env, {
      packageRoot,
      installDir,
      dataRoot,
      startMenuDir: join(workspace, "StartMenu"),
      desktopPath: join(workspace, "Desktop", "WorkOS.lnk"),
      preUpgradeBackup: false,
    });
    expect(installed.ok).toBe(true);
    expect(readFileSync(sqlitePath, "utf8")).toBe("synthetic-sqlite-marker");
  }, 180000);
});
