export const CONFIGURATION_STATUSES = [
  "DRAFT",
  "NEEDS_CONFIRMATION",
  "ACTIVE",
  "RETIRED",
] as const;
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];

export const CONFIGURATION_SOURCES = ["CODE_DEFAULT", "ORGANIZATION"] as const;
export type ConfigurationSource = (typeof CONFIGURATION_SOURCES)[number];

export const CONFIGURATION_SCOPES = ["ORGANIZATION"] as const;
export type ConfigurationScope = (typeof CONFIGURATION_SCOPES)[number];

export type ConfigurationVersionIdentity = {
  definitionId: string;
  version: number;
};

export const CONFIGURATION_OWNER_DOMAINS = ["COMMERCIAL"] as const;
export type ConfigurationOwnerDomain = (typeof CONFIGURATION_OWNER_DOMAINS)[number];

export const CONFIGURATION_OVERRIDE_POLICIES = ["NONE"] as const;
export type ConfigurationOverridePolicy =
  (typeof CONFIGURATION_OVERRIDE_POLICIES)[number];

export const COMMERCIAL_POLICY_DEFINITION = {
  definitionId: "DEFAULT_COMMERCIAL_POLICY",
  ownerDomain: "COMMERCIAL",
  allowedScopes: ["ORGANIZATION"],
  overridePolicy: "NONE",
} as const;

export function isConfigurationStatus(
  value: string,
): value is ConfigurationStatus {
  return (CONFIGURATION_STATUSES as readonly string[]).includes(value);
}

export function isConfigurationSource(
  value: string,
): value is ConfigurationSource {
  return (CONFIGURATION_SOURCES as readonly string[]).includes(value);
}
