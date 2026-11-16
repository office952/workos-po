import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_DEMO_SELLER,
  freezeSellerIdentity,
  syntheticDemoSellerProfile,
  updateSellerProfile,
} from "./identity.js";

describe("seller identity", () => {
  it("builds the synthetic demonstration profile", () => {
    const profile = syntheticDemoSellerProfile();
    expect(profile.legalName).toBe(SYNTHETIC_DEMO_SELLER.legalName);
    expect(profile.fiscalId).toBe("DEMO-CIF-0001");
    expect(profile.iban).toBe("RO34DEMO0000000000000001");
    expect(profile.profileId).toBe("seller:current");
  });

  it("updates the live profile without inventing missing contact fields", () => {
    const current = syntheticDemoSellerProfile();
    const updated = updateSellerProfile(current, {
      ...SYNTHETIC_DEMO_SELLER,
      legalName: "FIRMA DEMONSTRATIVĂ S.R.L. TEST",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.alreadyApplied).toBe(false);
    expect(updated.profile.legalName).toBe("FIRMA DEMONSTRATIVĂ S.R.L. TEST");
    expect(updated.profile.fiscalId).toBe(current.fiscalId);
    expect(JSON.stringify(updated.profile)).not.toMatch(/phone|email|website/i);
  });

  it("freezes only supplied seller facts", () => {
    expect(
      freezeSellerIdentity({
        legalName: "FIRMA DEMONSTRATIVĂ S.R.L.",
        brand: "ATELIER DEMONSTRATIV",
        fiscalId: "DEMO-CIF-0001",
        tradeRegister: "",
        address: "",
        locality: "",
        iban: "",
        bank: "",
      }),
    ).toEqual({
      legalName: "FIRMA DEMONSTRATIVĂ S.R.L.",
      brand: "ATELIER DEMONSTRATIV",
      fiscalId: "DEMO-CIF-0001",
    });
    expect(freezeSellerIdentity({ legalName: "   " })).toBeNull();
  });
});
