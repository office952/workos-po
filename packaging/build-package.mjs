import { createRequire } from "node:module";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { defaultProductJsonPath, readProductIdentity } from "./paths.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ASSET_EXTENSIONS = new Set([".sql", ".ttf", ".txt"]);

function findTsc() {
  const candidates = [
    join(repoRoot, "apps", "api", "node_modules", "typescript", "bin", "tsc"),
    join(repoRoot, "packages", "domain", "node_modules", "typescript", "bin", "tsc"),
    join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("typescript_compiler_missing");
}

function runTsc(tsconfig, cwd) {
  const result = spawnSync(process.execPath, [findTsc(), "-p", tsconfig], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "tsc_failed");
  }
}

function copyNonSourceAssets(fromDir, toDir) {
  if (!existsSync(fromDir)) {
    return;
  }
  for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
    const from = join(fromDir, entry.name);
    const to = join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyNonSourceAssets(from, to);
      continue;
    }
    if (entry.isFile() && ASSET_EXTENSIONS.has(extname(entry.name))) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

function packageRootFromRequire(requireFrom, name) {
  try {
    return dirname(requireFrom.resolve(`${name}/package.json`));
  } catch {
    const entry = requireFrom.resolve(name);
    let dir = dirname(entry);
    while (dir.length > 3) {
      const pkgPath = join(dir, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === name) {
          return dir;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    throw new Error(`cannot_resolve_${name}`);
  }
}

function collectProductionPackages(startDir, names) {
  const requireFrom = createRequire(join(startDir, "package.json"));
  const seen = new Map();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || name.startsWith("@workos-final/") || seen.has(name)) {
      continue;
    }
    const root = packageRootFromRequire(requireFrom, name);
    seen.set(name, root);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const next of [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]) {
      queue.push(next);
    }
  }
  return seen;
}

function copyPackageTree(name, fromRoot, destModules) {
  const dest = join(destModules, ...name.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(fromRoot, dest, { recursive: true, dereference: true, force: true });
}

function findNativeBindings(root) {
  const found = [];
  const walk = (dir) => {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") {
          continue;
        }
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".node")) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

function resolveGitCommit() {
  if (process.env.WORKOS_BUILD_COMMIT?.trim()) {
    return process.env.WORKOS_BUILD_COMMIT.trim();
  }
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return "unknown";
}

function copyPackagingFiles(destRoot) {
  const files = [
    ["packaging/product.json", "product.json"],
    ["packaging/paths.mjs", "paths.mjs"],
    ["packaging/paths.mjs", "packaging/paths.mjs"],
    ["packaging/launcher/launch.mjs", "launcher/launch.mjs"],
    ["packaging/launcher/launch-core.mjs", "launcher/launch-core.mjs"],
    ["packaging/launcher/messages.mjs", "launcher/messages.mjs"],
    ["packaging/launcher/hidden.vbs", "launcher/hidden.vbs"],
    ["packaging/launcher/show-message.vbs", "launcher/show-message.vbs"],
    ["packaging/installer/install.mjs", "installer/install.mjs"],
    ["packaging/installer/uninstall.mjs", "installer/uninstall.mjs"],
    ["packaging/installer/shortcuts.mjs", "installer/shortcuts.mjs"],
    ["packaging/installer/packaged-runtime.mjs", "installer/packaged-runtime.mjs"],
    ["packaging/installer/create-shortcut.vbs", "installer/create-shortcut.vbs"],
    ["packaging/installer/inspect-shortcut.vbs", "installer/inspect-shortcut.vbs"],
    ["packaging/installer/list-executable-pids.vbs", "installer/list-executable-pids.vbs"],
    ["packaging/installer/Install-WorkOS.cmd", "Install WorkOS.cmd"],
    ["packaging/installer/Start-WorkOS.cmd", "Start WorkOS.cmd"],
    ["packaging/installer/Uninstall-WorkOS.cmd", "Uninstall WorkOS.cmd"],
  ];
  for (const [from, to] of files) {
    const dest = join(destRoot, to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(repoRoot, from), dest);
  }
}

export function compileProductionArtifacts() {
  runTsc("tsconfig.build.json", join(repoRoot, "packages", "domain"));
  runTsc("tsconfig.build.json", join(repoRoot, "apps", "api"));
  copyNonSourceAssets(join(repoRoot, "apps", "api", "src"), join(repoRoot, "apps", "api", "dist"));
  copyNonSourceAssets(
    join(repoRoot, "packages", "domain", "src"),
    join(repoRoot, "packages", "domain", "dist"),
  );
}

export function buildLocalPackage(options = {}) {
  const product = readProductIdentity(defaultProductJsonPath());
  const destRoot = resolve(options.destRoot ?? join(repoRoot, ".tmp", "workos-local-package"));
  const frontendRoot =
    options.frontendRoot ??
    (existsSync(join(repoRoot, "dist", "index.html")) ? join(repoRoot, "dist") : "");

  compileProductionArtifacts();

  if (existsSync(destRoot)) {
    rmSync(destRoot, { recursive: true, force: true });
  }
  const appDir = join(destRoot, "app");
  const modulesDir = join(appDir, "node_modules");
  mkdirSync(join(destRoot, "runtime"), { recursive: true });
  mkdirSync(appDir, { recursive: true });

  cpSync(join(repoRoot, "apps", "api", "dist"), join(appDir, "dist"), {
    recursive: true,
    dereference: true,
  });

  const domainDest = join(modulesDir, "@workos-final", "domain");
  mkdirSync(domainDest, { recursive: true });
  cpSync(join(repoRoot, "packages", "domain", "dist"), join(domainDest, "dist"), {
    recursive: true,
    dereference: true,
  });
  writeFileSync(
    join(domainDest, "package.json"),
    `${JSON.stringify(
      {
        name: "@workos-final/domain",
        type: "module",
        exports: { ".": "./dist/index.js" },
      },
      null,
      2,
    )}\n`,
  );

  const apiPkg = JSON.parse(readFileSync(join(repoRoot, "apps", "api", "package.json"), "utf8"));
  const productionNames = Object.keys(apiPkg.dependencies ?? {}).filter(
    (name) => name !== "@workos-final/domain",
  );
  const packages = collectProductionPackages(join(repoRoot, "apps", "api"), productionNames);
  for (const [name, fromRoot] of packages) {
    copyPackageTree(name, fromRoot, modulesDir);
  }

  const sqliteBindings = findNativeBindings(join(modulesDir, "better-sqlite3"));
  if (sqliteBindings.length === 0) {
    throw new Error("better_sqlite3_native_binding_missing");
  }

  const webDir = join(appDir, "web");
  mkdirSync(webDir, { recursive: true });
  if (frontendRoot && existsSync(join(frontendRoot, "index.html"))) {
    cpSync(frontendRoot, webDir, { recursive: true, dereference: true });
  } else {
    writeFileSync(
      join(webDir, "index.html"),
      "<!doctype html><html><head><title>WorkOS</title></head><body>Se încarcă WorkOS.</body></html>\n",
    );
  }

  writeFileSync(
    join(appDir, "package.json"),
    `${JSON.stringify(
      {
        name: "workos-local-runtime",
        private: true,
        type: "module",
        version: product.version,
      },
      null,
      2,
    )}\n`,
  );
  copyFileSync(defaultProductJsonPath(), join(appDir, "product.json"));
  writeFileSync(
    join(appDir, "build.json"),
    `${JSON.stringify(
      {
        productName: product.productName,
        version: product.version,
        gitCommit: resolveGitCommit(),
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  const nodeDest = join(
    destRoot,
    "runtime",
    process.platform === "win32" ? "node.exe" : "node",
  );
  copyFileSync(process.execPath, nodeDest);

  copyPackagingFiles(destRoot);

  const verify = spawnSync(
    nodeDest,
    [
      "--input-type=module",
      "-e",
      "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();",
    ],
    { cwd: appDir, encoding: "utf8", windowsHide: true },
  );
  if (verify.status !== 0) {
    throw new Error(verify.stderr || verify.stdout || "better_sqlite3_runtime_verify_failed");
  }

  return {
    destRoot,
    appDir,
    version: product.version,
    nodePath: nodeDest,
    sqliteBindings,
    frontendPackaged: Boolean(frontendRoot && existsSync(join(frontendRoot, "index.html"))),
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const built = buildLocalPackage();
  console.log(`WorkOS local package written to ${built.destRoot}`);
}
