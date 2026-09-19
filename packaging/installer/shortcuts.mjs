import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function windowsSystem32(fileName, env = process.env) {
  return join(env.WINDIR || "C:\\Windows", "System32", fileName);
}

export function userShortcutArguments(hiddenVbs, installDir, command) {
  return `"${hiddenVbs}" "${installDir}" ${command}`;
}

export function operatorMessageWscriptArgs(showMessageVbs, message) {
  return [showMessageVbs, message];
}

export function createShortcut(shortcutPath, target, args, workingDir, description) {
  if (process.platform !== "win32") {
    return false;
  }
  mkdirSync(dirname(shortcutPath), { recursive: true });
  const vbs = fileURLToPath(new URL("./create-shortcut.vbs", import.meta.url));
  const argsDir = mkdtempSync(join(tmpdir(), "workos-lnk-args-"));
  const argsFile = join(argsDir, "arguments.txt");
  writeFileSync(argsFile, args, "utf8");
  try {
    const result = spawnSync(
      windowsSystem32("cscript.exe"),
      ["//nologo", vbs, shortcutPath, target, argsFile, workingDir, description],
      { windowsHide: true, encoding: "utf8" },
    );
    return result.status === 0;
  } finally {
    rmSync(argsDir, { recursive: true, force: true });
  }
}

export function inspectShortcut(shortcutPath) {
  if (process.platform !== "win32") {
    return null;
  }
  const vbs = fileURLToPath(new URL("./inspect-shortcut.vbs", import.meta.url));
  const result = spawnSync(windowsSystem32("cscript.exe"), ["//nologo", vbs, shortcutPath], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "shortcut_inspect_failed");
  }
  const parsed = {};
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const separator = line.indexOf("|");
    if (separator <= 0) {
      continue;
    }
    parsed[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return {
    TargetPath: parsed.TargetPath ?? "",
    Arguments: parsed.Arguments ?? "",
    WorkingDirectory: parsed.WorkingDirectory ?? "",
    WindowStyle: Number(parsed.WindowStyle ?? 0),
  };
}

export function runUserFacingHiddenLaunch(hiddenVbs, installDir, command, env = process.env, options = {}) {
  const child = spawn(windowsSystem32("wscript.exe"), [hiddenVbs, installDir, command], {
    env,
    detached: options.wait !== true,
    stdio: "ignore",
    windowsHide: true,
  });
  if (options.wait !== true) {
    child.unref();
  }
  return child;
}
