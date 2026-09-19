import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const OPERATOR_KDF = "scrypt" as const;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

export async function hashOperatorPin(pin: string): Promise<{
  pinHash: Buffer;
  pinSalt: Buffer;
  kdf: typeof OPERATOR_KDF;
}> {
  const pinSalt = randomBytes(SALT_BYTES);
  const pinHash = (await scryptAsync(pin, pinSalt, SCRYPT_KEYLEN)) as Buffer;
  return { pinHash, pinSalt, kdf: OPERATOR_KDF };
}

export async function verifyOperatorPin(
  pin: string,
  pinHash: Buffer,
  pinSalt: Buffer,
): Promise<boolean> {
  const derived = (await scryptAsync(pin, pinSalt, SCRYPT_KEYLEN)) as Buffer;
  if (derived.length !== pinHash.length) {
    return false;
  }
  return timingSafeEqual(derived, pinHash);
}

export function createSessionToken(): { rawToken: string; tokenHash: Buffer } {
  const raw = randomBytes(TOKEN_BYTES);
  return {
    rawToken: raw.toString("base64url"),
    tokenHash: createHash("sha256").update(raw).digest(),
  };
}

export function hashRawSessionToken(rawToken: string): Buffer {
  return createHash("sha256").update(Buffer.from(rawToken, "base64url")).digest();
}
