import { describe, expect, it } from "vitest";
import {
  WORKOS_AUTH_GLYPH_CYCLE_SECONDS,
  WORKOS_AUTH_GLYPH_ORDER,
} from "./AuthTechnicalFrame";

describe("AuthTechnicalFrame WorkOS glyph loop", () => {
  it("keeps the WorkOS wordmark order and exact case", () => {
    expect(WORKOS_AUTH_GLYPH_ORDER).toEqual(["W", "o", "r", "k", "O", "S"]);
  });

  it("allocates one nine-second repair cycle per glyph", () => {
    expect(WORKOS_AUTH_GLYPH_CYCLE_SECONDS).toBe(
      WORKOS_AUTH_GLYPH_ORDER.length * 9,
    );
  });
});
