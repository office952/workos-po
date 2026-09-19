import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const CLOUD_PASSWORD_KDF = "scrypt:N=32768,r=8,p=1" as const;
export const CLOUD_SCRYPT_KEYLEN = 64;
export const CLOUD_SCRYPT_SALT_BYTES = 16;
export const CLOUD_SCRYPT_MAXMEM_BYTES = 64 * 1024 * 1024;

const MIN_PASSWORD_LENGTH = 10;

const DUMMY_SALT = Buffer.alloc(CLOUD_SCRYPT_SALT_BYTES, 0x5a);
const DUMMY_HASH = Buffer.alloc(CLOUD_SCRYPT_KEYLEN, 0xa5);

export type CloudPasswordIssue = "too_short" | "too_simple" | "pin_like";

export type ParsedCloudPasswordKdf = {
  algorithm: "scrypt";
  N: number;
  r: number;
  p: number;
  keylen: number;
  maxmem: number;
};

export class CloudKdfError extends Error {
  readonly code: "unsupported_kdf" | "malformed_kdf";

  constructor(code: "unsupported_kdf" | "malformed_kdf") {
    super(code);
    this.name = "CloudKdfError";
    this.code = code;
  }
}

const SCRYPT_DESCRIPTOR = /^scrypt:N=(\d+),r=(\d+),p=(\d+)$/;

export class CloudPasswordError extends Error {
  readonly issue: CloudPasswordIssue;

  constructor(issue: CloudPasswordIssue) {
    super(`invalid_password:${issue}`);
    this.name = "CloudPasswordError";
    this.issue = issue;
  }
}

export function validateCloudPassword(password: string): CloudPasswordIssue | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "too_short";
  }
  if (/^\d+$/.test(password)) {
    return "pin_like";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "too_simple";
  }
  return null;
}

export function assertCloudPassword(password: string): void {
  const issue = validateCloudPassword(password);
  if (issue) {
    throw new CloudPasswordError(issue);
  }
}

export function parseCloudPasswordKdf(descriptor: string): ParsedCloudPasswordKdf {
  if (typeof descriptor !== "string" || descriptor.trim().length === 0) {
    throw new CloudKdfError("malformed_kdf");
  }
  const match = SCRYPT_DESCRIPTOR.exec(descriptor.trim());
  if (!match) {
    throw new CloudKdfError(
      descriptor.startsWith("scrypt:") ? "malformed_kdf" : "unsupported_kdf",
    );
  }
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (N !== 32768 || r !== 8 || p !== 1) {
    throw new CloudKdfError("unsupported_kdf");
  }
  return {
    algorithm: "scrypt",
    N,
    r,
    p,
    keylen: CLOUD_SCRYPT_KEYLEN,
    maxmem: CLOUD_SCRYPT_MAXMEM_BYTES,
  };
}

function scryptHash(
  password: string,
  salt: Buffer,
  kdf: ParsedCloudPasswordKdf,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      kdf.keylen,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: kdf.maxmem },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derived as Buffer);
      },
    );
  });
}

export async function hashCloudPassword(password: string): Promise<{
  passwordHash: Buffer;
  passwordSalt: Buffer;
  kdf: typeof CLOUD_PASSWORD_KDF;
}> {
  const passwordSalt = randomBytes(CLOUD_SCRYPT_SALT_BYTES);
  const passwordHash = await scryptHash(
    password,
    passwordSalt,
    parseCloudPasswordKdf(CLOUD_PASSWORD_KDF),
  );
  return { passwordHash, passwordSalt, kdf: CLOUD_PASSWORD_KDF };
}

export async function verifyCloudPassword(
  password: string,
  passwordHash: Buffer,
  passwordSalt: Buffer,
  kdf: string,
): Promise<boolean> {
  const parsed = parseCloudPasswordKdf(kdf);
  const derived = await scryptHash(password, passwordSalt, parsed);
  if (derived.length !== passwordHash.length) {
    return false;
  }
  return timingSafeEqual(derived, passwordHash);
}

export async function consumeCurrentKdfCost(password: string): Promise<void> {
  await verifyCloudPassword(password, DUMMY_HASH, DUMMY_SALT, CLOUD_PASSWORD_KDF);
}

export const cloudLoginCost = {
  consumeUnknownEmail: consumeCurrentKdfCost,
};
