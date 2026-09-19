import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { generateAttachmentStorageKey } from "@workos-final/domain";
import { resolveWorkosDataDir } from "../persistence/sqlite.js";

export function resolveDocumentsRoot(dataDir = resolveWorkosDataDir()): string {
  return join(dataDir, "documents");
}

export function resolveRequestAttachmentDir(
  requestId: string,
  documentsRoot = resolveDocumentsRoot(),
): string {
  return join(documentsRoot, "requests", safePathSegment(requestId));
}

export function resolveRequestAttachmentPath(
  requestId: string,
  storageKey: string,
  documentsRoot = resolveDocumentsRoot(),
): string {
  const key = safePathSegment(storageKey);
  const dir = resolveRequestAttachmentDir(requestId, documentsRoot);
  const full = resolve(dir, key);
  const root = resolve(documentsRoot);
  if (!full.startsWith(root + sep) && full !== root) {
    throw new Error("storage_path_escape");
  }
  return full;
}

export function writeRequestAttachmentBytes(input: {
  requestId: string;
  bytes: Uint8Array;
  documentsRoot?: string;
  storageKey?: string;
}): { storageKey: string; absolutePath: string; sha256: string } {
  const documentsRoot = input.documentsRoot ?? resolveDocumentsRoot();
  const storageKey = input.storageKey ?? generateAttachmentStorageKey();
  const dir = resolveRequestAttachmentDir(input.requestId, documentsRoot);
  mkdirSync(dir, { recursive: true });
  const finalPath = resolveRequestAttachmentPath(
    input.requestId,
    storageKey,
    documentsRoot,
  );
  const tempPath = join(dir, `.tmp-${randomUUID()}`);
  try {
    writeFileSync(tempPath, input.bytes);
    const sha256 = sha256Hex(input.bytes);
    try {
      renameSync(tempPath, finalPath);
    } catch {
      copyFileSync(tempPath, finalPath);
      rmSync(tempPath, { force: true });
    }
    return { storageKey, absolutePath: finalPath, sha256 };
  } catch (error) {
    rmSync(tempPath, { force: true });
    rmSync(finalPath, { force: true });
    throw error;
  }
}

export function readRequestAttachmentBytes(
  requestId: string,
  storageKey: string,
  documentsRoot = resolveDocumentsRoot(),
): Uint8Array | null {
  const path = resolveRequestAttachmentPath(requestId, storageKey, documentsRoot);
  if (!existsSync(path)) {
    return null;
  }
  return new Uint8Array(readFileSync(path));
}

export function removeRequestAttachmentFile(
  requestId: string,
  storageKey: string,
  documentsRoot = resolveDocumentsRoot(),
): void {
  const path = resolveRequestAttachmentPath(requestId, storageKey, documentsRoot);
  rmSync(path, { force: true });
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("invalid_storage_segment");
  }
  if (cleaned.includes("..") || cleaned.includes(sep) || cleaned.includes("/") || cleaned.includes("\\")) {
    throw new Error("invalid_storage_segment");
  }
  return cleaned;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function attachmentIntegrityMatches(bytes: Uint8Array, expectedSha256: string): boolean {
  const actual = sha256Hex(bytes);
  if (actual.length !== expectedSha256.length || actual.length === 0) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedSha256, "hex"));
  } catch {
    return false;
  }
}
