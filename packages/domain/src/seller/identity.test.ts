import { describe, expect, it } from "vitest";
import {
  OWNER_CONFIRMED_SELLER,
  freezeSellerIdentity,
  ownerConfirmedSellerProfile,
  updateSellerProfile,
} from "./identity.js";

describe("seller identity", () => {
  it("seeds the owner-confirmed HUB MEDIA profile", () => {
    const profile = ownerConfirmedSellerProfile();
    expect(profile.legalName).toBe(OWNER_CONFIRMED_SELLER.legalName);
    expect(profile.fiscalId).toBe("RO54481582");
    expect(profile.iban).toBe("RO81RZBR0000060030657337");
    expect(profile.profileId).toBe("seller:current");
  });

  it("updates the live profile without inventing missing contact fields", () => {
    const current = ownerConfirmedSellerProfile();
    const updated = updateSellerProfile(current, {
      ...OWNER_CONFIRMED_SELLER,
      legalName: "HUB MEDIA PRODUCTION S.R.L. TEST",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.alreadyApplied).toBe(false);
    expect(updated.profile.legalName).toBe("HUB MEDIA PRODUCTION S.R.L. TEST");
    expect(updated.profile.fiscalId).toBe(current.fiscalId);
    expect(JSON.stringify(updated.profile)).not.toMatch(/phone|email|website/i);
  });

  it("freezes only supplied seller facts", () => {
    expect(
      freezeSellerIdentity({
        legalName: "HUB MEDIA PRODUCTION S.R.L.",
        brand: "HUB MEDIA PRODUCTION",
        fiscalId: "RO54481582",
        tradeRegister: "",
        address: "",
        locality: "",
        iban: "",
        bank: "",
      }),
    ).toEqual({
      legalName: "HUB MEDIA PRODUCTION S.R.L.",
      brand: "HUB MEDIA PRODUCTION",
      fiscalId: "RO54481582",
    });
    expect(freezeSellerIdentity({ legalName: "   " })).toBeNull();
  });
});
