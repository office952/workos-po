import { describe, expect, it } from "vitest";
import { SYNTHETIC_DEMO_SELLER, syntheticDemoSellerProfile } from "./identity.js";
import {
  changedSellerFields,
  checkFiscalId,
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
  it("checks the Romanian CUI control digit without claiming the company exists", () => {
    // Control digits computed with the published key 753217532 on fictitious numbers.
    expect(isValidRomanianCui("19")).toBe(true);
    expect(isValidRomanianCui("18")).toBe(false);
    expect(checkFiscalId("RO 19")).toEqual({ kind: "RO_CUI_VALID", normalized: "RO19" });
    expect(checkFiscalId("18").kind).toBe("RO_CUI_INVALID");
    // No country model: a non-Romanian shaped id gets a structural check only.
    expect(checkFiscalId("DE-123456789").kind).toBe("STRUCTURAL_ONLY");
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
    // A digits-only id with a wrong Romanian control digit is a warning (no country in the model).
    const warned = validateSellerProfileInput({ ...empty, legalName: "Firma", fiscalId: "18" });
    expect(warned).toMatchObject({ ok: true, warnings: [{ field: "fiscalId" }] });
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
    expect(checkFiscalId(SYNTHETIC_DEMO_SELLER.fiscalId).kind).toBe("STRUCTURAL_ONLY");
  });
});
