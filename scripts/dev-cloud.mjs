import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const IDENTITY_NAME = ".dev-identity.json";
const DEFAULT_EMAIL = "dev@workos.local";
const DEFAULT_ORG = "WorkOS Dev";
const useWindowsShell = process.platform === "win32";

function shellArg(value) {
  if (!useWindowsShell) {
    return value;
  }
  return `"${String(value).replaceAll('"', "")}"`;
}

function spawnPnpm(args, options) {
  return spawn("pnpm", args, {
    cwd: repoRoot,
    windowsHide: true,
    shell: useWindowsShell,
    ...options,
  });
}

function fail(code, detail) {
  console.error(detail ? `${code}: ${detail}` : code);
  process.exit(1);
}

function readArg(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) {
    return "";
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail("dev_cloud_root_invalid", `Missing value for --${name}`);
  }
  return value;
}

function isInsideAllowedRoot(base, candidate) {
  const rel = relative(resolve(base), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertSafeDevRoot(candidate) {
  const resolved = resolve(candidate);
  const allowed = [resolve(repoRoot, ".tmp"), resolve(tmpdir())];
  if (!allowed.some((base) => isInsideAllowedRoot(base, resolved))) {
    fail(
      "dev_cloud_root_unsafe",
      "Override must resolve under the repository .tmp/ directory or the OS temp directory.",
    );
  }
  return resolved;
}

function resolveDevCloudRoot(argv) {
  const override = readArg(argv, "root") || process.env.WORKOS_DEV_CLOUD_ROOT?.trim() || "";
  if (override) {
    return assertSafeDevRoot(override);
  }
  return assertSafeDevRoot(join(repoRoot, ".tmp", "workos-dev-cloud"));
}

function generateSyntheticPassword() {
  return `Dev${randomBytes(18).toString("base64url")}9`;
}

function identityPath(root) {
  return join(root, IDENTITY_NAME);
}

function readIdentity(root) {
  const path = identityPath(root);
  if (!existsSync(path)) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("dev_cloud_identity_invalid", path);
  }
  if (
    typeof parsed?.email !== "string" ||
    typeof parsed?.password !== "string" ||
    typeof parsed?.organization !== "string"
  ) {
    fail("dev_cloud_identity_invalid", path);
  }
  return parsed;
}

function writeIdentity(root, identity) {
  writeFileSync(identityPath(root), `${JSON.stringify(identity, null, 2)}\n`);
}

function controlPlanePath(root) {
  return join(root, "control", "control-plane.sqlite");
}

function provisionWithExistingCli(root, identity, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnPnpm(
      [
        "--filter",
        "@workos-final/api",
        "cloud:provision",
        "--",
        "--root",
        shellArg(root),
        "--org",
        shellArg(identity.organization),
        "--email",
        shellArg(identity.email),
        "--password-stdin",
      ],
      {
        env,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    child.stdin.write(identity.password);
    child.stdin.end();
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error("dev_cloud_provision_failed"));
        return;
      }
      resolvePromise();
    });
  });
}

async function ensureSyntheticCloud(root, env) {
  mkdirSync(root, { recursive: true });
  const existingIdentity = readIdentity(root);
  const planeExists = existsSync(controlPlanePath(root));
  if (existingIdentity && planeExists) {
    return existingIdentity;
  }
  if (planeExists && !existingIdentity) {
    fail(
      "dev_cloud_identity_missing",
      "Isolated Cloud root already exists without a synthetic identity file. Delete the isolated root and rerun.",
    );
  }
  if (existingIdentity && !planeExists) {
    fail(
      "dev_cloud_control_plane_missing",
      "Synthetic identity exists without a Control Plane. Delete the isolated root and rerun.",
    );
  }

  const identity = {
    classification: "SYNTHETIC_ISOLATED_DEV",
    email: DEFAULT_EMAIL,
    password: generateSyntheticPassword(),
    organization: DEFAULT_ORG,
  };
  await provisionWithExistingCli(root, identity, env);
  writeIdentity(root, identity);
  return identity;
}

function launchApi(root, env) {
  const child = spawnPnpm(["--filter", "@workos-final/api", "dev"], {
    env: {
      ...env,
      HOST: "127.0.0.1",
      WORKOS_CLOUD_ROOT: root,
      WORKOS_LOCAL_ROOT: "",
      WORKOS_SQLITE_PATH: "",
    },
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
  return child;
}

if (process.env.NODE_ENV === "production") {
  fail("dev_cloud_production_refused", "pnpm dev:cloud is a synthetic development helper.");
}

const argv = process.argv.slice(2);
const cloudRoot = resolveDevCloudRoot(argv);
const env = {
  ...process.env,
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: process.env.PORT?.trim() || "8787",
  WORKOS_CLOUD_ROOT: cloudRoot,
  WORKOS_LOCAL_ROOT: "",
  WORKOS_SQLITE_PATH: "",
};

try {
  const identity = await ensureSyntheticCloud(cloudRoot, env);
  console.log("WorkOS development Cloud (isolated synthetic root)");
  console.log(`root: ${cloudRoot}`);
  console.log("classification: SYNTHETIC_ISOLATED_DEV");
  console.log(`email: ${identity.email}`);
  console.log(`organization: ${identity.organization}`);
  console.log(`credentials: stored in ${identityPath(cloudRoot)} (gitignored; not printed)`);
  console.log("Frontend remains `pnpm dev` → http://127.0.0.1:5173");
  console.log("Journey: login → organization → UI20");
  launchApi(cloudRoot, env);
} catch (error) {
  fail("dev_cloud_failed", error instanceof Error ? error.message : String(error));
}
