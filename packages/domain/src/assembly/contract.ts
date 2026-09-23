import { ACM_CASSETTE_NONE_PRODUCT_CODE, ACM_CASSETTE_NONE_TEMPLATE_VERSION } from "../product/acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import { LOGO_PRODUCT_CODE } from "../product/logoFrontlitPlexiAl06.js";

export const ASSEMBLY_CONTRACT_VERSION = "product-assembly-v1" as const;
export const ASSEMBLY_CONTRACT_VERSION_V2 = "product-assembly-v2" as const;
export const SIGN_ASSEMBLY_ACM_LETTERS_V1 = "SIGN_ASSEMBLY_ACM_LETTERS_V1" as const;
export const SIGN_ASSEMBLY_ACM_SIGNAGE_V2 = "SIGN_ASSEMBLY_ACM_SIGNAGE_V2" as const;
export const LETTERS_ON_ACM_PANEL = "LETTERS_ON_ACM_PANEL" as const;
export const LOGO_ON_ACM_PANEL = "LOGO_ON_ACM_PANEL" as const;

export const ASSEMBLY_KINDS = [
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
] as const;
export type AssemblyKind = (typeof ASSEMBLY_KINDS)[number];

export const ASSEMBLY_CONTRACT_VERSIONS = [
  ASSEMBLY_CONTRACT_VERSION,
  ASSEMBLY_CONTRACT_VERSION_V2,
] as const;
export type AssemblyContractVersion = (typeof ASSEMBLY_CONTRACT_VERSIONS)[number];

export const ASSEMBLY_RELATION_KINDS = [LETTERS_ON_ACM_PANEL, LOGO_ON_ACM_PANEL] as const;
export type AssemblyRelationKind = (typeof ASSEMBLY_RELATION_KINDS)[number];

export const ASSEMBLY_MEMBER_ROLES = ["SUPPORT_PANEL", "SIGNAGE_LETTERS", "SIGNAGE_LOGO"] as const;
export type AssemblyMemberRole = (typeof ASSEMBLY_MEMBER_ROLES)[number];

export const ASSEMBLY_DEFINITION_STATUSES = ["DRAFT", "STALE", "CONFIRMED"] as const;
export type AssemblyDefinitionStatus = (typeof ASSEMBLY_DEFINITION_STATUSES)[number];

export const ASSEMBLY_OFFERING_LABEL = "Panou ACM + litere volumetrice";
export const ASSEMBLY_V2_LOGO_LABEL = "Panou ACM + logo volumetric";
export const ASSEMBLY_V2_FULL_LABEL = "Panou ACM + litere + logo volumetric";
export const ASSEMBLY_RELATION_COMMERCIAL_PRICE = null;

export const SUPPORT_PANEL_LABEL = "Panou ACM";
export const SIGNAGE_LETTERS_LABEL = "Litere";
export const SIGNAGE_LOGO_LABEL = "Logo";
export const ASSEMBLY_RELATION_LABEL = "Ansamblare";
export const ASSEMBLY_RELATION_SUMMARY = "Literele se montează pe panoul ACM.";
export const ASSEMBLY_V2_RELATION_SUMMARY = "Logo-ul se montează pe panoul ACM.";
export const ASSEMBLY_V2_FULL_RELATION_SUMMARY =
  "Literele și logo-ul se montează separat pe panoul ACM.";
export const MOUNT_LETTERS_ON_PANEL_LABEL = "Montaj litere pe panou";
export const MOUNT_LOGO_ON_PANEL_LABEL = "Montaj logo pe panou";
export const ASSEMBLY_QC_LABEL = "Control final";

export const SIGN_ASSEMBLY_ACM_LETTERS = {
  kind: SIGN_ASSEMBLY_ACM_LETTERS_V1,
  contractVersion: ASSEMBLY_CONTRACT_VERSION,
  label: ASSEMBLY_OFFERING_LABEL,
  supportProductCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
  supportTemplateVersion: ACM_CASSETTE_NONE_TEMPLATE_VERSION,
  lettersProductCode: CANONICAL_PRODUCT_CODE,
  lettersTemplateVersion: "1",
  relationKind: LETTERS_ON_ACM_PANEL,
} as const;

export const SIGN_ASSEMBLY_ACM_SIGNAGE = {
  kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  contractVersion: ASSEMBLY_CONTRACT_VERSION_V2,
  supportProductCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
  supportTemplateVersion: ACM_CASSETTE_NONE_TEMPLATE_VERSION,
  logoProductCode: LOGO_PRODUCT_CODE,
  logoTemplateVersion: "1",
  lettersProductCode: CANONICAL_PRODUCT_CODE,
  lettersTemplateVersion: "1",
  logoRelationKind: LOGO_ON_ACM_PANEL,
  lettersRelationKind: LETTERS_ON_ACM_PANEL,
} as const;

export function isAssemblyKind(value: string): value is AssemblyKind {
  return (ASSEMBLY_KINDS as readonly string[]).includes(value);
}

export function contractVersionForKind(kind: AssemblyKind): AssemblyContractVersion {
  switch (kind) {
    case "SIGN_ASSEMBLY_ACM_LETTERS_V1":
      return ASSEMBLY_CONTRACT_VERSION;
    case "SIGN_ASSEMBLY_ACM_SIGNAGE_V2":
      return ASSEMBLY_CONTRACT_VERSION_V2;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function rolesForAssemblyKind(kind: AssemblyKind): readonly AssemblyMemberRole[] {
  switch (kind) {
    case "SIGN_ASSEMBLY_ACM_LETTERS_V1":
      return ["SUPPORT_PANEL", "SIGNAGE_LETTERS"];
    case "SIGN_ASSEMBLY_ACM_SIGNAGE_V2":
      return ["SUPPORT_PANEL", "SIGNAGE_LOGO", "SIGNAGE_LETTERS"];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function assemblyRoleLabel(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return SUPPORT_PANEL_LABEL;
    case "SIGNAGE_LETTERS":
      return SIGNAGE_LETTERS_LABEL;
    case "SIGNAGE_LOGO":
      return SIGNAGE_LOGO_LABEL;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function assemblyOfferingLabelFor(
  kind: AssemblyKind,
  roles: readonly AssemblyMemberRole[],
): string {
  switch (kind) {
    case "SIGN_ASSEMBLY_ACM_LETTERS_V1":
      return ASSEMBLY_OFFERING_LABEL;
    case "SIGN_ASSEMBLY_ACM_SIGNAGE_V2":
      return roles.includes("SIGNAGE_LETTERS") ? ASSEMBLY_V2_FULL_LABEL : ASSEMBLY_V2_LOGO_LABEL;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function assemblyStatusLabel(status: AssemblyDefinitionStatus): string {
  switch (status) {
    case "DRAFT":
      return "Ciornă";
    case "STALE":
      return "Necesită revizuire";
    case "CONFIRMED":
      return "Confirmat";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function productCodeForRole(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return SIGN_ASSEMBLY_ACM_LETTERS.supportProductCode;
    case "SIGNAGE_LETTERS":
      return SIGN_ASSEMBLY_ACM_LETTERS.lettersProductCode;
    case "SIGNAGE_LOGO":
      return SIGN_ASSEMBLY_ACM_SIGNAGE.logoProductCode;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function templateVersionForRole(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return SIGN_ASSEMBLY_ACM_LETTERS.supportTemplateVersion;
    case "SIGNAGE_LETTERS":
      return SIGN_ASSEMBLY_ACM_LETTERS.lettersTemplateVersion;
    case "SIGNAGE_LOGO":
      return SIGN_ASSEMBLY_ACM_SIGNAGE.logoTemplateVersion;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function mountProcessForRelation(
  kind: AssemblyRelationKind,
): "MOUNT_LETTERS_ON_PANEL" | "MOUNT_LOGO_ON_PANEL" {
  switch (kind) {
    case "LETTERS_ON_ACM_PANEL":
      return "MOUNT_LETTERS_ON_PANEL";
    case "LOGO_ON_ACM_PANEL":
      return "MOUNT_LOGO_ON_PANEL";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
