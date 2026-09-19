import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  desktopShortcutPath,
  installedAppDir,
  installedDataDir,
  startMenuShortcutDir,
} from "../paths.mjs";
import { launchWorkos } from "../launcher/launch.mjs";

function writeLog(dataRoot, message) {
  try {
    mkdirSync(join(dataRoot, "logs"), { recursive: true });
    writeFileSync(join(dataRoot, "logs", "installer.log"), `${new Date().toISOString()} ${message}\n`, {
      flag: "a",
    });
  } catch {
    // Uninstall must still proceed if logs cannot be written.
  }
}

export async function uninstallWorkos(env = process.env, options = {}) {
  const installDir = options.installDir ?? installedAppDir(env);
  const dataRoot = options.dataRoot ?? installedDataDir(env);
  const purgeData = options.purgeData === true || process.argv.includes("--purge-data");

  await launchWorkos(
    { ...env, WORKOS_INSTALL_DIR: installDir, WORKOS_LOCAL_ROOT: dataRoot },
    { command: "stop", openBrowser: false },
  );

  const menuDir = options.startMenuDir ?? startMenuShortcutDir(env);
  for (const path of [
    join(menuDir, "WorkOS.lnk"),
    join(menuDir, "Oprește WorkOS.lnk"),
    options.desktopPath ?? desktopShortcutPath(env),
  ]) {
    rmSync(path, { force: true });
  }
  rmSync(menuDir, { recursive: true, force: true });

  if (existsSync(installDir)) {
    rmSync(installDir, { recursive: true, force: true });
  }

  let dataPreserved = existsSync(dataRoot);
  if (purgeData && dataPreserved) {
    rmSync(dataRoot, { recursive: true, force: true });
    dataPreserved = false;
  } else {
    writeLog(dataRoot, "uninstalled application; data preserved");
  }

  return {
    ok: true,
    installDir,
    dataRoot,
    dataPreserved,
    purgedData: purgeData && !dataPreserved,
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = await uninstallWorkos(process.env);
  if (!result.ok) {
    process.exit(1);
  }
}
