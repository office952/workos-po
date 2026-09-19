import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  assertDevProvisionSafe,
  readProvisionPassword,
  rejectArgvPassword,
} from "../src/cloud/devProvisionCli.js";

describe("dev Cloud provision CLI", () => {
  it("forbids argv passwords and production bootstrap", () => {
    expect(() => rejectArgvPassword(["--root", "x", "--password", "secret"])).toThrow(
      /must not be passed as --password/,
    );
    expect(() => assertDevProvisionSafe({ NODE_ENV: "production" })).toThrow(
      /must not bootstrap production accounts/,
    );
    expect(() => assertDevProvisionSafe({ NODE_ENV: "development" })).not.toThrow();
  });

  it("reads a password from stdin for automation", async () => {
    const input = Readable.from(["OwnerPass12\n"]);
    await expect(
      readProvisionPassword(["--password-stdin"], input),
    ).resolves.toBe("OwnerPass12");
  });
});
