import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import {
  defaultProductJsonPath,
  installedDataDir,
  LOCAL_BIND_HOST,
  readProductIdentity,
} from "../paths.mjs";
import {
  inspectLocalEndpoint,
  isAlive,
  localUrl,
  operatorMessage,
  readLeasePid,
  spawnDetachedRuntime,
  stopRuntime,
  waitForReady,
} from "./launch-core.mjs";

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function logLine(logPath, message) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
}

export function operatorMessageWscriptInvocation(message) {
  return {
    file: "wscript.exe",
    args: [fileURLToPath(new URL("./show-message.vbs", import.meta.url)), message],
  };
}

function showOperatorError(message) {
  if (process.platform === "win32") {
    const invocation = operatorMessageWscriptInvocation(message);
    spawn(invocation.file, invocation.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  console.error(message);
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return true;
  }
  return false;
}

function resolveLayout(env) {
  const installDir = env.WORKOS_INSTALL_DIR?.trim() || packageRoot;
  const appDir = existsSync(join(installDir, "app", "package.json"))
    ? join(installDir, "app")
    : installDir;
  const nodePath =
    env.WORKOS_NODE_PATH?.trim() ||
    join(installDir, "runtime", "node.exe");
  const entryPath = join(appDir, "dist", "index.js");
  const staticRoot = join(appDir, "web");
  const product = readProductIdentity(
    existsSync(join(appDir, "product.json"))
      ? join(appDir, "product.json")
      : defaultProductJsonPath(),
  );
  return {
    installDir,
    appDir,
    nodePath: existsSync(nodePath) ? nodePath : process.execPath,
    entryPath,
    staticRoot,
    dataRoot: installedDataDir(env),
    port: Number(env.PORT?.trim() || product.defaultPort),
    version: product.version,
  };
}

export async function launchWorkos(env = process.env, options = {}) {
  const layout = resolveLayout(env);
  const command = options.command ?? "start";
  try {
    mkdirSync(layout.dataRoot, { recursive: true });
    mkdirSync(join(layout.dataRoot, "logs"), { recursive: true });
  } catch {
    return {
      ok: false,
      code: "data_inaccessible",
      message: operatorMessage("data_inaccessible"),
      layout,
    };
  }
  const logPath = join(layout.dataRoot, "logs", "launcher.log");

  if (env.HOST?.trim() && env.HOST.trim() !== LOCAL_BIND_HOST) {
    const message = operatorMessage("invalid_host");
    logLine(logPath, `refuse host=${env.HOST}`);
    return { ok: false, code: "invalid_host", message, layout };
  }
  if (env.WORKOS_CLOUD_ROOT?.trim()) {
    const message = operatorMessage("cloud_conflict");
    logLine(logPath, "refuse cloud root");
    return { ok: false, code: "cloud_conflict", message, layout };
  }

  if (command === "stop") {
    const result = await stopRuntime(layout.dataRoot);
    logLine(logPath, result.code);
    return { ok: result.stopped || result.code === "not_running", ...result, layout };
  }

  if (command === "backup") {
    const running = await inspectLocalEndpoint(layout.port);
    if (running.kind === "workos") {
      const message = operatorMessage("backup_running");
      logLine(logPath, "backup refused while running");
      return { ok: false, code: "backup_running", message, layout };
    }
    const backupCli = join(layout.appDir, "dist", "local", "backupCli.js");
    if (!existsSync(backupCli)) {
      return { ok: false, code: "backup_failed", message: operatorMessage("backup_failed"), layout };
    }
    const result = spawnSync(layout.nodePath, [backupCli], {
      cwd: layout.appDir,
      env: {
        ...env,
        HOST: LOCAL_BIND_HOST,
        WORKOS_LOCAL_ROOT: layout.dataRoot,
        WORKOS_CLOUD_ROOT: "",
        WORKOS_PRODUCT_VERSION: layout.version,
      },
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      logLine(logPath, `backup failed ${result.status ?? "spawn"}`);
      return { ok: false, code: "backup_failed", message: operatorMessage("backup_failed"), layout };
    }
    logLine(logPath, "backup ok");
    return { ok: true, code: "backup_ok", layout, output: result.stdout };
  }

  if (command === "status") {
    const endpoint = await inspectLocalEndpoint(layout.port);
    const leasePid = readLeasePid(layout.dataRoot);
    return {
      ok: endpoint.kind === "workos",
      code: endpoint.kind,
      ready: endpoint.kind === "workos" ? endpoint.ready : false,
      leasePid,
      layout,
    };
  }

  const endpoint = await inspectLocalEndpoint(layout.port);
  if (endpoint.kind === "foreign") {
    const message = operatorMessage("port_busy");
    logLine(logPath, "port foreign");
    return { ok: false, code: "port_busy", message, layout };
  }

  const leasePid = readLeasePid(layout.dataRoot);
  const ourRuntimeAlive = Boolean(leasePid && isAlive(leasePid));

  if (endpoint.kind === "workos") {
    if (!ourRuntimeAlive) {
      const message = operatorMessage("port_busy");
      logLine(logPath, "port has another WorkOS instance");
      return { ok: false, code: "port_busy", message, layout };
    }
    const opened = options.openBrowser === false ? true : openBrowser(localUrl(layout.port));
    if (!opened) {
      const message = operatorMessage("browser_cannot_open");
      logLine(logPath, "browser failed");
      return { ok: true, reused: true, code: "browser_cannot_open", message, layout };
    }
    logLine(logPath, "reused running runtime");
    return {
      ok: true,
      reused: true,
      code: "already_running",
      message: operatorMessage("already_running"),
      layout,
    };
  }

  if (ourRuntimeAlive) {
    const ready = await waitForReady(layout.port);
    if (ready && readLeasePid(layout.dataRoot) === leasePid) {
      if (options.openBrowser !== false) {
        openBrowser(localUrl(layout.port));
      }
      return { ok: true, reused: true, code: "already_running", layout };
    }
    const message = operatorMessage("runtime_not_ready");
    logLine(logPath, "lease alive but not ready");
    return { ok: false, code: "runtime_not_ready", message, layout };
  }

  if (!existsSync(layout.entryPath) || !existsSync(join(layout.staticRoot, "index.html"))) {
    const message = operatorMessage("generic_failure");
    logLine(logPath, "missing packaged artifacts");
    return { ok: false, code: "generic_failure", message, layout };
  }

  let childPid = 0;
  try {
    const child = spawnDetachedRuntime({
      nodePath: layout.nodePath,
      entryPath: layout.entryPath,
      cwd: layout.appDir,
      dataRoot: layout.dataRoot,
      staticRoot: layout.staticRoot,
      port: layout.port,
      version: layout.version,
      env,
      logPath: join(layout.dataRoot, "logs", "runtime.log"),
    });
    childPid = typeof child.pid === "number" ? child.pid : 0;
  } catch (error) {
    logLine(logPath, `spawn failed ${error instanceof Error ? error.message : "unknown"}`);
    return { ok: false, code: "generic_failure", message: operatorMessage("generic_failure"), layout };
  }

  const ready = await waitForReady(layout.port);
  const startedLease = readLeasePid(layout.dataRoot);
  const sqliteReady = existsSync(join(layout.dataRoot, "data", "product-system.sqlite"));
  if (!ready || !sqliteReady || (childPid && startedLease !== childPid)) {
    await stopRuntime(layout.dataRoot);
    const message = operatorMessage("runtime_not_ready");
    logLine(
      logPath,
      `startup not ready ready=${ready} sqlite=${sqliteReady} child=${childPid} lease=${startedLease ?? 0}`,
    );
    return { ok: false, code: "runtime_not_ready", message, layout };
  }
  if (options.openBrowser !== false && !openBrowser(localUrl(layout.port))) {
    return {
      ok: true,
      reused: false,
      code: "browser_cannot_open",
      message: operatorMessage("browser_cannot_open"),
      layout,
    };
  }
  logLine(logPath, "started");
  return { ok: true, reused: false, code: "started", message: operatorMessage("started"), layout };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const command =
    process.argv[2] === "stop" || process.argv[2] === "status" || process.argv[2] === "backup"
      ? process.argv[2]
      : "start";
  const result = await launchWorkos(process.env, {
    command,
    openBrowser: process.env.WORKOS_OPEN_BROWSER !== "0",
  });
  if (!result.ok) {
    showOperatorError(result.message ?? operatorMessage("generic_failure"));
    process.exit(1);
  }
}
