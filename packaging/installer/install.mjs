import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  defaultProductJsonPath,
  desktopShortcutPath,
  installedAppDir,
  installedDataDir,
  readProductIdentity,
  startMenuShortcutDir,
} from "../paths.mjs";
import { launchWorkos } from "../launcher/launch.mjs";
import { operatorMessage } from "../launcher/messages.mjs";

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function writeLog(dataRoot, message) {
  const logPath = join(dataRoot, "logs", "installer.log");
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${new Date().toISOString()} ${message}\n`, { flag: "a" });
}

function createShortcut(shortcutPath, target, args, workingDir, description) {
  if (process.platform !== "win32") {
    return false;
  }
  mkdirSync(dirname(shortcutPath), { recursive: true });
  const vbs = fileURLToPath(new URL("./create-shortcut.vbs", import.meta.url));
  const result = spawnSync(
    "wscript.exe",
    ["//nologo", vbs, shortcutPath, target, args, workingDir, description],
    { windowsHide: true, encoding: "utf8" },
  );
  return result.status === 0;
}

function shortcutTarget() {
  return join(process.env.WINDIR || "C:\\Windows", "System32", "wscript.exe");
}

export async function installWorkos(env = process.env, options = {}) {
  const sourceRoot = options.packageRoot ?? packageRoot;
  const product = readProductIdentity(
    existsSync(join(sourceRoot, "product.json"))
      ? join(sourceRoot, "product.json")
      : defaultProductJsonPath(),
  );
  const installDir = options.installDir ?? installedAppDir(env);
  const dataRoot = options.dataRoot ?? installedDataDir({
    ...env,
    WORKOS_LOCAL_ROOT: options.dataRoot || env.WORKOS_LOCAL_ROOT,
  });
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(join(dataRoot, "logs"), { recursive: true });

  const existing = existsSync(join(installDir, "app", "dist", "index.js"));
  if (existing) {
    const stop = await launchWorkos(
      { ...env, WORKOS_INSTALL_DIR: installDir, WORKOS_LOCAL_ROOT: dataRoot },
      { command: "stop", openBrowser: false },
    );
    writeLog(dataRoot, `pre-upgrade stop ${stop.code}`);
    if (existsSync(join(dataRoot, "data", "product-system.sqlite")) && options.preUpgradeBackup !== false) {
      const backup = await launchWorkos(
        { ...env, WORKOS_INSTALL_DIR: installDir, WORKOS_LOCAL_ROOT: dataRoot },
        { command: "backup", openBrowser: false },
      );
      writeLog(dataRoot, `pre-upgrade backup ${backup.code}`);
      if (!backup.ok) {
        return {
          ok: false,
          code: "backup_failed",
          message: operatorMessage("backup_failed"),
          installDir,
          dataRoot,
        };
      }
    }
  }

  mkdirSync(installDir, { recursive: true });
  for (const name of ["app", "runtime", "launcher", "installer", "packaging"]) {
    const from = join(sourceRoot, name);
    if (!existsSync(from)) {
      continue;
    }
    const to = join(installDir, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true, dereference: true, force: true });
  }
  for (const name of [
    "product.json",
    "paths.mjs",
    "Install WorkOS.cmd",
    "Start WorkOS.cmd",
    "Uninstall WorkOS.cmd",
  ]) {
    const from = join(sourceRoot, name);
    if (existsSync(from)) {
      cpSync(from, join(installDir, name), { force: true });
    }
  }

  writeFileSync(
    join(installDir, "install-manifest.json"),
    `${JSON.stringify(
      {
        productName: product.productName,
        version: product.version,
        installScope: "per-user",
        installedAt: new Date().toISOString(),
        dataRoot,
      },
      null,
      2,
    )}\n`,
  );

  const menuDir = options.startMenuDir ?? startMenuShortcutDir(env);
  const hiddenVbs = join(installDir, "launcher", "hidden.vbs");
  const wscript = shortcutTarget();
  const startCreated = createShortcut(
    join(menuDir, "WorkOS.lnk"),
    wscript,
    `//nologo "${hiddenVbs}" "${installDir}" start`,
    installDir,
    "Pornește WorkOS",
  );
  createShortcut(
    join(menuDir, "Oprește WorkOS.lnk"),
    wscript,
    `//nologo "${hiddenVbs}" "${installDir}" stop`,
    installDir,
    "Oprește WorkOS",
  );
  let desktopCreated = false;
  if (options.desktopShortcut !== false) {
    desktopCreated = createShortcut(
      options.desktopPath ?? desktopShortcutPath(env),
      wscript,
      `//nologo "${hiddenVbs}" "${installDir}" start`,
      installDir,
      "Pornește WorkOS",
    );
  }

  writeLog(dataRoot, existing ? `upgraded ${product.version}` : `installed ${product.version}`);
  return {
    ok: true,
    upgraded: existing,
    installDir,
    dataRoot,
    version: product.version,
    startMenuShortcut: startCreated,
    desktopShortcut: desktopCreated,
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = await installWorkos(process.env);
  if (!result.ok) {
    console.error(result.message ?? "install_failed");
    process.exit(1);
  }
}
