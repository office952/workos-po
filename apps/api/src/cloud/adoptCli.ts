import { fileURLToPath } from "node:url";
import { openProvisionedControlPlane } from "./provision.js";
import { adoptOperationalPlane } from "./adoptOperationalPlane.js";

function readArg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

export async function runAdoptCli(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("adoptCli is local/synthetic machinery and must not run as production bootstrap.");
  }
  const cloudRoot = readArg(argv, "root");
  const sourceSqlite = readArg(argv, "sqlite");
  const sourceDocuments = readArg(argv, "documents");
  if (!cloudRoot || !sourceSqlite || !sourceDocuments) {
    throw new Error("Required: --root --sqlite --documents");
  }
  const dryRun = argv.includes("--dry-run");
  const execute = argv.includes("--execute");
  if (dryRun === execute) {
    throw new Error("Specify exactly one of --dry-run or --execute");
  }
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  try {
    let organizationId = readArg(argv, "organization-id");
    if (!organizationId) {
      const displayName = readArg(argv, "org");
      if (!displayName) {
        throw new Error("Required: --organization-id or --org");
      }
      const match = controlPlane
        .listOrganizations()
        .find((organization) => organization.displayName === displayName);
      if (!match) {
        throw new Error("organization_missing");
      }
      organizationId = match.organizationId;
    }
    const result = await adoptOperationalPlane({
      controlPlane,
      organizationId,
      sourceSqlite,
      sourceDocumentsRoot: sourceDocuments,
      mode: dryRun ? "dry-run" : "execute",
    });
    console.log(JSON.stringify({
      executed: result.executed,
      plan: result.plan,
      sourceMutations: result.sourceBefore.sqliteHash === result.sourceAfter.sqliteHash ? 0 : 1,
      verification: result.verification ?? null,
    }, null, 2));
  } finally {
    controlPlane.close();
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("adoptCli.ts")
  : false;

if (invokedDirectly) {
  await runAdoptCli();
}
