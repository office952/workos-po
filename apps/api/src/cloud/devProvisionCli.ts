import { createInterface } from "node:readline";
import { stdin, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import type { BootstrapPolicy } from "./controlPlane.js";
import { assertCloudPassword } from "./password.js";
import {
  ProvisionConflictError,
  provisionNewOrganization,
  resumeOrganizationProvision,
  type ProvisionResult,
} from "./provision.js";

/** Dev provision may only create empty-foundation policies — never ADOPT_EXISTING. */
export const DEV_PROVISION_BOOTSTRAP_POLICIES = [
  "NEW_ORGANIZATION",
  "SYNTHETIC_TEST",
] as const satisfies readonly BootstrapPolicy[];

export type DevProvisionBootstrapPolicy = (typeof DEV_PROVISION_BOOTSTRAP_POLICIES)[number];

export function parseDevProvisionBootstrapPolicy(
  value: string | undefined,
): DevProvisionBootstrapPolicy {
  if (value === undefined || value === "") {
    return "NEW_ORGANIZATION";
  }
  if (value === "NEW_ORGANIZATION" || value === "SYNTHETIC_TEST") {
    return value;
  }
  throw new Error(
    `Invalid --bootstrap-policy ${value}. Allowed: NEW_ORGANIZATION | SYNTHETIC_TEST.`,
  );
}

type PasswordInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

export function assertDevProvisionSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "devProvisionCli is a local Cloud setup helper and must not bootstrap production accounts.",
    );
  }
}

export function rejectArgvPassword(argv: readonly string[]): void {
  if (argv.some((item) => item === "--password" || item.startsWith("--password="))) {
    throw new Error(
      "Passwords must not be passed as --password. Use a TTY prompt or --password-stdin.",
    );
  }
}

function readArg(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

export async function readProvisionPassword(
  argv: readonly string[],
  input: PasswordInput = stdin,
): Promise<string> {
  if (argv.includes("--password-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  if (!input.isTTY) {
    throw new Error("Password required via TTY prompt or --password-stdin.");
  }
  return promptHiddenPassword("Cloud password: ", input);
}

function promptHiddenPassword(label: string, input: PasswordInput): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(new Error("Password required via TTY prompt or --password-stdin."));
      return;
    }
    stderr.write(label);
    input.setRawMode?.(true);
    if ("resume" in input && typeof input.resume === "function") {
      input.resume();
    }
    const rl = createInterface({ input, terminal: true });
    let value = "";
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString("utf8");
      if (text === "\u0003") {
        cleanup();
        reject(new Error("cancelled"));
        return;
      }
      if (text === "\n" || text === "\r") {
        cleanup();
        stderr.write("\n");
        resolve(value);
        return;
      }
      if (text === "\u0008" || text === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      if (text.length === 1 && text >= " ") {
        value += text;
      }
    };
    function cleanup(): void {
      input.off("data", onData);
      input.setRawMode?.(false);
      rl.close();
    }
    input.on("data", onData);
  });
}

function printProvisionResult(
  result: ProvisionResult,
  bootstrapPolicy: DevProvisionBootstrapPolicy,
): void {
  console.log("dev-helper: local Cloud setup only. Not Slice 3 adopt/production bootstrap.");
  if (result.alreadyActive) {
    console.log("already_active");
  }
  console.log(`organization: ${result.organization.displayName}`);
  console.log(`organizationId: ${result.organization.organizationId}`);
  console.log(`status: ${result.organization.status}`);
  console.log(`user: ${result.user.email}`);
  console.log(`bootstrapPolicy: ${bootstrapPolicy}`);
  console.log(`plane: ${result.paths.sqlitePath}`);
}

function readOptionalArg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

export async function runDevProvisionCli(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  input: PasswordInput = stdin,
): Promise<void> {
  assertDevProvisionSafe(env);
  rejectArgvPassword(argv);
  const resume = hasFlag(argv, "resume");
  if (resume && hasFlag(argv, "org")) {
    throw new Error("Resume forbids --org. Use --organization-id.");
  }
  const cloudRoot = readArg(argv, "root");
  const email = readArg(argv, "email");
  const password = await readProvisionPassword(argv, input);
  assertCloudPassword(password);
  if (resume) {
    const organizationId = readArg(argv, "organization-id");
    const result = await resumeOrganizationProvision({
      cloudRoot,
      organizationId,
      email,
      password,
      env,
    });
    const policy =
      result.plane.bootstrapPolicy === "SYNTHETIC_TEST" ||
      result.plane.bootstrapPolicy === "NEW_ORGANIZATION"
        ? result.plane.bootstrapPolicy
        : "NEW_ORGANIZATION";
    printProvisionResult(result, policy);
    return;
  }
  const displayName = readArg(argv, "org");
  const bootstrapPolicy = parseDevProvisionBootstrapPolicy(
    readOptionalArg(argv, "bootstrap-policy"),
  );
  try {
    const result = await provisionNewOrganization({
      cloudRoot,
      displayName,
      email,
      password,
      bootstrapPolicy,
      env,
    });
    printProvisionResult(result, bootstrapPolicy);
  } catch (error) {
    if (error instanceof ProvisionConflictError && error.code === "incomplete_organization_exists") {
      console.error("incomplete_organization_exists");
      if (error.detail) {
        console.error(`organizationId: ${error.detail}`);
      }
      console.error("Resume with --resume --root <root> --organization-id <id> --email <email>.");
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("devProvisionCli.ts")
  : false;

if (invokedDirectly) {
  await runDevProvisionCli();
}
