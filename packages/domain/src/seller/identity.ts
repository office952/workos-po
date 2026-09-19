export const SELLER_PROFILE_ID = "seller:current" as const;
export const SELLER_TEXT_MAX_LENGTH = 160;
export const SELLER_IBAN_MAX_LENGTH = 34;

export const OWNER_CONFIRMED_SELLER = {
  legalName: "HUB MEDIA PRODUCTION S.R.L.",
  brand: "HUB MEDIA PRODUCTION",
  fiscalId: "RO54481582",
  tradeRegister: "J2026024600006",
  address: "Șos. Sălaj, Nr. 351-353, Bl. 5, Et. 2, Ap. 22, Sector 5",
  locality: "București",
  iban: "RO81RZBR0000060030657337",
  bank: "RAIFFEISEN BANK",
} as const;

export const SELLER_MUTATION_ERRORS = ["invalid_profile", "not_found"] as const;
export type SellerMutationError = (typeof SELLER_MUTATION_ERRORS)[number];

export type SellerProfile = {
  profileId: typeof SELLER_PROFILE_ID;
  legalName: string;
  brand: string;
  fiscalId: string;
  tradeRegister: string;
  address: string;
  locality: string;
  iban: string;
  bank: string;
  updatedAt: string;
};

export type SellerProfileInput = {
  legalName: string;
  brand: string;
  fiscalId: string;
  tradeRegister: string;
  address: string;
  locality: string;
  iban: string;
  bank: string;
};

export type SellerMutationResult =
  | { ok: true; profile: SellerProfile; alreadyApplied: boolean }
  | { ok: false; error: SellerMutationError };

export type FrozenSellerIdentity = {
  legalName: string;
  brand?: string;
  fiscalId?: string;
  tradeRegister?: string;
  address?: string;
  locality?: string;
  iban?: string;
  bank?: string;
};

export function ownerConfirmedSellerProfile(updatedAt = "2026-08-17T00:00:00.000Z"): SellerProfile {
  return {
    profileId: SELLER_PROFILE_ID,
    ...OWNER_CONFIRMED_SELLER,
    updatedAt,
  };
}

export function initializeSellerProfile(
  input: SellerProfileInput,
  updatedAt = new Date().toISOString(),
): SellerMutationResult {
  const next = readSellerInput(input);
  if (!next) {
    return { ok: false, error: "invalid_profile" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    profile: {
      profileId: SELLER_PROFILE_ID,
      ...next,
      updatedAt,
    },
  };
}

export function updateSellerProfile(
  current: SellerProfile,
  input: SellerProfileInput,
  updatedAt = new Date().toISOString(),
): SellerMutationResult {
  const next = readSellerInput(input);
  if (!next) {
    return { ok: false, error: "invalid_profile" };
  }
  if (sameSellerFields(current, next)) {
    return { ok: true, profile: current, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    profile: {
      profileId: SELLER_PROFILE_ID,
      ...next,
      updatedAt,
    },
  };
}

export function sellerFromRow(
  profileId: string,
  legalName: string,
  brand: string,
  fiscalId: string,
  tradeRegister: string,
  address: string,
  locality: string,
  iban: string,
  bank: string,
  updatedAt: string,
): SellerProfile | null {
  if (profileId !== SELLER_PROFILE_ID || !legalName || !updatedAt) {
    return null;
  }
  const read = readSellerInput({
    legalName,
    brand,
    fiscalId,
    tradeRegister,
    address,
    locality,
    iban,
    bank,
  });
  if (!read) {
    return null;
  }
  return {
    profileId: SELLER_PROFILE_ID,
    ...read,
    updatedAt,
  };
}

export function freezeSellerIdentity(
  seller: SellerProfileInput | FrozenSellerIdentity,
): FrozenSellerIdentity | null {
  const legalName = readRequiredText(seller.legalName, SELLER_TEXT_MAX_LENGTH);
  if (!legalName) {
    return null;
  }
  return {
    legalName,
    ...optionalSellerField("brand", seller.brand),
    ...optionalSellerField("fiscalId", seller.fiscalId),
    ...optionalSellerField("tradeRegister", seller.tradeRegister),
    ...optionalSellerField("address", seller.address),
    ...optionalSellerField("locality", seller.locality),
    ...optionalSellerField("iban", seller.iban, SELLER_IBAN_MAX_LENGTH),
    ...optionalSellerField("bank", seller.bank),
  };
}

export function copyFrozenSellerIdentity(
  seller: FrozenSellerIdentity | undefined,
): FrozenSellerIdentity | undefined {
  if (!seller) {
    return undefined;
  }
  return freezeSellerIdentity(seller) ?? undefined;
}

function readSellerInput(input: SellerProfileInput): SellerProfileInput | null {
  const legalName = readRequiredText(input.legalName, SELLER_TEXT_MAX_LENGTH);
  if (!legalName) {
    return null;
  }
  return {
    legalName,
    brand: readOptionalText(input.brand, SELLER_TEXT_MAX_LENGTH) ?? "",
    fiscalId: readOptionalText(input.fiscalId, SELLER_TEXT_MAX_LENGTH) ?? "",
    tradeRegister: readOptionalText(input.tradeRegister, SELLER_TEXT_MAX_LENGTH) ?? "",
    address: readOptionalText(input.address, SELLER_TEXT_MAX_LENGTH) ?? "",
    locality: readOptionalText(input.locality, SELLER_TEXT_MAX_LENGTH) ?? "",
    iban: readOptionalText(input.iban, SELLER_IBAN_MAX_LENGTH) ?? "",
    bank: readOptionalText(input.bank, SELLER_TEXT_MAX_LENGTH) ?? "",
  };
}

function sameSellerFields(current: SellerProfile, next: SellerProfileInput): boolean {
  return (
    current.legalName === next.legalName &&
    current.brand === next.brand &&
    current.fiscalId === next.fiscalId &&
    current.tradeRegister === next.tradeRegister &&
    current.address === next.address &&
    current.locality === next.locality &&
    current.iban === next.iban &&
    current.bank === next.bank
  );
}

function optionalSellerField(
  key: keyof FrozenSellerIdentity,
  value: string | undefined,
  maxLength = SELLER_TEXT_MAX_LENGTH,
): Partial<FrozenSellerIdentity> {
  const text = readOptionalText(value, maxLength);
  return text ? { [key]: text } : {};
}

function readRequiredText(value: string | undefined, maxLength: number): string | null {
  const text = readOptionalText(value, maxLength);
  return text ?? null;
}

function readOptionalText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return undefined;
  }
  return trimmed;
}
