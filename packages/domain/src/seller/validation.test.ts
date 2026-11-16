import { describe, expect, it } from "vitest";
import { SYNTHETIC_DEMO_SELLER, syntheticDemoSellerProfile } from "./identity.js";
import {
  changedSellerFields,
  checkFiscalId,
  fiscalIdCheckLabel,
  isValidIban,
  isValidRomanianCui,
  sellerCompleteness,
  validateSellerProfileInput,
} from "./validation.js";

const empty = {
  legalName: "",
  brand: "",
  fiscalId: "",
  tradeRegister: "",
  address: "",
  locality: "",
  iban: "",
  bank: "",
};

describe("seller identity validation", () => {
  it("applies the Romanian control digit only when the identifier declares RO, never by inference", () => {
    // Control digits computed with the published key 753217532 on fictitious numbers.
    expect(isValidRomanianCui("19")).toBe(true);
    expect(isValidRomanianCui("18")).toBe(false);
    expect(checkFiscalId("RO 19")).toEqual({ kind: "RO_PREFIX_VALID", normalized: "RO19" });
    expect(checkFiscalId("ro18")).toEqual({ kind: "RO_PREFIX_CONTROL_MISMATCH", normalized: "RO18" });
    // Digits only are ambiguous: no country is inferred and no Romanian rule is applied.
    expect(checkFiscalId("18").kind).toBe("JURISDICTION_UNKNOWN");
    expect(checkFiscalId("19").kind).toBe("JURISDICTION_UNKNOWN");
    expect(checkFiscalId("DE-123456789").kind).toBe("JURISDICTION_UNKNOWN");
    expect(fiscalIdCheckLabel(checkFiscalId("18"))).toMatch(/Țara nu este cunoscută/);
    expect(fiscalIdCheckLabel(checkFiscalId("18"))).not.toMatch(/cifra de control a CIF-ului românesc (este|nu)/);
    expect(checkFiscalId("<script>").kind).toBe("INVALID_FORMAT");
    expect(checkFiscalId("  ").kind).toBe("EMPTY");
  });

  it("checks IBAN with ISO mod 97", () => {
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isValidIban("GB82WEST12345698765433")).toBe(false);
    expect(isValidIban("DEMO-IBAN-0001")).toBe(false);
  });

  it("requires legal name and fiscal id, keeps optional fields optional, normalizes values", () => {
    expect(validateSellerProfileInput(empty)).toMatchObject({
      ok: false,
      issues: [
        { field: "legalName" },
        { field: "fiscalId" },
      ],
    });
    const invalid = validateSellerProfileInput({ ...empty, legalName: "Firma", fiscalId: "<x>", iban: "RO00 BAD" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues.map((issue) => issue.field)).toEqual(["fiscalId", "iban"]);
    // Compatibility: neither an RO control-digit mismatch nor an unknown jurisdiction blocks a save;
    // both are reported explicitly.
    const mismatch = validateSellerProfileInput({ ...empty, legalName: "Firma", fiscalId: "RO18" });
    expect(mismatch).toMatchObject({ ok: true, warnings: [{ field: "fiscalId", reason: expect.stringMatching(/nu corespunde/) }] });
    const unknown = validateSellerProfileInput({ ...empty, legalName: "Firma", fiscalId: "18" });
    expect(unknown).toMatchObject({ ok: true, warnings: [{ field: "fiscalId", reason: expect.stringMatching(/Țara nu este cunoscută/) }] });
    expect(validateSellerProfileInput({ ...empty, legalName: "Firma", fiscalId: "RO19" })).toMatchObject({ ok: true, warnings: [] });
    const valid = validateSellerProfileInput({
      ...empty,
      legalName: "  Firma Test SRL ",
      fiscalId: "ro19",
      iban: "gb82 west 1234 5698 7654 32",
    });
    expect(valid).toMatchObject({
      ok: true,
      input: { legalName: "Firma Test SRL", fiscalId: "RO19", iban: "GB82WEST12345698765432", bank: "" },
    });
  });

  it("reports completeness and changed fields", () => {
    expect(sellerCompleteness(null).status).toBe("UNCONFIGURED");
    expect(sellerCompleteness({ ...syntheticDemoSellerProfile(), fiscalId: "" }).status).toBe("INCOMPLETE");
    expect(sellerCompleteness(syntheticDemoSellerProfile()).status).toBe("COMPLETE");
    expect(changedSellerFields(null, { ...empty, legalName: "A" })).toEqual(["legalName"]);
    expect(changedSellerFields(SYNTHETIC_DEMO_SELLER, { ...SYNTHETIC_DEMO_SELLER, bank: "Alta" })).toEqual(["bank"]);
  });

  it("keeps the demonstration seller visibly synthetic", () => {
    expect(JSON.stringify(SYNTHETIC_DEMO_SELLER)).toMatch(/DEMO/);
    // Valid ISO format with a non-existent bank code ("DEMO"): never a real account.
    expect(isValidIban(SYNTHETIC_DEMO_SELLER.iban)).toBe(true);
    expect(SYNTHETIC_DEMO_SELLER.iban.slice(4, 8)).toBe("DEMO");
    expect(checkFiscalId(SYNTHETIC_DEMO_SELLER.fiscalId).kind).toBe("JURISDICTION_UNKNOWN");
  });
});
