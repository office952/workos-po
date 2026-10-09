import { describe, expect, it } from "vitest";
import {
  ProductionOriginConfigError,
  assertProductionCloudPublicOrigin,
  mutatingOriginAllowed,
  resolveTrustedOrigins,
} from "../src/ops/origin.js";

const production = {
  NODE_ENV: "production",
  WORKOS_PUBLIC_ORIGIN: "https://pilot.workos.example",
};

describe("controlled pilot HTTPS and trusted-origin regressions", () => {
  it("fails closed for missing, HTTP and non-origin production public URLs", () => {
    const rejected = [
      [{ NODE_ENV: "production" }, "production_origin_missing"],
      [{ ...production, WORKOS_PUBLIC_ORIGIN: "http://pilot.workos.example" }, "production_origin_not_https"],
      [{ ...production, WORKOS_PUBLIC_ORIGIN: "https://pilot.workos.example/path" }, "production_origin_invalid"],
      [{ ...production, WORKOS_PUBLIC_ORIGIN: "https://user:pass@pilot.workos.example" }, "production_origin_invalid"],
      [{ ...production, WORKOS_PUBLIC_ORIGIN: "https://pilot.workos.example/?x=1" }, "production_origin_invalid"],
      [{ ...production, WORKOS_TRUSTED_ORIGINS: "http://other.workos.example" }, "production_origin_not_https"],
      [{ ...production, WORKOS_TRUSTED_ORIGINS: "https://other.workos.example/path" }, "production_origin_invalid"],
    ] as const;
    for (const [env, code] of rejected) {
      expect(() => assertProductionCloudPublicOrigin(env)).toThrow(
        expect.objectContaining({ code }) as ProductionOriginConfigError,
      );
    }
  });

  it("allows only exact normalized trusted origins for all mutating methods", () => {
    const env = {
      ...production,
      WORKOS_TRUSTED_ORIGINS: "https://secondary.workos.example",
    };
    expect(assertProductionCloudPublicOrigin(env)).toBe("https://pilot.workos.example");
    expect(resolveTrustedOrigins(env)).toEqual([
      "https://pilot.workos.example",
      "https://secondary.workos.example",
    ]);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(mutatingOriginAllowed(env, method, undefined, { cloud: true })).toBe(false);
      expect(mutatingOriginAllowed(env, method, "https://evil.workos.example", { cloud: true })).toBe(false);
      expect(mutatingOriginAllowed(env, method, "http://pilot.workos.example", { cloud: true })).toBe(false);
      expect(mutatingOriginAllowed(env, method, "https://pilot.workos.example.evil.test", { cloud: true })).toBe(false);
      expect(mutatingOriginAllowed(env, method, "https://pilot.workos.example", { cloud: true })).toBe(true);
      expect(mutatingOriginAllowed(env, method, "https://secondary.workos.example", { cloud: true })).toBe(true);
    }
  });

  it("does not treat production Cloud with no trusted origin as permissive", () => {
    const env = { NODE_ENV: "production" };
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(mutatingOriginAllowed(env, method, undefined, { cloud: true })).toBe(false);
      expect(mutatingOriginAllowed(env, method, "https://arbitrary.example", { cloud: true })).toBe(false);
    }
    expect(mutatingOriginAllowed(env, "GET", undefined, { cloud: true })).toBe(true);
  });
});
