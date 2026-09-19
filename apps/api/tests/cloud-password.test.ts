import { afterEach, describe, expect, it, vi } from "vitest";
import { createControlPlane, resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  CLOUD_PASSWORD_KDF,
  CLOUD_SCRYPT_MAXMEM_BYTES,
  CloudKdfError,
  cloudLoginCost,
  hashCloudPassword,
  parseCloudPasswordKdf,
  validateCloudPassword,
  verifyCloudPassword,
} from "../src/cloud/password.js";
import { openControlPlaneDatabase } from "../src/persistence/controlPlaneSqlite.js";
import { OWNER_PASSWORD, trackTempDir, cleanupCloudTemps } from "./cloud-harness.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
  vi.restoreAllMocks();
});

describe("Cloud password KDF", () => {
  it("accepts the current password rules and rejects weak values", () => {
    expect(validateCloudPassword("short")).toBe("too_short");
    expect(validateCloudPassword("1234567890")).toBe("pin_like");
    expect(validateCloudPassword("abcdefghij")).toBe("too_simple");
    expect(validateCloudPassword(OWNER_PASSWORD)).toBeNull();
  });

  it("hashes and verifies the correct password and rejects the wrong one", async () => {
    const hashed = await hashCloudPassword(OWNER_PASSWORD);
    expect(hashed.kdf).toBe(CLOUD_PASSWORD_KDF);
    await expect(
      verifyCloudPassword(OWNER_PASSWORD, hashed.passwordHash, hashed.passwordSalt, hashed.kdf),
    ).resolves.toBe(true);
    await expect(
      verifyCloudPassword("WrongPass12", hashed.passwordHash, hashed.passwordSalt, hashed.kdf),
    ).resolves.toBe(false);
  });

  it("produces different hashes for different salts", async () => {
    const first = await hashCloudPassword(OWNER_PASSWORD);
    const second = await hashCloudPassword(OWNER_PASSWORD);
    expect(first.passwordSalt.equals(second.passwordSalt)).toBe(false);
    expect(first.passwordHash.equals(second.passwordHash)).toBe(false);
    await expect(
      verifyCloudPassword(OWNER_PASSWORD, first.passwordHash, first.passwordSalt, first.kdf),
    ).resolves.toBe(true);
    await expect(
      verifyCloudPassword(OWNER_PASSWORD, second.passwordHash, second.passwordSalt, second.kdf),
    ).resolves.toBe(true);
  });

  it("parses the stored supported KDF and keeps explicit maxmem", () => {
    const parsed = parseCloudPasswordKdf(CLOUD_PASSWORD_KDF);
    expect(parsed).toEqual({
      algorithm: "scrypt",
      N: 32768,
      r: 8,
      p: 1,
      keylen: 64,
      maxmem: CLOUD_SCRYPT_MAXMEM_BYTES,
    });
    expect(CLOUD_SCRYPT_MAXMEM_BYTES).toBe(64 * 1024 * 1024);
  });

  it("fails closed on unsupported or malformed KDF descriptors", async () => {
    const hashed = await hashCloudPassword(OWNER_PASSWORD);
    expect(() => parseCloudPasswordKdf("argon2id:m=65536,t=3,p=1")).toThrow(CloudKdfError);
    expect(() => parseCloudPasswordKdf("scrypt:N=1024,r=8,p=1")).toThrow(CloudKdfError);
    expect(() => parseCloudPasswordKdf("scrypt:N=32768")).toThrow(CloudKdfError);
    expect(() => parseCloudPasswordKdf("")).toThrow(CloudKdfError);
    await expect(
      verifyCloudPassword(OWNER_PASSWORD, hashed.passwordHash, hashed.passwordSalt, "bcrypt"),
    ).rejects.toMatchObject({ code: "unsupported_kdf" });
    await expect(
      verifyCloudPassword(OWNER_PASSWORD, hashed.passwordHash, hashed.passwordSalt, "scrypt:"),
    ).rejects.toMatchObject({ code: "malformed_kdf" });
  });

  it("uses the dummy current-KDF path for an unknown email", async () => {
    const spy = vi.spyOn(cloudLoginCost, "consumeUnknownEmail");
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    await expect(
      plane.verifyLogin("missing@example.test", OWNER_PASSWORD),
    ).resolves.toEqual({ ok: false, error: "invalid_credentials" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(OWNER_PASSWORD);
    plane.close();
  });

  it("verifies a stored supported KDF and fails closed for a stored unsupported KDF", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    const user = await plane.createUser({
      email: "owner@example.test",
      password: OWNER_PASSWORD,
    });
    await expect(plane.verifyLogin(user.email, OWNER_PASSWORD)).resolves.toMatchObject({
      ok: true,
    });
    db.prepare(`UPDATE users SET kdf = ? WHERE user_id = ?`).run(
      "argon2id:m=65536,t=3,p=1",
      user.userId,
    );
    await expect(plane.verifyLogin(user.email, OWNER_PASSWORD)).resolves.toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    plane.close();
  });

  it("hides disabled until the stored password verifies", async () => {
    const db = openControlPlaneDatabase(":memory:");
    const plane = createControlPlane(db, trackTempDir());
    const user = await plane.createUser({
      email: "owner@example.test",
      password: OWNER_PASSWORD,
    });
    db.prepare(`UPDATE users SET status = 'DISABLED' WHERE user_id = ?`).run(user.userId);
    await expect(plane.verifyLogin(user.email, "WrongPass12")).resolves.toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    await expect(plane.verifyLogin(user.email, OWNER_PASSWORD)).resolves.toEqual({
      ok: false,
      error: "disabled",
    });
    plane.close();
  });
});
