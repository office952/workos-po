import { createCloudBackup } from "./backup.js";

export async function runCloudBackupCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const result = await createCloudBackup({ env });
  process.stdout.write(`${result.backupDir}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("backupCli.ts")) {
  runCloudBackupCli().catch((error) => {
    const code = error instanceof Error ? error.message : "backup_failed";
    process.stderr.write(`${code}\n`);
    process.exit(1);
  });
}
