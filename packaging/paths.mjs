import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LOCAL_BIND_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_PORT = 8790;

export function readProductIdentity(productJsonPath) {
  const raw = JSON.parse(readFileSync(productJsonPath, "utf8"));
  if (typeof raw.version !== "string" || raw.version.length === 0) {
    throw new Error("product_version_missing");
  }
  return {
    productName: raw.productName ?? "WorkOS",
    packageId: raw.packageId ?? "workos-local",
    version: raw.version,
    defaultPort: Number(raw.defaultPort ?? DEFAULT_LOCAL_PORT),
    bindHost: raw.bindHost ?? LOCAL_BIND_HOST,
  };
}

export function defaultProductJsonPath() {
  return fileURLToPath(new URL("./product.json", import.meta.url));
}

export function installedAppDir(env = process.env) {
  if (env.WORKOS_INSTALL_DIR?.trim()) {
    return env.WORKOS_INSTALL_DIR.trim();
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return join(localAppData, "Programs", "WorkOS");
  }
  return join(homedir(), "AppData", "Local", "Programs", "WorkOS");
}

export function installedDataDir(env = process.env) {
  if (env.WORKOS_LOCAL_ROOT?.trim()) {
    return env.WORKOS_LOCAL_ROOT.trim();
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return join(localAppData, "WorkOS", "local");
  }
  return join(homedir(), "AppData", "Local", "WorkOS", "local");
}

export function startMenuShortcutDir(env = process.env) {
  const appData = env.APPDATA?.trim();
  if (appData) {
    return join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "WorkOS");
  }
  return join(homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "WorkOS");
}

export function desktopShortcutPath(env = process.env) {
  const userProfile = env.USERPROFILE?.trim() || homedir();
  return join(userProfile, "Desktop", "WorkOS.lnk");
}

export function isPackagedRoot(dir) {
  return (
    existsSync(join(dir, "launcher", "launch.mjs")) &&
    existsSync(join(dir, "app", "dist", "index.js")) &&
    existsSync(join(dir, "app", "web", "index.html"))
  );
}

export function discoverPackagedRoot(fromFilePath) {
  const parent = resolve(dirname(fromFilePath), "..");
  if (isPackagedRoot(parent)) {
    return parent;
  }
  return resolve(dirname(fromFilePath), "../..");
}
