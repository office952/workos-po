import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalRuntimeError } from "./errors.js";
import {
  LOCAL_PROFILE_VERSION,
  localLayout,
  resolveLocalRoot,
} from "./paths.js";

export type LocalProfileRecord = {
  version: typeof LOCAL_PROFILE_VERSION;
  profile: "local";
  initializedAt: string;
};

export type LocalProfile = ReturnType<typeof localLayout> & {
  profile: "local";
  firstRun: boolean;
};

function readProfileRecord(configPath: string): LocalProfileRecord | null {
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new LocalRuntimeError("local_profile_invalid");
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== LOCAL_PROFILE_VERSION || record.profile !== "local") {
      throw new LocalRuntimeError("local_profile_invalid");
    }
    if (typeof record.initializedAt !== "string" || record.initializedAt.length === 0) {
      throw new LocalRuntimeError("local_profile_invalid");
    }
    return {
      version: LOCAL_PROFILE_VERSION,
      profile: "local",
      initializedAt: record.initializedAt,
    };
  } catch (error) {
    if (error instanceof LocalRuntimeError) {
      throw error;
    }
    throw new LocalRuntimeError("local_profile_invalid");
  }
}

export function ensureLocalProfile(env: NodeJS.ProcessEnv = process.env): LocalProfile {
  const layout = localLayout(resolveLocalRoot(env));
  mkdirSync(layout.dataDir, { recursive: true });
  mkdirSync(layout.documentsRoot, { recursive: true });
  mkdirSync(layout.backupsRoot, { recursive: true });
  mkdirSync(layout.logsRoot, { recursive: true });
  mkdirSync(layout.configDir, { recursive: true });
  mkdirSync(join(layout.root, "ops"), { recursive: true });

  const existing = readProfileRecord(layout.configPath);
  const sqliteExists = existsSync(layout.sqlitePath);
  if (!existing) {
    const record: LocalProfileRecord = {
      version: LOCAL_PROFILE_VERSION,
      profile: "local",
      initializedAt: new Date().toISOString(),
    };
    writeFileSync(layout.configPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  }

  return {
    ...layout,
    profile: "local",
    firstRun: !sqliteExists,
  };
}
