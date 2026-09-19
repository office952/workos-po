import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { LocalRuntimeError } from "./errors.js";
import { acquireLocalRuntimeLease, releaseLocalRuntimeLease } from "./lease.js";
import { ensureLocalProfile, type LocalProfile } from "./profile.js";

export type LocalBackupManifest = {
  version: 1;
  profile: "local";
  createdAt: string;
  sqlite: { fileName: string; sha256: string; bytes: number };
  documents: { relativePath: string; sha256: string; bytes: number }[];
};

export type LocalBackupResult = {
  backupDir: string;
  manifest: LocalBackupManifest;
};

function sha256File(filePath: string): { sha256: string; bytes: number } {
  const bytes = readFileSync(filePath);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort();
}

async function snapshotSqlite(sourcePath: string, destPath: string): Promise<void> {
  if (!existsSync(sourcePath)) {
    throw new LocalRuntimeError("local_backup_failed");
  }
  mkdirSync(dirname(destPath), { recursive: true });
  const db = new Database(sourcePath, { fileMustExist: true, readonly: true });
  try {
    await db.backup(destPath);
  } catch {
    throw new LocalRuntimeError("local_backup_failed");
  } finally {
    db.close();
  }
}

function backupStamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function resolveBackupDir(profile: LocalProfile, env: NodeJS.ProcessEnv): string {
  const configured = env.WORKOS_LOCAL_BACKUP_DIR?.trim();
  const parent = configured ? resolve(configured) : profile.backupsRoot;
  if (parent === profile.dataDir || parent.startsWith(profile.dataDir + sep)) {
    throw new LocalRuntimeError("local_backup_failed");
  }
  return join(parent, backupStamp());
}

export async function backupLocalRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LocalBackupResult> {
  const profile = ensureLocalProfile(env);
  const lease = acquireLocalRuntimeLease(profile.root, "backup");
  try {
    const backupDir = resolveBackupDir(profile, env);
    mkdirSync(backupDir, { recursive: true });
    const sqliteDest = join(backupDir, "product-system.sqlite");
    await snapshotSqlite(profile.sqlitePath, sqliteDest);
    const documentsDest = join(backupDir, "documents");
    const documentEntries: LocalBackupManifest["documents"] = [];
    for (const filePath of listFiles(profile.documentsRoot)) {
      const relativePath = relative(profile.documentsRoot, filePath).split(sep).join("/");
      const dest = join(documentsDest, relativePath);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(filePath, dest);
      const hash = sha256File(dest);
      documentEntries.push({ relativePath, ...hash });
    }
    const sqliteHash = sha256File(sqliteDest);
    const manifest: LocalBackupManifest = {
      version: 1,
      profile: "local",
      createdAt: new Date().toISOString(),
      sqlite: { fileName: "product-system.sqlite", ...sqliteHash },
      documents: documentEntries,
    };
    writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return { backupDir, manifest };
  } finally {
    releaseLocalRuntimeLease(profile.root, lease);
  }
}
