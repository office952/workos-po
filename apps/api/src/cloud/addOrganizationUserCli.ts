import { fileURLToPath } from "node:url";
import {
  addOrganizationUser,
  AddOrganizationUserError,
  type AddOrganizationUserResult,
} from "./addOrganizationUser.js";
import { normalizeEmail } from "./controlPlane.js";
import { readProvisionPassword, rejectArgvPassword } from "./devProvisionCli.js";

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

function printResult(result: AddOrganizationUserResult): void {
  console.log(`result: ${result.kind}`);
  console.log(`organizationId: ${result.organizationId}`);
  console.log(`email: ${result.email}`);
  console.log(`role: ${result.role}`);
}

export async function runAddOrganizationUserCli(
  argv: readonly string[] = process.argv,
  input: NodeJS.ReadableStream & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
  } = process.stdin,
): Promise<void> {
  rejectArgvPassword(argv);
  const organizationId = readArg(argv, "organization-id");
  const email = readArg(argv, "email");
  const role = readArg(argv, "role");
  try {
    const result = await addOrganizationUser({
      cloudRoot: readArg(argv, "root"),
      organizationId,
      email,
      role,
      confirmControlledAccessChange: hasFlag(argv, "confirm-controlled-access-change"),
      passwordSupplied: argv.includes("--password-stdin"),
      readPassword: () => readProvisionPassword(argv, input),
    });
    printResult(result);
  } catch (error) {
    if (
      error instanceof AddOrganizationUserError &&
      error.code === "user_disabled" &&
      (role === "owner" || role === "member")
    ) {
      printResult({
        kind: "USER_DISABLED",
        organizationId,
        email: normalizeEmail(email),
        role,
      });
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("addOrganizationUserCli.ts")
  : false;

if (invokedDirectly) {
  await runAddOrganizationUserCli();
}
