import {
  SELLER_IBAN_MAX_LENGTH,
  SELLER_TEXT_MAX_LENGTH,
  type SellerProfile,
  type SellerProfileInput,
} from "./identity.js";

/**
 * Commercial & Financial V1 · company identity validation, completeness and versions.
 *
 * The seller profile has the eight existing fields only. There is no country field in the model,
 * so jurisdiction is never assumed: a fiscal id that has the shape of a Romanian CUI (digits,
 * optional "RO" prefix) is checked with the published Romanian control-digit algorithm; any other
 * value gets a structural check only and is reported as not verified. A structurally valid id does
 * not prove that the company exists.
 */
export const SELLER_FIELDS = [
  "legalName",
  "brand",
  "fiscalId",
  "tradeRegister",
  "address",
  "locality",
  "iban",
  "bank",
] as const;
export type SellerField = (typeof SELLER_FIELDS)[number];

export type SellerFieldIssue = { field: SellerField; reason: string };

export type FiscalIdCheck =
  | { kind: "EMPTY" }
  | { kind: "RO_CUI_VALID"; normalized: string }
  | { kind: "RO_CUI_INVALID" }
  | { kind: "STRUCTURAL_ONLY" }
  | { kind: "INVALID_FORMAT" };

const RO_CUI_SHAPE = /^(RO)?\s*(\d{2,10})$/i;
const GENERIC_FISCAL_ID = /^[A-Z0-9][A-Z0-9 ./-]{1,29}$/i;
const RO_CUI_KEY = [7, 5, 3, 2, 1, 7, 5, 3, 2];

/** Romanian CUI control digit (ANAF algorithm, key 753217532). */
export function isValidRomanianCui(digits: string): boolean {
  if (!/^\d{2,10}$/.test(digits)) return false;
  const control = Number(digits[digits.length - 1]);
  const body = digits.slice(0, -1).padStart(9, "0");
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(body[index]) * RO_CUI_KEY[index]!;
  }
  let expected = (sum * 10) % 11;
  if (expected === 10) expected = 0;
  return expected === control;
}

export function checkFiscalId(value: string): FiscalIdCheck {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "EMPTY" };
  const ro = RO_CUI_SHAPE.exec(trimmed);
  if (ro) {
    const digits = ro[2]!;
    return isValidRomanianCui(digits)
      ? { kind: "RO_CUI_VALID", normalized: `${ro[1] ? "RO" : ""}${digits}` }
      : { kind: "RO_CUI_INVALID" };
  }
  return GENERIC_FISCAL_ID.test(trimmed) ? { kind: "STRUCTURAL_ONLY" } : { kind: "INVALID_FORMAT" };
}

export function fiscalIdCheckLabel(check: FiscalIdCheck): string {
  switch (check.kind) {
    case "EMPTY":
      return "Necompletat";
    case "RO_CUI_VALID":
      return "Format CIF românesc valid (cifra de control corectă). Nu confirmă existența firmei.";
    case "RO_CUI_INVALID":
      return "CIF românesc cu cifra de control greșită.";
    case "STRUCTURAL_ONLY":
      return "Identificator fiscal nevalidat: format acceptat, fără verificare pentru această țară.";
    case "INVALID_FORMAT":
      return "Identificatorul fiscal conține caractere nepermise.";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}

/** ISO 13616 IBAN check (mod 97). Spaces are ignored. */
export function isValidIban(value: string): boolean {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact) || compact.length > SELLER_IBAN_MAX_LENGTH) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const code = char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of code) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Validates an Owner edit. Legal name and fiscal id are required on save; the other fields are
 * optional and omitted from documents when empty. Returns the normalized input when valid.
 *
 * Without a country in the model, a digits-only id that fails the Romanian control digit is a
 * warning, not a refusal: it may be a foreign identifier. An IBAN, when given, must pass ISO 13616.
 */
export function validateSellerProfileInput(
  input: SellerProfileInput,
):
  | { ok: true; input: SellerProfileInput; fiscalIdCheck: FiscalIdCheck; warnings: SellerFieldIssue[] }
  | { ok: false; issues: SellerFieldIssue[] } {
  const issues: SellerFieldIssue[] = [];
  const text = (field: SellerField): string => (typeof input[field] === "string" ? input[field].trim() : "");
  for (const field of SELLER_FIELDS) {
    if (field === "iban") continue;
    if (text(field).length > SELLER_TEXT_MAX_LENGTH) {
      issues.push({ field, reason: `Maximum ${SELLER_TEXT_MAX_LENGTH} de caractere.` });
    }
  }
  if (text("legalName") === "") {
    issues.push({ field: "legalName", reason: "Denumirea legală este obligatorie." });
  }
  const warnings: SellerFieldIssue[] = [];
  const fiscal = checkFiscalId(text("fiscalId"));
  if (fiscal.kind === "EMPTY") {
    issues.push({ field: "fiscalId", reason: "Identificatorul fiscal (CIF) este obligatoriu." });
  } else if (fiscal.kind === "INVALID_FORMAT") {
    issues.push({ field: "fiscalId", reason: fiscalIdCheckLabel(fiscal) });
  } else if (fiscal.kind === "RO_CUI_INVALID") {
    warnings.push({
      field: "fiscalId",
      reason: "Pentru un CIF românesc, cifra de control nu corespunde. Verifică valoarea; dacă este un identificator din altă țară, poți păstra valoarea.",
    });
  }
  const iban = normalizeIban(text("iban"));
  if (iban !== "" && !isValidIban(iban)) {
    issues.push({ field: "iban", reason: "IBAN invalid: verifică țara, cifrele de control și lungimea." });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    fiscalIdCheck: fiscal,
    warnings,
    input: {
      legalName: text("legalName"),
      brand: text("brand"),
      fiscalId: fiscal.kind === "RO_CUI_VALID" ? fiscal.normalized : text("fiscalId"),
      tradeRegister: text("tradeRegister"),
      address: text("address"),
      locality: text("locality"),
      iban,
      bank: text("bank"),
    },
  };
}

export type SellerCompletenessStatus = "UNCONFIGURED" | "INCOMPLETE" | "COMPLETE";

export type SellerCompleteness = {
  status: SellerCompletenessStatus;
  statusLabel: string;
  missingRequired: readonly SellerField[];
  missingOptional: readonly SellerField[];
};

const REQUIRED_FIELDS: readonly SellerField[] = ["legalName", "fiscalId"];

export function sellerCompleteness(profile: SellerProfile | null): SellerCompleteness {
  if (!profile) {
    return {
      status: "UNCONFIGURED",
      statusLabel: "Datele firmei nu sunt configurate",
      missingRequired: REQUIRED_FIELDS,
      missingOptional: SELLER_FIELDS.filter((field) => !REQUIRED_FIELDS.includes(field)),
    };
  }
  const missingRequired = REQUIRED_FIELDS.filter((field) => profile[field].trim() === "");
  const missingOptional = SELLER_FIELDS.filter(
    (field) => !REQUIRED_FIELDS.includes(field) && profile[field].trim() === "",
  );
  return missingRequired.length > 0
    ? { status: "INCOMPLETE", statusLabel: "Date obligatorii lipsă", missingRequired, missingOptional }
    : { status: "COMPLETE", statusLabel: "Date obligatorii completate", missingRequired, missingOptional };
}

export function sellerFieldLabel(field: SellerField): string {
  switch (field) {
    case "legalName":
      return "Denumire legală";
    case "brand":
      return "Brand (denumire comercială)";
    case "fiscalId":
      return "Identificator fiscal (CIF)";
    case "tradeRegister":
      return "Nr. Registrul Comerțului";
    case "address":
      return "Adresă";
    case "locality":
      return "Localitate";
    case "iban":
      return "IBAN";
    case "bank":
      return "Bancă";
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export type SellerProfileVersion = {
  version: number;
  values: SellerProfileInput;
  changedFields: readonly SellerField[];
  createdAt: string;
  createdByUserId: string;
  createdByLabel: string;
};

export function changedSellerFields(
  previous: SellerProfileInput | null,
  next: SellerProfileInput,
): SellerField[] {
  return SELLER_FIELDS.filter((field) => (previous?.[field] ?? "") !== next[field]);
}
