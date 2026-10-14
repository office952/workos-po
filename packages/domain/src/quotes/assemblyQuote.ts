import type { ConfirmedChildProduct } from "../assembly/model.js";
import type {
  AssemblyOrderSnapshot,
  AssemblyProductionSnapshot,
  AssemblyQuoteSnapshot,
} from "../assembly/snapshots.js";
import {
  formatCustomerMoney,
  quoteDocumentReference,
} from "../commercial/quoteDocument.js";
import { unpricedAssemblyProductionOperations } from "../assembly/composition.js";
import type { FrozenProductionOperation } from "../production/snapshot.js";
import { costCompletenessLabel } from "../resources/eic.js";
import { recipeForProcess, recipeQuantityBasisLabel } from "../resources/recipes.js";
import {
  deriveQuoteOverviewAttention,
  quoteOverviewHref,
  quoteOverviewKindLabel,
  quoteOverviewNextActionLabel,
  quoteOverviewStageLabel,
  type QuoteOverviewItem,
  type QuoteOverviewNextAction,
  type QuoteOverviewStage,
} from "./overview.js";

const SUPERSEDED_LABEL = "Înlocuită de o versiune mai nouă";

/** Assembly acceptance creates the order in one step, so there is no separate accepted stage. */
export function deriveAssemblyQuoteStage(order: AssemblyOrderSnapshot | null): QuoteOverviewStage {
  return order ? "ORDER_CREATED" : "QUOTE_CREATED";
}

export function projectAssemblyQuoteOverviewItem(input: {
  quote: AssemblyQuoteSnapshot;
  order: AssemblyOrderSnapshot | null;
  customer: { customerId: string; displayName: string } | null;
  requestReference: string | null;
  superseded: boolean;
}): QuoteOverviewItem {
  const stage = deriveAssemblyQuoteStage(input.order);
  const nextAction: QuoteOverviewNextAction = input.order ? "OPEN_ORDER" : "OPEN_ASSEMBLY";
  const attention =
    input.superseded && !input.order
      ? { needsAttention: false, attentionLabel: SUPERSEDED_LABEL }
      : deriveQuoteOverviewAttention(stage);
  return {
    quoteSnapshotId: input.quote.quoteSnapshotId,
    kind: "ASSEMBLY",
    kindLabel: quoteOverviewKindLabel("ASSEMBLY"),
    assemblyId: input.quote.assemblyId,
    sectionCount: input.quote.members.length,
    superseded: input.superseded,
    reference: quoteDocumentReference(input.quote.contentHash),
    productCode: input.quote.assemblyKind,
    productLabel: input.quote.label,
    inscription: input.quote.members
      .map((member) => member.inscription)
      .filter((value) => value.trim() !== "")
      .join(" · "),
    customerId: input.customer?.customerId ?? null,
    customerDisplayName: input.customer?.displayName ?? null,
    createdAt: input.quote.createdAt,
    grossDisplay: formatCustomerMoney(input.quote.totals.grossPrice),
    currency: input.quote.totals.currency,
    stage,
    stageLabel: quoteOverviewStageLabel(stage),
    nextAction,
    nextActionLabel: quoteOverviewNextActionLabel(nextAction),
    href: quoteOverviewHref({ quoteSnapshotId: input.quote.quoteSnapshotId }),
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    acceptanceId: null,
    orderSnapshotId: input.order?.orderSnapshotId ?? null,
    requestId: input.quote.requestId,
    requestReference: input.requestReference,
  };
}

/** Marks every assembly quote that is not the newest frozen quote of its assembly. */
export function supersededAssemblyQuoteIds(
  quotes: readonly AssemblyQuoteSnapshot[],
): ReadonlySet<string> {
  const latest = new Map<string, AssemblyQuoteSnapshot>();
  for (const quote of quotes) {
    const current = latest.get(quote.assemblyId);
    if (
      !current ||
      quote.createdAt > current.createdAt ||
      (quote.createdAt === current.createdAt && quote.quoteSnapshotId > current.quoteSnapshotId)
    ) {
      latest.set(quote.assemblyId, quote);
    }
  }
  return new Set(
    quotes
      .filter((quote) => latest.get(quote.assemblyId)?.quoteSnapshotId !== quote.quoteSnapshotId)
      .map((quote) => quote.quoteSnapshotId),
  );
}

export type AssemblyQuoteSection = {
  memberId: string;
  roleLabel: string;
  productLabel: string;
  inscription: string;
  netPrice: number;
  vatPercent: number;
  vatAmount: number;
  grossPrice: number;
  currency: "EUR";
};

export type AssemblyQuoteDetail = {
  quoteSnapshotId: string;
  reference: string;
  label: string;
  assemblyId: string;
  requestId: string | null;
  createdAt: string;
  superseded: boolean;
  sections: readonly AssemblyQuoteSection[];
  serviceSection: {
    label: string;
    netPrice: number;
    vatAmount: number;
    grossPrice: number;
    currency: "EUR";
  } | null;
  totals: { netPrice: number; vatAmount: number; grossPrice: number; currency: "EUR" };
  orderSnapshotId: string | null;
  productionSnapshotId: string | null;
};

export function presentAssemblyQuoteDetail(input: {
  quote: AssemblyQuoteSnapshot;
  order: AssemblyOrderSnapshot | null;
  production: AssemblyProductionSnapshot | null;
  superseded: boolean;
}): AssemblyQuoteDetail {
  const { quote } = input;
  return {
    quoteSnapshotId: quote.quoteSnapshotId,
    reference: quoteDocumentReference(quote.contentHash),
    label: quote.label,
    assemblyId: quote.assemblyId,
    requestId: quote.requestId,
    createdAt: quote.createdAt,
    superseded: input.superseded,
    sections: quote.members.map((member) => ({
      memberId: member.memberId,
      roleLabel: member.roleLabel,
      productLabel: member.productLabel,
      inscription: member.inscription,
      netPrice: member.commercial.netPrice,
      vatPercent: member.commercial.vatPercent,
      vatAmount: member.commercial.vatAmount,
      grossPrice: member.commercial.grossPrice,
      currency: member.commercial.currency,
    })),
    serviceSection: quote.serviceLine
      ? {
          label: quote.serviceLine.label,
          netPrice: quote.serviceLine.commercial.netPrice,
          vatAmount: quote.serviceLine.commercial.vatAmount,
          grossPrice: quote.serviceLine.commercial.grossPrice,
          currency: quote.serviceLine.commercial.currency,
        }
      : null,
    totals: {
      netPrice: quote.totals.netPrice,
      vatAmount: quote.totals.vatAmount,
      grossPrice: quote.totals.grossPrice,
      currency: quote.totals.currency,
    },
    orderSnapshotId: input.order?.orderSnapshotId ?? null,
    productionSnapshotId: input.production?.snapshotId ?? null,
  };
}

export type AssemblyQuoteCostSource = "CONFIRMED_MEMBERS" | "ORDER";

export type AssemblyQuoteUnpricedOperation = {
  processLabel: string;
  missingInputs: readonly string[];
};

/** Owner-only internal cost evidence. Never a selling price; PARTIAL is never treated as zero. */
export type AssemblyQuoteInternalCost = {
  source: AssemblyQuoteCostSource;
  sourceLabel: string;
  sections: readonly {
    memberId: string;
    roleLabel: string;
    total: number;
    currency: "EUR";
    completeness: "COMPLETE" | "PARTIAL";
    completenessLabel: string;
  }[];
  production: {
    total: number;
    currency: "EUR";
    completeness: "COMPLETE" | "PARTIAL";
    completenessLabel: string;
    unpricedOperations: readonly AssemblyQuoteUnpricedOperation[];
  } | null;
  /** Section costs before production are not summed: assembly reconciliation removes duplicated child work. */
  productionPending: boolean;
};

export function presentAssemblyQuoteInternalCost(input: {
  quote: AssemblyQuoteSnapshot;
  order: AssemblyOrderSnapshot | null;
  production: AssemblyProductionSnapshot | null;
  confirmedChildren: readonly ConfirmedChildProduct[];
}): AssemblyQuoteInternalCost | null {
  const roleLabels = new Map(input.quote.members.map((member) => [member.memberId, member.roleLabel]));
  const sections = input.order
    ? input.order.children.map((child) => ({
        memberId: child.memberId,
        total: child.eicTotal,
        completeness: child.eicCompleteness,
      }))
    : input.quote.members.flatMap((member) => {
        const child = input.confirmedChildren.find(
          (item) =>
            item.truthId === member.confirmedTruthId &&
            item.truthHash === member.confirmedTruthHash,
        );
        return child
          ? [{ memberId: member.memberId, total: child.eicTotal, completeness: child.eicCompleteness }]
          : [];
      });
  if (sections.length !== input.quote.members.length) {
    return null;
  }
  const production = input.production;
  return {
    source: input.order ? "ORDER" : "CONFIRMED_MEMBERS",
    sourceLabel: input.order ? "Comanda înghețată" : "Confirmarea produselor",
    sections: sections.map((section) => ({
      memberId: section.memberId,
      roleLabel: roleLabels.get(section.memberId) ?? section.memberId,
      total: section.total,
      currency: "EUR",
      completeness: section.completeness,
      completenessLabel: costCompletenessLabel(section.completeness),
    })),
    production: production
      ? {
          total: production.eicTotal,
          currency: production.eicCurrency,
          completeness: production.eicCompleteness,
          completenessLabel: costCompletenessLabel(production.eicCompleteness),
          unpricedOperations: unpricedAssemblyProductionOperations(production)
            .map((operation) => ({
              processLabel: operation.processLabel,
              missingInputs:
                frozenGapReason(input.order, production, operation.processId) ??
                assemblyOperationMissingCostInputs(operation),
            })),
        }
      : null,
    productionPending: production === null,
  };
}

function frozenGapReason(
  order: AssemblyOrderSnapshot | null,
  production: AssemblyProductionSnapshot,
  processId: string,
): string[] | null {
  if (production.operationCost?.evidenceStatus === "INVALID") {
    return ["Evidența de cost înghețată pentru ansamblare nu este coerentă"];
  }
  const line = order?.operationCost?.lines.find((item) => item.processId === processId);
  return line && "reason" in line ? [line.reason] : null;
}

/** Names the costing inputs an assembly operation lacks; it never proposes a rate. */
export function assemblyOperationMissingCostInputs(
  operation: Pick<FrozenProductionOperation, "processId" | "quantities">,
): string[] {
  const recipe = recipeForProcess(operation.processId);
  if (!recipe) {
    return [
      "Rețetă de cost pentru operație",
      "Bază de cantitate la nivel de ansamblu",
      "Tarif confirmat de organizație",
    ];
  }
  return operation.quantities.length === 0
    ? [`Cantitate la nivel de ansamblu (${recipeQuantityBasisLabel(recipe.quantityBasis)})`]
    : [];
}
