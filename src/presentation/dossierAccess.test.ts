import { describe, expect, it } from "vitest";
import { canPublishInstructions } from "./dossierAccess";

describe("canPublishInstructions", () => {
  it("keeps the existing owner and single-plane instruction right", () => {
    expect(
      canPublishInstructions({
        ready: true,
        unavailable: false,
        mode: "cloud",
        organization: { membershipRole: "owner" },
      }),
    ).toBe(true);
    expect(
      canPublishInstructions({
        ready: true,
        unavailable: false,
        mode: "single_plane",
        organization: { membershipRole: "member" },
      }),
    ).toBe(true);
    expect(
      canPublishInstructions({
        ready: true,
        unavailable: false,
        mode: "cloud",
        organization: { membershipRole: "member" },
      }),
    ).toBe(false);
  });
});
