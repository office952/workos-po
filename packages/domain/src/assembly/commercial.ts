import type { FrozenCommercialOffer, FrozenJobCommercial } from "../commercial/quoteSnapshot.js";
import { contentHash } from "./canonical.js";
import {
  ASSEMBLY_RELATION_COMMERCIAL_PRICE,
  assemblyOfferingLabelFor,
  assemblyRoleLabel,
} from "./contract.js";
import type { AssemblyOrderSnapshot, AssemblyQuoteSnapshot } from "./snapshots.js";
import type { AssemblyRuleFailure, AssemblyTruth, ConfirmedChildProduct } from "./model.js";

export function freezeAssemblyQuote(input: {
  quoteSnapshotId: string;
  truth: AssemblyTruth;
  children: readonly ConfirmedChildProduct[];
  createdAt: string;
}): { ok: true; quote: AssemblyQuoteSnapshot } | AssemblyRuleFailure {
  const members = input.truth.members.map((member) => {
    const child = input.children.find((item) => item.truthId === member.confirmedTruthId);
    if (
      !child ||
      child.organizationId !== input.truth.organizationId ||
      child.productCode !== member.productCode ||
      child.templateVersion !== member.templateVersion ||
      child.truthHash !== member.confirmedTruthHash ||
      child.aggregateHash !== member.confirmedAggregateHash
    ) {
      return null;
    }
    if (
      !child.commercial ||
      child.commercial.completeness !== "COMPLETE" ||
      !child.childQuoteSnapshotId ||
      !child.childQuoteContentHash
    ) {
      return { incomplete: true as const };
    }
    return {
      memberId: member.memberId,
      role: member.role,
      roleLabel: assemblyRoleLabel(member.role),
      productCode: member.productCode,
      productLabel: child.productLabel,
      inscription: child.inscription,
      childQuoteSnapshotId: child.childQuoteSnapshotId,
      childQuoteContentHash: child.childQuoteContentHash,
      confirmedTruthId: child.truthId,
      confirmedTruthHash: child.truthHash,
      commercial: copyCommercial(child.commercial),
    };
  });
  if (members.some((item) => item !== null && "incomplete" in item)) {
    return {
      ok: false,
      error: "incomplete_commercial",
      reasons: ["Oferta de ansamblu cere un preț comercial complet pentru fiecare produs confirmat."],
    };
  }
  if (members.some((item) => item === null) || members.length !== input.truth.members.length) {
    return {
      ok: false,
      error: "stale_child",
      reasons: ["Oferta de ansamblu poate îngheța doar produsele confirmate în adevărul ansamblului."],
    };
  }
  const confirmed = members.flatMap((item) => (item && !("incomplete" in item) ? [item] : []));
  const published =
    input.truth.kind === "SIGN_ASSEMBLY_ACM_SIGNAGE_V2"
      ? [...confirmed].sort((left, right) => quoteMemberRank(left.role) - quoteMemberRank(right.role))
      : confirmed;
  const totals = sumCommercial(published.map((item) => item.commercial));
  const body = {
    schemaVersion: 1 as const,
    status: "FROZEN" as const,
    organizationId: input.truth.organizationId,
    requestId: input.truth.requestId,
    assemblyKind: input.truth.kind,
    assemblyContractVersion: input.truth.contractVersion,
    assemblyId: input.truth.assemblyId,
    assemblyTruthId: input.truth.assemblyTruthId,
    assemblyTruthHash: input.truth.contentHash,
    label: assemblyOfferingLabelFor(
      input.truth.kind,
      published.map((item) => item.role),
    ),
    members: published,
    relationCommercialPrice: ASSEMBLY_RELATION_COMMERCIAL_PRICE,
    totals,
  };
  return {
    ok: true,
    quote: {
      quoteSnapshotId: input.quoteSnapshotId,
      ...body,
      createdAt: input.createdAt,
      contentHash: contentHash(body),
    },
  };
}

export function acceptAssemblyQuote(input: {
  orderSnapshotId: string;
  quote: AssemblyQuoteSnapshot;
  children: readonly ConfirmedChildProduct[];
  createdAt: string;
}): { ok: true; order: AssemblyOrderSnapshot } | AssemblyRuleFailure {
  const childrenByTruth = new Map(input.children.map((child) => [child.truthId, child]));
  const frozenChildren = [];
  for (const member of input.quote.members) {
    const child = childrenByTruth.get(member.confirmedTruthId);
    if (
      !child ||
      !child.commercial ||
      !child.childQuoteSnapshotId ||
      child.organizationId !== input.quote.organizationId ||
      child.truthHash !== member.confirmedTruthHash ||
      child.childQuoteContentHash !== member.childQuoteContentHash
    ) {
      return {
        ok: false,
        error: "stale_child",
        reasons: ["Comanda poate păstra doar produsele înghețate în oferta acceptată."],
      };
    }
    frozenChildren.push({
      memberId: member.memberId,
      role: member.role,
      productCode: member.productCode,
      templateCode: child.templateCode,
      templateVersion: child.templateVersion,
      truthId: child.truthId,
      truthHash: child.truthHash,
      aggregateHash: child.aggregateHash,
      productLabel: child.productLabel,
      inscription: child.inscription,
      childQuoteSnapshotId: child.childQuoteSnapshotId,
      childQuoteContentHash: child.childQuoteContentHash,
      commercial: copyCommercial(child.commercial),
      productionInput: {
        schemaVersion: child.productionInput.schemaVersion,
        requirements: child.productionInput.requirements.map((item) => ({ ...item })),
        operations: child.productionInput.operations.map((item) => ({
          ...item,
          dependsOn: [...item.dependsOn],
          quantities: item.quantities.map((quantity) => ({ ...quantity })),
          resourceDemands: item.resourceDemands.map((demand) => ({ ...demand })),
        })),
        usedTechnicalSettings: child.productionInput.usedTechnicalSettings.map((item) => ({
          ...item,
        })),
        usedRecipes: child.productionInput.usedRecipes.map((item) => ({ ...item })),
        ...(child.productionInput.usedFormulas
          ? { usedFormulas: child.productionInput.usedFormulas.map((item) => ({ ...item })) }
          : {}),
        contentHash: child.productionInput.contentHash,
      },
      eicTotal: child.eicTotal,
      eicCurrency: child.eicCurrency,
      eicCompleteness: child.eicCompleteness,
    });
  }
  const body = {
    schemaVersion: 1 as const,
    status: "FROZEN" as const,
    organizationId: input.quote.organizationId,
    requestId: input.quote.requestId,
    sourceQuoteSnapshotId: input.quote.quoteSnapshotId,
    sourceQuoteContentHash: input.quote.contentHash,
    assemblyId: input.quote.assemblyId,
    assemblyTruthId: input.quote.assemblyTruthId,
    assemblyTruthHash: input.quote.assemblyTruthHash,
    assemblyKind: input.quote.assemblyKind,
    label: input.quote.label,
    members: input.quote.members.map((member) => ({ ...member, commercial: copyCommercial(member.commercial) })),
    children: frozenChildren,
    relationCommercialPrice: ASSEMBLY_RELATION_COMMERCIAL_PRICE,
    totals: { ...input.quote.totals },
  };
  return {
    ok: true,
    order: {
      orderSnapshotId: input.orderSnapshotId,
      ...body,
      createdAt: input.createdAt,
      contentHash: contentHash(body),
    },
  };
}

function quoteMemberRank(role: AssemblyQuoteSnapshot["members"][number]["role"]): number {
  switch (role) {
    case "SUPPORT_PANEL":
      return 0;
    case "SIGNAGE_LETTERS":
      return 1;
    case "SIGNAGE_LOGO":
      return 2;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function sumCommercial(
  offers: readonly FrozenCommercialOffer[],
): FrozenJobCommercial {
  return {
    netPrice: roundMoney(offers.reduce((sum, item) => sum + item.netPrice, 0)),
    vatAmount: roundMoney(offers.reduce((sum, item) => sum + item.vatAmount, 0)),
    grossPrice: roundMoney(offers.reduce((sum, item) => sum + item.grossPrice, 0)),
    currency: "EUR",
    completeness: "COMPLETE",
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function copyCommercial(offer: FrozenCommercialOffer): FrozenCommercialOffer {
  return { ...offer };
}
