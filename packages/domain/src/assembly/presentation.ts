import {
  ASSEMBLY_RELATION_SUMMARY,
  ASSEMBLY_V2_FULL_RELATION_SUMMARY,
  ASSEMBLY_V2_RELATION_SUMMARY,
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  assemblyOfferingLabelFor,
  assemblyRoleLabel,
  assemblyStatusLabel,
  productCodeForRole,
} from "./contract.js";
import type { AssemblyDefinition, AssemblyTruth } from "./model.js";
import type {
  AssemblyOrderSnapshot,
  AssemblyProductionSnapshot,
  AssemblyQuoteSnapshot,
} from "./snapshots.js";

export type AssemblyReviewPresentation = {
  assemblyId: string;
  label: string;
  status: AssemblyDefinition["status"];
  statusLabel: string;
  stale: boolean;
  staleReason: string | null;
  canConfirm: boolean;
  scopes: readonly {
    id: "acm" | "logo" | "letters" | "relation" | "summary";
    title: string;
    complete: boolean;
    summary: string;
    productCode: string | null;
    role: string | null;
  }[];
  quote: {
    label: string;
    sections: readonly { title: string; inscription: string; grossPrice: number }[];
    netPrice: number;
    vatAmount: number;
    grossPrice: number;
    currency: "EUR";
  } | null;
  orderId: string | null;
  productionId: string | null;
  executionPlanId: string | null;
};

export function presentAssemblyReview(input: {
  definition: AssemblyDefinition;
  truth: AssemblyTruth | null;
  quote: AssemblyQuoteSnapshot | null;
  order: AssemblyOrderSnapshot | null;
  production: AssemblyProductionSnapshot | null;
  executionPlanId: string | null;
  lettersSelectable?: boolean;
}): AssemblyReviewPresentation {
  const support = input.definition.members.find((member) => member.role === "SUPPORT_PANEL");
  const letters = input.definition.members.find((member) => member.role === "SIGNAGE_LETTERS");
  const logo = input.definition.members.find((member) => member.role === "SIGNAGE_LOGO");
  const v1 = input.definition.kind === SIGN_ASSEMBLY_ACM_LETTERS_V1;
  const showLetters = v1 || input.lettersSelectable === true || Boolean(letters);
  const relationsReady = v1
    ? input.definition.relations.length === 1
    : Boolean(logo && support) &&
      input.definition.relations.some((item) => item.kind === "LOGO_ON_ACM_PANEL") &&
      (letters
        ? input.definition.relations.some((item) => item.kind === "LETTERS_ON_ACM_PANEL")
        : !input.definition.relations.some((item) => item.kind === "LETTERS_ON_ACM_PANEL"));
  const ready = v1 ? Boolean(support && letters && relationsReady) : Boolean(support && logo && relationsReady);
  const roles = input.definition.members.map((member) => member.role);
  const scopes: AssemblyReviewPresentation["scopes"][number][] = [
    {
      id: "acm",
      title: assemblyRoleLabel("SUPPORT_PANEL"),
      complete: Boolean(support),
      summary: support ? "Panoul ACM este confirmat." : "Panoul ACM mai necesită confirmare.",
      productCode: productCodeForRole("SUPPORT_PANEL"),
      role: "SUPPORT_PANEL",
    },
  ];
  if (!v1) {
    scopes.push({
      id: "logo",
      title: assemblyRoleLabel("SIGNAGE_LOGO"),
      complete: Boolean(logo),
      summary: logo ? "Logo-ul este confirmat." : "Logo-ul mai necesită confirmare.",
      productCode: productCodeForRole("SIGNAGE_LOGO"),
      role: "SIGNAGE_LOGO",
    });
  }
  if (showLetters) {
    scopes.push({
      id: "letters",
      title: assemblyRoleLabel("SIGNAGE_LETTERS"),
      complete: Boolean(letters),
      summary: letters
        ? "Literele sunt confirmate."
        : v1
          ? "Literele mai necesită confirmare."
          : "Literele sunt opționale.",
      productCode: productCodeForRole("SIGNAGE_LETTERS"),
      role: "SIGNAGE_LETTERS",
    });
  }
  scopes.push(
    {
      id: "relation",
      title: "Ansamblare",
      complete: relationsReady,
      summary: v1
        ? ASSEMBLY_RELATION_SUMMARY
        : letters
          ? ASSEMBLY_V2_FULL_RELATION_SUMMARY
          : ASSEMBLY_V2_RELATION_SUMMARY,
      productCode: null,
      role: null,
    },
    {
      id: "summary",
      title: "Rezumat ansamblu",
      complete: ready,
      summary: ready
        ? v1
          ? "Ansamblul conține panoul ACM și literele volumetrice."
          : letters
            ? "Ansamblul conține panoul ACM, literele și logo-ul."
            : "Ansamblul conține panoul ACM și logo-ul."
        : "Ansamblul nu este complet.",
      productCode: null,
      role: null,
    },
  );
  return {
    assemblyId: input.definition.assemblyId,
    label: assemblyOfferingLabelFor(input.definition.kind, roles),
    status: input.definition.status,
    statusLabel: assemblyStatusLabel(input.definition.status),
    stale: input.definition.status === "STALE",
    staleReason: input.definition.staleReason,
    canConfirm: input.definition.status === "DRAFT" && ready,
    scopes,
    quote: input.quote
      ? {
          label: input.quote.label,
          sections: [
            ...input.quote.members.map((member) => ({
              title: member.roleLabel,
              inscription: member.inscription,
              grossPrice: member.commercial.grossPrice,
            })),
            ...(input.quote.serviceLine
              ? [{
                  title: input.quote.serviceLine.label,
                  inscription: "Serviciu",
                  grossPrice: input.quote.serviceLine.commercial.grossPrice,
                }]
              : []),
          ],
          netPrice: input.quote.totals.netPrice,
          vatAmount: input.quote.totals.vatAmount,
          grossPrice: input.quote.totals.grossPrice,
          currency: "EUR",
        }
      : null,
    orderId: input.order?.orderSnapshotId ?? null,
    productionId: input.production?.snapshotId ?? null,
    executionPlanId: input.executionPlanId,
  };
}
