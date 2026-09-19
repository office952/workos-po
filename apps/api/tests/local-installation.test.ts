import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertCanonicalFrontend, buildLocalPackage } from "../../../packaging/build-package.mjs";
import { installWorkos } from "../../../packaging/installer/install.mjs";
import { uninstallWorkos } from "../../../packaging/installer/uninstall.mjs";
import {
  createShortcut,
  inspectShortcut,
  runUserFacingHiddenLaunch,
  userShortcutArguments,
  windowsSystem32,
} from "../../../packaging/installer/shortcuts.mjs";
import {
  buildRuntimeEnv,
  inspectLocalEndpoint,
  isAlive,
  localUrl,
  readLeasePid,
  waitForReady,
} from "../../../packaging/launcher/launch-core.mjs";
import { launchWorkos, operatorMessageWscriptInvocation, resolveLayout } from "../../../packaging/launcher/launch.mjs";
import { operatorMessage } from "../../../packaging/launcher/messages.mjs";
import {
  desktopShortcutPath,
  discoverPackagedRoot,
  installedAppDir,
  installedDataDir,
  LOCAL_BIND_HOST,
  readProductIdentity,
  startMenuShortcutDir,
} from "../../../packaging/paths.mjs";

const ownerLocalAppData = process.env.LOCALAPPDATA ?? "";

const temps: string[] = [];
const stoppers: Array<() => Promise<void>> = [];
const proofRoot = mkdtempSync(join(tmpdir(), "workos-install-shared-"));
let packageRoot = "";

afterEach(async () => {
  while (stoppers.length > 0) {
    const stop = stoppers.pop();
    if (stop) {
      await stop();
    }
  }
  for (const dir of temps.splice(0)) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
}, 60000);

afterAll(async () => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      rmSync(proofRoot, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}, 30000);

beforeAll(() => {
  packageRoot = join(proofRoot, "package");
  buildLocalPackage({ destRoot: packageRoot });
}, 180000);

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function realisticUserEnv(profileRoot: string): {
  env: NodeJS.ProcessEnv;
  localAppData: string;
  appData: string;
  userProfile: string;
  installDir: string;
  dataRoot: string;
  startMenuDir: string;
  desktopPath: string;
} {
  const userProfile = profileRoot;
  const localAppData = join(profileRoot, "AppData", "Local");
  const appData = join(profileRoot, "AppData", "Roaming");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LOCALAPPDATA: localAppData,
    APPDATA: appData,
    USERPROFILE: userProfile,
    HOST: LOCAL_BIND_HOST,
    WORKOS_OPEN_BROWSER: "0",
    WORKOS_CLOUD_ROOT: "",
    PATH: join(process.env.WINDIR ?? "C:\\Windows", "System32"),
  };
  delete env.WORKOS_INSTALL_DIR;
  delete env.WORKOS_LOCAL_ROOT;
  delete env.VITEST;
  delete env.WORKOS_SQLITE_PATH;
  delete env.NODE_OPTIONS;
  delete env.WORKOS_PUBLIC_ORIGIN;
  delete env.WORKOS_TRUSTED_ORIGINS;
  return {
    env,
    localAppData,
    appData,
    userProfile,
    installDir: installedAppDir(env),
    dataRoot: installedDataDir(env),
    startMenuDir: startMenuShortcutDir(env),
    desktopPath: desktopShortcutPath(env),
  };
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

async function runThroughInstalledEntrypoint(
  hiddenVbs: string,
  installDir: string,
  command: "start" | "stop" | "backup",
  env: NodeJS.ProcessEnv,
): Promise<number | null> {
  const child = runUserFacingHiddenLaunch(hiddenVbs, installDir, command, env, { wait: true });
  return await new Promise((resolve) => {
    child.on("exit", (code) => resolve(typeof code === "number" ? code : null));
  });
}

async function waitUntilLeaseGone(dataRoot: string, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pid = readLeasePid(dataRoot);
    if (!pid || !isAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const pid = readLeasePid(dataRoot);
  return !pid || !isAlive(pid);
}

function runInstalledUninstall(uninstallCmd: string, env: NodeJS.ProcessEnv): number | null {
  const result = spawnSync(uninstallCmd, [], {
    cwd: tmpdir(),
    env,
    encoding: "utf8",
    windowsHide: true,
    shell: true,
  });
  return result.status;
}

async function waitUntilPathGone(path: string, timeoutMs = 30000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!existsSync(path)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !existsSync(path);
}

async function waitUntilGone(port: number, timeoutMs = 15000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await inspectLocalEndpoint(port);
    if (state.kind === "empty") {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
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

  it("keeps //nologo off the user-facing WorkOS shortcut and operator-message chain", () => {
    const hiddenVbs = "C:\\Users\\Demo\\AppData\\Local\\Programs\\WorkOS\\launcher\\hidden.vbs";
    const installDir = "C:\\Users\\Demo\\AppData\\Local\\Programs\\WorkOS";
    const startArgs = userShortcutArguments(hiddenVbs, installDir, "start");
    const stopArgs = userShortcutArguments(hiddenVbs, installDir, "stop");
    expect(startArgs).toBe(`"${hiddenVbs}" "${installDir}" start`);
    expect(stopArgs).toBe(`"${hiddenVbs}" "${installDir}" stop`);
    expect(startArgs).not.toMatch(/nologo/i);
    expect(stopArgs).not.toMatch(/nologo/i);
    const operator = operatorMessageWscriptInvocation("WorkOS nu a putut porni.");
    expect(operator.file).toBe("wscript.exe");
    expect(operator.args).not.toContain("//nologo");
    expect(operator.args[0]).toMatch(/show-message\.vbs$/i);
    const startCmd = readFileSync(
      join(process.cwd(), "..", "..", "packaging", "installer", "Start-WorkOS.cmd"),
      "utf8",
    );
    expect(startCmd).toContain("wscript.exe");
    expect(startCmd).not.toMatch(/nologo/i);
    const createHelper = readFileSync(
      join(process.cwd(), "..", "..", "packaging", "installer", "shortcuts.mjs"),
      "utf8",
    );
    expect(createHelper).toContain("cscript.exe");
    expect(createHelper).toContain("//nologo");
  });

  it("writes a user shortcut whose inspected arguments omit //nologo, including spaces", () => {
    const workspace = tempDir("workos-shortcut-space-");
    const installDir = join(workspace, "Local Programs", "WorkOS App");
    const hiddenVbs = join(installDir, "launcher", "hidden.vbs");
    const shortcutPath = join(workspace, "Start Menu", "WorkOS.lnk");
    mkdirSync(join(installDir, "launcher"), { recursive: true });
    const created = createShortcut(
      shortcutPath,
      windowsSystem32("wscript.exe"),
      userShortcutArguments(hiddenVbs, installDir, "start"),
      installDir,
      "Pornește WorkOS",
    );
    expect(created).toBe(true);
    const inspected = inspectShortcut(shortcutPath);
    expect(inspected).not.toBeNull();
    expect(inspected?.TargetPath.toLowerCase().endsWith("wscript.exe")).toBe(true);
    expect(inspected?.Arguments).toBe(userShortcutArguments(hiddenVbs, installDir, "start"));
    expect(inspected?.Arguments).not.toMatch(/nologo/i);
    expect(inspected?.WorkingDirectory).toBe(installDir);
    expect(inspected?.WindowStyle).toBe(7);
  });

  it("writes a user shortcut through a non-ASCII path without //nologo", () => {
    const workspace = tempDir("workos-shortcut-diacritic-");
    const installDir = join(workspace, "WorkOS Test Ș", "Programs", "WorkOS");
    const hiddenVbs = join(installDir, "launcher", "hidden.vbs");
    const shortcutPath = join(workspace, "Start Menu", "WorkOS.lnk");
    mkdirSync(join(installDir, "launcher"), { recursive: true });
    const created = createShortcut(
      shortcutPath,
      windowsSystem32("wscript.exe"),
      userShortcutArguments(hiddenVbs, installDir, "start"),
      installDir,
      "Pornește WorkOS",
    );
    expect(created).toBe(true);
    const inspected = inspectShortcut(shortcutPath);
    expect(inspected?.Arguments).toBe(userShortcutArguments(hiddenVbs, installDir, "start"));
    expect(inspected?.Arguments).not.toMatch(/nologo/i);
    expect(inspected?.WorkingDirectory).toBe(installDir);
  });

  it("refuses a placeholder frontend as the production package default", () => {
    const workspace = tempDir("workos-placeholder-frontend-");
    const fakeWeb = join(workspace, "fake-web");
    mkdirSync(fakeWeb, { recursive: true });
    const fakeIndex = join(fakeWeb, "index.html");
    writeFileSync(
      fakeIndex,
      "<!doctype html><html><head><title>WorkOS</title></head><body>Se încarcă WorkOS.</body></html>\n",
    );
    expect(() => assertCanonicalFrontend(fakeIndex)).toThrow(/placeholder_frontend_forbidden/);
    expect(() =>
      buildLocalPackage({
        destRoot: join(workspace, "package"),
        frontendRoot: fakeWeb,
        skipFrontendBuild: true,
      }),
    ).toThrow(/placeholder_frontend_forbidden/);
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
    expect(existsSync(join(packageRoot, "app", "node_modules", "pdf-lib"))).toBe(true);
    expect(existsSync(join(packageRoot, "app", "node_modules", "tslib"))).toBe(true);
    expect(existsSync(join(packageRoot, "app", "node_modules", "better-sqlite3"))).toBe(true);
    const apiDependencies = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ).dependencies as Record<string, string>;
    expect(apiDependencies.tslib).toBeUndefined();
    expect(readFileSync(join(packageRoot, "app", "dist", "index.js"), "utf8")).not.toContain("tsx src");
    expect(existsSync(join(packageRoot, "app", "node_modules", "tsx"))).toBe(false);
  });

  it("discovers install and data paths without WORKOS_INSTALL_DIR or WORKOS_LOCAL_ROOT", () => {
    const launcherPath = join(packageRoot, "launcher", "launch.mjs");
    const naiveParent = resolve(packageRoot, "..");
    expect(resolve(join(packageRoot, "launcher"), "..", "..")).toBe(naiveParent);
    expect(discoverPackagedRoot(launcherPath)).toBe(resolve(packageRoot));
    const layout = resolveLayout(
      { LOCALAPPDATA: "C:\\Users\\Demo\\AppData\\Local" },
      { launcherPath },
    );
    expect(layout.installDir).toBe(resolve(packageRoot));
    expect(layout.appDir).toBe(join(packageRoot, "app"));
    expect(layout.nodePath.toLowerCase()).toBe(join(packageRoot, "runtime", "node.exe").toLowerCase());
    expect(layout.entryPath).toBe(join(packageRoot, "app", "dist", "index.js"));
    expect(layout.staticRoot).toBe(join(packageRoot, "app", "web"));
    expect(layout.dataRoot).toBe("C:\\Users\\Demo\\AppData\\Local\\WorkOS\\local");
  });

  it("packages the canonical frontend, not a placeholder page", () => {
    const indexPath = join(packageRoot, "app", "web", "index.html");
    assertCanonicalFrontend(indexPath);
    const html = readFileSync(indexPath, "utf8");
    expect(html).toContain("<script");
    expect(html).toContain("/assets/");
    const assetsDir = join(packageRoot, "app", "web", "assets");
    expect(existsSync(assetsDir)).toBe(true);
    const assets = readdirSync(assetsDir);
    expect(assets.some((name) => name.endsWith(".js"))).toBe(true);
    expect(assets.some((name) => name.endsWith(".css"))).toBe(true);
  });

  it(
    "installs, launches through the installed shortcut chain, persists, backs up, upgrades, and uninstalls",
    async () => {
      const workspace = tempDir("workos-install-proof-");
      const profile = join(workspace, "WorkOS Test Ș");
      const user = realisticUserEnv(profile);
      expect(user.installDir).toBe(join(user.localAppData, "Programs", "WorkOS"));
      expect(user.dataRoot).toBe(join(user.localAppData, "WorkOS", "local"));
      expect(user.startMenuDir).toBe(
        join(user.appData, "Microsoft", "Windows", "Start Menu", "Programs", "WorkOS"),
      );
      expect(user.env.WORKOS_INSTALL_DIR).toBeUndefined();
      expect(user.env.WORKOS_LOCAL_ROOT).toBeUndefined();
      if (ownerLocalAppData) {
        expect(resolve(user.installDir).toLowerCase()).not.toBe(
          resolve(join(ownerLocalAppData, "Programs", "WorkOS")).toLowerCase(),
        );
        expect(resolve(user.dataRoot).toLowerCase()).not.toBe(
          resolve(join(ownerLocalAppData, "WorkOS", "local")).toLowerCase(),
        );
      }

      const installed = await installWorkos(user.env, { packageRoot });
      expect(installed.ok).toBe(true);
      expect(installed.upgraded).toBe(false);
      expect(installed.installDir).toBe(user.installDir);
      expect(installed.dataRoot).toBe(user.dataRoot);

      const hiddenVbs = join(user.installDir, "launcher", "hidden.vbs");
      const startShortcut = inspectShortcut(join(user.startMenuDir, "WorkOS.lnk"));
      const stopShortcut = inspectShortcut(join(user.startMenuDir, "Opreste WorkOS.lnk"));
      const desktopShortcut = inspectShortcut(user.desktopPath);
      expect(startShortcut?.TargetPath.toLowerCase().endsWith("wscript.exe")).toBe(true);
      expect(startShortcut?.Arguments).toBe(userShortcutArguments(hiddenVbs, user.installDir, "start"));
      expect(startShortcut?.Arguments).not.toMatch(/nologo/i);
      expect(startShortcut?.WorkingDirectory).toBe(user.installDir);
      expect(startShortcut?.WindowStyle).toBe(7);
      expect(stopShortcut?.TargetPath.toLowerCase().endsWith("wscript.exe")).toBe(true);
      expect(stopShortcut?.Arguments).toBe(userShortcutArguments(hiddenVbs, user.installDir, "stop"));
      expect(stopShortcut?.Arguments).not.toMatch(/nologo/i);
      expect(desktopShortcut?.Arguments).not.toMatch(/nologo/i);

      const launchEnv = { ...user.env };
      let port = 0;
      let started = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        port = await freePort();
        launchEnv.PORT = String(port);
        const startCode = await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "start", launchEnv);
        started = startCode === 0 && (await waitForReady(port, 5000));
        if (started) {
          break;
        }
        await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "stop", launchEnv);
      }
      expect(started).toBe(true);
      stoppers.push(async () => {
        if (existsSync(hiddenVbs)) {
          await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "stop", launchEnv);
        } else {
          await launchWorkos(launchEnv, { command: "stop", openBrowser: false });
        }
        await waitUntilGone(port);
        await waitUntilLeaseGone(user.dataRoot);
      });

      const sqlitePath = join(user.dataRoot, "data", "product-system.sqlite");
      const documentsRoot = join(user.dataRoot, "data", "documents");
      expect(existsSync(sqlitePath)).toBe(true);
      expect(existsSync(join(user.dataRoot, "logs"))).toBe(true);
      expect(existsSync(join(user.dataRoot, "ops", "runtime-lease.json"))).toBe(true);
      expect(existsSync(join(user.installDir, "data", "product-system.sqlite"))).toBe(false);
      expect(resolve(sqlitePath).toLowerCase().startsWith(resolve(user.dataRoot).toLowerCase())).toBe(true);

      const discovered = resolveLayout(launchEnv, {
        launcherPath: join(user.installDir, "launcher", "launch.mjs"),
      });
      expect(discovered.installDir).toBe(user.installDir);
      expect(discovered.appDir).toBe(join(user.installDir, "app"));
      expect(discovered.staticRoot).toBe(join(user.installDir, "app", "web"));
      expect(discovered.entryPath).toBe(join(user.installDir, "app", "dist", "index.js"));
      expect(discovered.dataRoot).toBe(user.dataRoot);

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
      expect(existsSync(documentsRoot)).toBe(true);

      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "start", launchEnv)).toBe(0);
      expect(await waitForReady(port)).toBe(true);

      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "stop", launchEnv)).toBe(0);
      expect(await waitUntilGone(port)).toBe(true);
      expect(await waitUntilLeaseGone(user.dataRoot)).toBe(true);

      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "backup", launchEnv)).toBe(0);

      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "start", launchEnv)).toBe(0);
      expect(await waitForReady(port)).toBe(true);
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
      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "stop", launchEnv)).toBe(0);
      expect(await waitUntilGone(port)).toBe(true);
      expect(await waitUntilLeaseGone(user.dataRoot)).toBe(true);

      const upgraded = await installWorkos(user.env, { packageRoot });
      expect(upgraded.ok).toBe(true);
      expect(upgraded.upgraded).toBe(true);
      expect(existsSync(sqlitePath)).toBe(true);

      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "start", launchEnv)).toBe(0);
      expect(await waitForReady(port)).toBe(true);
      const stillListed = (await readJsonResponse(await fetch(`${base}/api/customers`))).customers as {
        customerId: string;
      }[];
      expect(stillListed.some((item) => item.customerId === createdCustomer.customer.customerId)).toBe(
        true,
      );
      expect(await runThroughInstalledEntrypoint(hiddenVbs, user.installDir, "stop", launchEnv)).toBe(0);
      expect(await waitUntilGone(port)).toBe(true);
      expect(await waitUntilLeaseGone(user.dataRoot)).toBe(true);

      const removed = await uninstallWorkos(user.env, { purgeData: false });
      expect(removed.ok).toBe(true);
      expect(removed.dataPreserved).toBe(true);
      expect(existsSync(user.installDir)).toBe(false);
      expect(existsSync(sqlitePath)).toBe(true);
    },
    240000,
  );

  it(
    "runs the actual installed Uninstall WorkOS.cmd outside installDir and preserves Local data",
    async () => {
      if (process.platform !== "win32") {
        return;
      }

      const workspace = tempDir("workos-uninstall-entrypoint-");
      const profile = join(workspace, "WorkOS Uninstall Test Ș");
      const user = realisticUserEnv(profile);

      const installed = await installWorkos(user.env, { packageRoot });
      expect(installed.ok).toBe(true);

      const sqlitePath = join(user.dataRoot, "data", "product-system.sqlite");
      const documentsRoot = join(user.dataRoot, "data", "documents");
      const proofDocument = join(documentsRoot, "uninstall-proof.txt");
      mkdirSync(documentsRoot, { recursive: true });
      if (!existsSync(sqlitePath)) {
        writeFileSync(sqlitePath, "synthetic-sqlite-uninstall-proof");
      }
      writeFileSync(proofDocument, "synthetic-document-uninstall-proof");

      const uninstallCmd = join(user.installDir, "Uninstall WorkOS.cmd");
      expect(existsSync(uninstallCmd)).toBe(true);
      expect(existsSync(join(user.installDir, "runtime", "node.exe"))).toBe(true);
      expect(existsSync(join(user.installDir, "installer", "uninstall-external.mjs"))).toBe(true);

      expect(runInstalledUninstall(uninstallCmd, user.env)).toBe(0);
      expect(await waitUntilPathGone(user.installDir, 45000)).toBe(true);

      expect(existsSync(user.installDir)).toBe(false);
      expect(existsSync(user.startMenuDir)).toBe(false);
      expect(existsSync(user.desktopPath)).toBe(false);
      expect(existsSync(user.dataRoot)).toBe(true);
      expect(existsSync(sqlitePath)).toBe(true);
      expect(existsSync(proofDocument)).toBe(true);
      expect(readFileSync(proofDocument, "utf8")).toBe("synthetic-document-uninstall-proof");
    },
    90000,
  );

  it("does not overwrite an existing synthetic database during first install", async () => {
    const workspace = tempDir("workos-install-preserve-");
    const user = realisticUserEnv(join(workspace, "WorkOS Test Ș"));
    mkdirSync(join(user.dataRoot, "data"), { recursive: true });
    const sqlitePath = join(user.dataRoot, "data", "product-system.sqlite");
    writeFileSync(sqlitePath, "synthetic-sqlite-marker");
    const installed = await installWorkos(user.env, {
      packageRoot,
      preUpgradeBackup: false,
    });
    expect(installed.ok).toBe(true);
    expect(installed.dataRoot).toBe(user.dataRoot);
    expect(readFileSync(sqlitePath, "utf8")).toBe("synthetic-sqlite-marker");
  }, 180000);
});
