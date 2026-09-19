import { fileURLToPath } from "node:url";
import { openProvisionedControlPlane } from "./provision.js";
import {
  configureOrganizationProviders,
  readArg,
  readProviderConfigFromArgv,
} from "./configureOrganizationProviders.js";

export function assertConfigureProvidersSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "configureProvidersCli is a local/admin helper and must not run as production bootstrap.",
    );
  }
}

export async function runConfigureProvidersCli(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  input: NodeJS.ReadableStream = process.stdin,
): Promise<void> {
  assertConfigureProvidersSafe(env);
  if (argv.includes("--org") || argv.includes("--slug")) {
    throw new Error("Organization must be selected with --organization-id. Name/slug selection is forbidden.");
  }
  const cloudRoot = readArg(argv, "root");
  const organizationId = readArg(argv, "organization-id");
  if (!cloudRoot || !organizationId) {
    throw new Error("Required: --root --organization-id");
  }
  const dryRun = argv.includes("--dry-run");
  const execute = argv.includes("--execute");
  if (dryRun === execute) {
    throw new Error("Specify exactly one of --dry-run or --execute");
  }
  const config = await readProviderConfigFromArgv(argv, input);
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  try {
    const result = await configureOrganizationProviders({
      controlPlane,
      organizationId,
      config,
      mode: dryRun ? "dry-run" : "execute",
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok && invokedDirectly) {
      process.exitCode = 1;
    }
  } finally {
    controlPlane.close();
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("configureProvidersCli.ts")
  : false;

if (invokedDirectly) {
  await runConfigureProvidersCli();
}
