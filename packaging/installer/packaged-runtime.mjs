import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAlive } from "../launcher/launch-core.mjs";
import { windowsSystem32 } from "./shortcuts.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function packagedNodePath(installDir) {
  return join(installDir, "runtime", "node.exe");
}

export function listProcessesUsingExecutable(executablePath) {
  if (process.platform !== "win32" || !existsSync(executablePath)) {
    return [];
  }
  const vbs = fileURLToPath(new URL("./list-executable-pids.vbs", import.meta.url));
  const result = spawnSync(windowsSystem32("cscript.exe"), ["//nologo", vbs, resolve(executablePath)], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    return [];
  }
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

export async function stopPackagedRuntimeProcesses(installDir) {
  const nodePath = packagedNodePath(installDir);
  const stopped = [];
  for (const pid of listProcessesUsingExecutable(nodePath)) {
    try {
      process.kill(pid);
      stopped.push(pid);
    } catch {
      // Process may have exited between listing and kill.
    }
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && stopped.some((pid) => isAlive(pid))) {
    await sleep(100);
  }
  return stopped;
}

export async function retireDirectory(dir) {
  if (!existsSync(dir)) {
    return;
  }
  const retired = `${dir}.retired-${process.pid}-${Date.now()}`;
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      renameSync(dir, retired);
      lastError = null;
      break;
    } catch (renameError) {
      lastError = renameError;
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
        return;
      } catch (removeError) {
        lastError = removeError;
      }
      await sleep(250);
    }
  }
  if (existsSync(dir)) {
    throw lastError ?? new Error("retire_directory_failed");
  }
  try {
    rmSync(retired, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  } catch {
    // A leftover retired folder is removable after the last handle closes.
  }
}
