import { ACM_CASSETTE_NONE_PRODUCT_CODE, ACM_CASSETTE_NONE_TEMPLATE_VERSION } from "../product/acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";

export const ASSEMBLY_CONTRACT_VERSION = "product-assembly-v1" as const;
export const SIGN_ASSEMBLY_ACM_LETTERS_V1 = "SIGN_ASSEMBLY_ACM_LETTERS_V1" as const;
export const LETTERS_ON_ACM_PANEL = "LETTERS_ON_ACM_PANEL" as const;

export const ASSEMBLY_MEMBER_ROLES = ["SUPPORT_PANEL", "SIGNAGE_LETTERS"] as const;
export type AssemblyMemberRole = (typeof ASSEMBLY_MEMBER_ROLES)[number];

export const ASSEMBLY_DEFINITION_STATUSES = ["DRAFT", "STALE", "CONFIRMED"] as const;
export type AssemblyDefinitionStatus = (typeof ASSEMBLY_DEFINITION_STATUSES)[number];

export const ASSEMBLY_OFFERING_LABEL = "Panou ACM + litere volumetrice";
export const ASSEMBLY_RELATION_COMMERCIAL_PRICE = null;

export const SUPPORT_PANEL_LABEL = "Panou ACM";
export const SIGNAGE_LETTERS_LABEL = "Litere";
export const ASSEMBLY_RELATION_LABEL = "Ansamblare";
export const ASSEMBLY_RELATION_SUMMARY = "Literele se montează pe panoul ACM.";
export const MOUNT_LETTERS_ON_PANEL_LABEL = "Montaj litere pe panou";
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

export function assemblyRoleLabel(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return SUPPORT_PANEL_LABEL;
    case "SIGNAGE_LETTERS":
      return SIGNAGE_LETTERS_LABEL;
    default: {
      const _exhaustive: never = role;
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
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
