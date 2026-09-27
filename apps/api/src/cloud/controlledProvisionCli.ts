import { fileURLToPath } from "node:url";
import {
  rejectArgvPassword,
  readProvisionPassword,
} from "./devProvisionCli.js";
import { assertCloudPassword } from "./password.js";
import {
  ProvisionConflictError,
  provisionControlledOrganization,
  resumeControlledOrganizationProvision,
  type ProvisionResult,
} from "./provision.js";

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

function printProvisionResult(result: ProvisionResult): void {
  console.log("controlled-operator: organization provision complete.");
  if (result.alreadyActive) {
    console.log("already_active");
  }
  console.log(`organization: ${result.organization.displayName}`);
  console.log(`organizationId: ${result.organization.organizationId}`);
  console.log(`status: ${result.organization.status}`);
  console.log(`owner: ${result.user.email}`);
  console.log(`bootstrapPolicy: ${result.plane.bootstrapPolicy}`);
  console.log(`planeKey: ${result.plane.planeKey}`);
}

export async function runControlledProvisionCli(
  argv: readonly string[] = process.argv,
  input: NodeJS.ReadableStream & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
  } = process.stdin,
): Promise<void> {
  rejectArgvPassword(argv);
  if (!hasFlag(argv, "confirm-controlled-provision")) {
    throw new ProvisionConflictError("confirm_required");
  }
  const intent = readArg(argv, "intent");
  if (intent !== "NEW_ORGANIZATION") {
    throw new ProvisionConflictError("intent_required");
  }
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
    const result = await resumeControlledOrganizationProvision({
      cloudRoot,
      organizationId,
      email,
      password,
      intent: "NEW_ORGANIZATION",
      confirmControlledProvision: true,
    });
    printProvisionResult(result);
    return;
  }
  const displayName = readArg(argv, "org");
  try {
    const result = await provisionControlledOrganization({
      cloudRoot,
      displayName,
      email,
      password,
      intent: "NEW_ORGANIZATION",
      confirmControlledProvision: true,
    });
    printProvisionResult(result);
  } catch (error) {
    if (error instanceof ProvisionConflictError && error.code === "incomplete_organization_exists") {
      console.error("incomplete_organization_exists");
      if (error.detail) {
        console.error(`organizationId: ${error.detail}`);
      }
      console.error(
        "Resume with --resume --root <root> --organization-id <id> --email <email> --intent NEW_ORGANIZATION --confirm-controlled-provision.",
      );
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("controlledProvisionCli.ts")
  : false;

if (invokedDirectly) {
  await runControlledProvisionCli();
}
