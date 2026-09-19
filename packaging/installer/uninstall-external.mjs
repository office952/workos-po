import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

function windowsSystem32(name) {
  return join(process.env.WINDIR?.trim() || "C:\\Windows", "System32", name);
}

function installedDataDir(env = process.env) {
  if (env.WORKOS_LOCAL_ROOT?.trim()) {
    return resolve(env.WORKOS_LOCAL_ROOT.trim());
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return resolve(localAppData, "WorkOS", "local");
  }
  return resolve(homedir(), "AppData", "Local", "WorkOS", "local");
}

function startMenuShortcutDir(env = process.env) {
  const appData = env.APPDATA?.trim();
  if (appData) {
    return resolve(appData, "Microsoft", "Windows", "Start Menu", "Programs", "WorkOS");
  }
  return resolve(
    homedir(),
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "WorkOS",
  );
}

function desktopShortcutPath(env = process.env) {
  const userProfile = env.USERPROFILE?.trim() || homedir();
  return resolve(userProfile, "Desktop", "WorkOS.lnk");
}

function pathInside(child, parent) {
  const relation = relative(resolve(parent), resolve(child));
  return relation === "" || (!relation.startsWith("..") && !relation.startsWith(`..${sep}`) && !resolve(relation).startsWith(sep));
}

function readLeasePid(dataRoot) {
  const leasePath = join(dataRoot, "ops", "runtime-lease.json");
  if (!existsSync(leasePath)) {
    return null;
  }
  try {
    const lease = JSON.parse(readFileSync(leasePath, "utf8"));
    return Number.isInteger(lease.pid) && lease.pid > 0 ? lease.pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    return code === "EPERM";
  }
}

async function stopRuntime(dataRoot) {
  const pid = readLeasePid(dataRoot);
  if (!pid || !isAlive(pid)) {
    return;
  }
  try {
    process.kill(pid);
  } catch {
    // It may have exited between the liveness check and kill.
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && isAlive(pid)) {
    await sleep(100);
  }
  if (isAlive(pid)) {
    throw new Error("runtime_stop_timeout");
  }
}

function listProcessesUsingExecutable(executablePath) {
  if (process.platform !== "win32" || !existsSync(executablePath)) {
    return [];
  }
  const helper = fileURLToPath(new URL("./list-executable-pids.vbs", import.meta.url));
  const result = spawnSync(
    windowsSystem32("cscript.exe"),
    ["//nologo", helper, resolve(executablePath)],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    return [];
  }
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function stopPackagedRuntimeProcesses(installDir) {
  const executablePath = join(installDir, "runtime", "node.exe");
  const pids = listProcessesUsingExecutable(executablePath);
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // Process may already be gone.
    }
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && pids.some((pid) => isAlive(pid))) {
    await sleep(100);
  }
  if (pids.some((pid) => isAlive(pid))) {
    throw new Error("packaged_runtime_stop_timeout");
  }
}

async function removeDirectory(dir) {
  if (!existsSync(dir)) {
    return;
  }
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
      if (!existsSync(dir)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error("remove_directory_failed");
}

function writeLog(dataRoot, message) {
  try {
    mkdirSync(join(dataRoot, "logs"), { recursive: true });
    appendFileSync(
      join(dataRoot, "logs", "installer.log"),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    // Uninstall should not fail because logging failed.
  }
}

function showOperatorError(message) {
  if (process.platform !== "win32") {
    console.error(message);
    return;
  }
  const helper = fileURLToPath(new URL("./show-message.vbs", import.meta.url));
  try {
    spawn(windowsSystem32("wscript.exe"), [helper, message], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {
    // Logging remains the fallback.
  }
}

function scheduleTempCleanup(tempDir) {
  if (process.platform !== "win32" || !tempDir || !existsSync(tempDir)) {
    return;
  }
  const command = `ping 127.0.0.1 -n 3 >nul & rmdir /s /q "${tempDir}"`;
  try {
    spawn(windowsSystem32("cmd.exe"), ["/d", "/s", "/c", command], {
      cwd: tmpdir(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {
    // A temporary uninstall folder is preferable to a failed product uninstall.
  }
}

const installArg = argValue("--install-dir");
const tempArg = argValue("--temp-dir");
if (!installArg) {
  throw new Error("install_dir_required");
}

const installDir = resolve(installArg);
const tempDir = tempArg ? resolve(tempArg) : dirname(fileURLToPath(import.meta.url));
const dataRoot = installedDataDir(process.env);
const menuDir = startMenuShortcutDir(process.env);
const desktopPath = desktopShortcutPath(process.env);
const purgeData = process.argv.includes("--purge-data");

let exitCode = 0;
try {
  if (
    !existsSync(join(installDir, "runtime", "node.exe")) ||
    !existsSync(join(installDir, "product.json"))
  ) {
    throw new Error("install_directory_not_workos");
  }
  if (pathInside(dataRoot, installDir)) {
    throw new Error("data_root_inside_install_directory");
  }

  // The installed bootstrap and its cmd file must have time to exit and release
  // their handles before this external Node process removes installDir.
  await sleep(750);

  await stopRuntime(dataRoot);
  await stopPackagedRuntimeProcesses(installDir);
  await removeDirectory(installDir);

  rmSync(menuDir, { recursive: true, force: true });
  rmSync(desktopPath, { force: true });

  if (purgeData && existsSync(dataRoot)) {
    rmSync(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  } else {
    writeLog(dataRoot, "uninstalled application; data preserved");
  }
} catch (error) {
  exitCode = 1;
  const detail = error instanceof Error ? error.message : "unknown";
  writeLog(dataRoot, `uninstall failed: ${detail}`);
  showOperatorError("WorkOS nu a putut fi dezinstalat complet. Datele au fost pastrate.");
} finally {
  scheduleTempCleanup(tempDir);
}

process.exitCode = exitCode;
