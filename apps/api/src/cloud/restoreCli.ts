import { restoreCloudBackup } from "./restore.js";

function readArg(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`missing_${name}`);
  }
  return value;
}

export function runCloudRestoreCli(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const backupDir = readArg(argv, "backup");
  const targetRoot = readArg(argv, "target");
  const sourceCloudRoot = env.WORKOS_CLOUD_ROOT?.trim();
  const result = restoreCloudBackup({
    backupDir,
    targetRoot,
    sourceCloudRoot,
  });
  process.stdout.write(`${result.targetRoot}\n`);
}

if (process.argv[1]?.endsWith("restoreCli.ts")) {
  try {
    runCloudRestoreCli();
  } catch (error) {
    const code = error instanceof Error ? error.message : "restore_failed";
    process.stderr.write(`${code}\n`);
    process.exit(1);
  }
}
