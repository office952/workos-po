import {
  ASSEMBLY_OFFERING_LABEL,
  ASSEMBLY_RELATION_SUMMARY,
  assemblyRoleLabel,
  assemblyStatusLabel,
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
    id: "acm" | "letters" | "relation" | "summary";
    title: string;
    complete: boolean;
    summary: string;
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
}): AssemblyReviewPresentation {
  const support = input.definition.members.find((member) => member.role === "SUPPORT_PANEL");
  const letters = input.definition.members.find((member) => member.role === "SIGNAGE_LETTERS");
  const bothConfirmed = Boolean(support && letters && input.definition.relations.length === 1);
  return {
    assemblyId: input.definition.assemblyId,
    label: ASSEMBLY_OFFERING_LABEL,
    status: input.definition.status,
    statusLabel: assemblyStatusLabel(input.definition.status),
    stale: input.definition.status === "STALE",
    staleReason: input.definition.staleReason,
    canConfirm: input.definition.status === "DRAFT" && bothConfirmed,
    scopes: [
      {
        id: "acm",
        title: assemblyRoleLabel("SUPPORT_PANEL"),
        complete: Boolean(support),
        summary: support ? "Panoul ACM este confirmat." : "Panoul ACM mai necesită confirmare.",
      },
      {
        id: "letters",
        title: assemblyRoleLabel("SIGNAGE_LETTERS"),
        complete: Boolean(letters),
        summary: letters ? "Literele sunt confirmate." : "Literele mai necesită confirmare.",
      },
      {
        id: "relation",
        title: "Ansamblare",
        complete: input.definition.relations.length === 1,
        summary: ASSEMBLY_RELATION_SUMMARY,
      },
      {
        id: "summary",
        title: "Rezumat ansamblu",
        complete: bothConfirmed,
        summary: bothConfirmed
          ? "Ansamblul conține panoul ACM și literele volumetrice."
          : "Ansamblul nu este complet.",
      },
    ],
    quote: input.quote
      ? {
          label: input.quote.label,
          sections: input.quote.members.map((member) => ({
            title: member.roleLabel,
            inscription: member.inscription,
            grossPrice: member.commercial.grossPrice,
          })),
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
