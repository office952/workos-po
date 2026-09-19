import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLnkStrings, patchLnkUnicodeStrings } from "./lnk-unicode.mjs";

export function windowsSystem32(fileName, env = process.env) {
  return join(env.WINDIR || "C:\\Windows", "System32", fileName);
}

export function userShortcutArguments(hiddenVbs, installDir, command) {
  return `"${hiddenVbs}" "${installDir}" ${command}`;
}

export function operatorMessageWscriptArgs(showMessageVbs, message) {
  return [showMessageVbs, message];
}

function writeUtf16le(path, text) {
  writeFileSync(path, `\uFEFF${text}`, "utf16le");
}

function readUtf16le(path) {
  return readFileSync(path, "utf16le").replace(/^\uFEFF/, "");
}

function shortcutPropsText(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${key}|${value}`)
    .join("\r\n");
}

export function createShortcut(shortcutPath, target, args, workingDir, description) {
  if (process.platform !== "win32") {
    return false;
  }
  mkdirSync(dirname(shortcutPath), { recursive: true });
  const vbs = fileURLToPath(new URL("./create-shortcut.vbs", import.meta.url));
  const argsDir = mkdtempSync(join(tmpdir(), "workos-lnk-args-"));
  const propsFile = join(argsDir, "shortcut-props.txt");
  const stagingLnk = join(argsDir, "shortcut.lnk");
  writeUtf16le(
    propsFile,
    shortcutPropsText({
      ShortcutPath: stagingLnk,
      TargetPath: target,
      Arguments: args,
      WorkingDirectory: workingDir,
      Description: description,
    }),
  );
  try {
    const result = spawnSync(windowsSystem32("cscript.exe"), ["//nologo", vbs, propsFile], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (result.status !== 0 || !existsSync(stagingLnk)) {
      return false;
    }
    patchLnkUnicodeStrings(stagingLnk, {
      argumentsText: args,
      workingDir,
      description,
    });
    copyFileSync(stagingLnk, shortcutPath);
    return existsSync(shortcutPath);
  } finally {
    rmSync(argsDir, { recursive: true, force: true });
  }
}

export function inspectShortcut(shortcutPath) {
  if (process.platform !== "win32") {
    return null;
  }
  if (!existsSync(shortcutPath)) {
    return {
      TargetPath: "",
      Arguments: "",
      WorkingDirectory: "",
      WindowStyle: 0,
    };
  }
  const vbs = fileURLToPath(new URL("./inspect-shortcut.vbs", import.meta.url));
  const workDir = mkdtempSync(join(tmpdir(), "workos-lnk-inspect-"));
  const pathFile = join(workDir, "shortcut-path.txt");
  const outFile = join(workDir, "shortcut.txt");
  const stagingLnk = join(workDir, "shortcut.lnk");
  copyFileSync(shortcutPath, stagingLnk);
  writeUtf16le(
    pathFile,
    shortcutPropsText({
      ShortcutPath: stagingLnk,
      OutFile: outFile,
    }),
  );
  try {
    const result = spawnSync(windowsSystem32("cscript.exe"), ["//nologo", vbs, pathFile], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "shortcut_inspect_failed");
    }
    const parsed = {};
    for (const line of readUtf16le(outFile).split(/\r?\n/)) {
      const separator = line.indexOf("|");
      if (separator <= 0) {
        continue;
      }
      parsed[line.slice(0, separator)] = line.slice(separator + 1);
    }
    const unicode = existsSync(shortcutPath)
      ? parseLnkStrings(readFileSync(shortcutPath)).strings
      : { arguments: "", workingDir: "" };
    return {
      TargetPath: parsed.TargetPath ?? "",
      Arguments: unicode.arguments || parsed.Arguments || "",
      WorkingDirectory: unicode.workingDir || parsed.WorkingDirectory || "",
      WindowStyle: Number(parsed.WindowStyle ?? 0),
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
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
