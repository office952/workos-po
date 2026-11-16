import {
  SELLER_IBAN_MAX_LENGTH,
  SELLER_TEXT_MAX_LENGTH,
  type SellerProfile,
  type SellerProfileInput,
} from "./identity.js";

/**
 * Commercial & Financial V1 · company identity validation, completeness and versions.
 *
 * The seller profile has the eight existing fields only and no country field, so the jurisdiction
 * is never inferred from an ambiguous value. The Romanian rule (published control digit, key
 * 753217532) applies only when the identifier itself declares the country with the "RO" prefix.
 * Any other value (including digits only) gets a structural check and is explicitly reported as
 * "țara nu este cunoscută" — no country-specific fiscal check is claimed. A valid control digit
 * never proves that the company exists.
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
  | { kind: "RO_PREFIX_VALID"; normalized: string }
  | { kind: "RO_PREFIX_CONTROL_MISMATCH"; normalized: string }
  | { kind: "JURISDICTION_UNKNOWN" }
  | { kind: "INVALID_FORMAT" };

/** Only an explicit country prefix selects the Romanian rule (EU VAT notation). */
const RO_PREFIXED_CUI = /^RO\s*(\d{2,10})$/i;
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
  const ro = RO_PREFIXED_CUI.exec(trimmed);
  if (ro) {
    const normalized = `RO${ro[1]!}`;
    return isValidRomanianCui(ro[1]!)
      ? { kind: "RO_PREFIX_VALID", normalized }
      : { kind: "RO_PREFIX_CONTROL_MISMATCH", normalized };
  }
  return GENERIC_FISCAL_ID.test(trimmed) ? { kind: "JURISDICTION_UNKNOWN" } : { kind: "INVALID_FORMAT" };
}

export function fiscalIdCheckLabel(check: FiscalIdCheck): string {
  switch (check.kind) {
    case "EMPTY":
      return "Necompletat";
    case "RO_PREFIX_VALID":
      return "Prefix RO: cifra de control a CIF-ului românesc este corectă. Nu confirmă existența firmei.";
    case "RO_PREFIX_CONTROL_MISMATCH":
      return "Prefix RO: cifra de control a CIF-ului românesc nu corespunde.";
    case "JURISDICTION_UNKNOWN":
      return "Țara nu este cunoscută: identificatorul este verificat doar ca format, fără o validare fiscală specifică unei țări. Pentru verificarea CIF-ului românesc, scrie-l cu prefixul RO.";
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
 * Compatibility: a Romanian control-digit mismatch (explicit "RO" prefix) is a warning, not a
 * refusal, so organizations whose stored value predates V1 can still save; an unknown jurisdiction
 * is reported, never refused. An IBAN, when given, must pass ISO 13616.
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
  } else if (fiscal.kind === "RO_PREFIX_CONTROL_MISMATCH") {
    warnings.push({
      field: "fiscalId",
      reason: "Prefix RO: cifra de control a CIF-ului românesc nu corespunde. Verifică valoarea.",
    });
  } else if (fiscal.kind === "JURISDICTION_UNKNOWN") {
    warnings.push({ field: "fiscalId", reason: fiscalIdCheckLabel(fiscal) });
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
      fiscalId:
        fiscal.kind === "RO_PREFIX_VALID" || fiscal.kind === "RO_PREFIX_CONTROL_MISMATCH"
          ? fiscal.normalized
          : text("fiscalId"),
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
