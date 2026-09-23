import { getProductTemplate } from "../product/productRegistry.js";
import type { ProductAggregate, ProductTruth } from "../product/types.js";
import { isTemplateEnabledForNewWork } from "../product/productEnablement.js";
import type { ProductEnablementResolution } from "../product/productEnablement.js";
import { contentHash } from "./canonical.js";
import {
  ASSEMBLY_CONTRACT_VERSION,
  LETTERS_ON_ACM_PANEL,
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  productCodeForRole,
  templateVersionForRole,
  type AssemblyMemberRole,
} from "./contract.js";
import type {
  AssemblyAggregate,
  AssemblyDefinition,
  AssemblyMember,
  AssemblyRelation,
  AssemblyRuleFailure,
  AssemblyTruth,
  ConfirmedChildProduct,
} from "./model.js";

const STALE_REASON =
  "Un produs din ansamblu a fost reconfirmat. Revizuiește ansamblul înainte de o nouă confirmare.";

export function hashProductTruth(truth: ProductTruth): string {
  return contentHash({
    templateCode: truth.templateCode,
    templateVersion: truth.templateVersion,
    familyId: truth.familyId,
    selectedComponentIds: [...truth.selectedComponentIds],
    values: truth.values,
    measurements: truth.measurements.map((item) => ({ ...item })),
    reviewId: truth.reviewId,
  });
}

export function hashProductAggregate(aggregate: ProductAggregate): string {
  return contentHash({
    productLabel: aggregate.productLabel,
    components: aggregate.components.map((item) => item.id),
    quantities: aggregate.quantities.map((item) => ({
      id: item.id,
      componentId: item.componentId,
      value: item.value,
      unit: item.unit,
    })),
  });
}

export function assemblyAvailableForNewWork(
  resolution: ProductEnablementResolution,
): boolean {
  if (!resolution.ok) {
    return false;
  }
  return (
    isTemplateEnabledForNewWork(
      productCodeForRole("SUPPORT_PANEL"),
      resolution,
    ) &&
    isTemplateEnabledForNewWork(
      productCodeForRole("SIGNAGE_LETTERS"),
      resolution,
    )
  );
}

export function createAssemblyDefinition(input: {
  assemblyId: string;
  organizationId: string;
  requestId: string | null;
  customerId: string | null;
  resolution: ProductEnablementResolution;
  createdAt: string;
}): { ok: true; definition: AssemblyDefinition } | AssemblyRuleFailure {
  if (!assemblyAvailableForNewWork(input.resolution)) {
    return {
      ok: false,
      error: "assembly_unavailable",
      reasons: [
        "Ansamblul poate fi deschis doar când panoul ACM și literele sunt oferite pentru lucrări noi.",
      ],
    };
  }
  return {
    ok: true,
    definition: {
      assemblyId: input.assemblyId,
      organizationId: input.organizationId,
      requestId: input.requestId,
      customerId: input.customerId,
      kind: SIGN_ASSEMBLY_ACM_LETTERS_V1,
      contractVersion: ASSEMBLY_CONTRACT_VERSION,
      status: "DRAFT",
      members: [],
      relations: [],
      confirmedTruthId: null,
      confirmedTruthHash: null,
      staleReason: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  };
}

export function memberIdForRole(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return "member:support-panel";
    case "SIGNAGE_LETTERS":
      return "member:signage-letters";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function attachConfirmedChild(
  definition: AssemblyDefinition,
  child: ConfirmedChildProduct,
  role: AssemblyMemberRole,
  updatedAt: string,
): { ok: true; definition: AssemblyDefinition } | AssemblyRuleFailure {
  if (child.organizationId !== definition.organizationId) {
    return {
      ok: false,
      error: "cross_organization",
      reasons: ["Produsul confirmat aparține altei organizații."],
    };
  }
  if (child.productCode !== productCodeForRole(role)) {
    return {
      ok: false,
      error: "wrong_template",
      reasons: ["Produsul nu este permis în acest rol al ansamblului."],
    };
  }
  if (
    child.templateVersion !== templateVersionForRole(role) ||
    getProductTemplate(child.productCode)?.version !== child.templateVersion
  ) {
    return {
      ok: false,
      error: "wrong_template",
      reasons: ["Versiunea șablonului nu este cea permisă pentru acest ansamblu."],
    };
  }
  if (child.truthId.trim() === "" || child.truthHash.trim() === "") {
    return {
      ok: false,
      error: "unconfirmed_child",
      reasons: ["Produsul trebuie confirmat înainte de a intra în ansamblu."],
    };
  }
  const member: AssemblyMember = {
    memberId: memberIdForRole(role),
    role,
    productCode: child.productCode,
    templateCode: child.templateCode,
    templateVersion: child.templateVersion,
    organizationId: child.organizationId,
    confirmedTruthId: child.truthId,
    confirmedTruthHash: child.truthHash,
    confirmedAggregateHash: child.aggregateHash,
    childQuoteSnapshotId: child.childQuoteSnapshotId,
    childQuoteContentHash: child.childQuoteContentHash,
  };
  const members = [
    ...definition.members.filter((item) => item.role !== role),
    member,
  ].sort((left, right) => left.role.localeCompare(right.role));
  const relations = relationsForMembers(members);
  const next: AssemblyDefinition = {
    ...definition,
    members,
    relations,
    updatedAt,
    status: definition.status,
    staleReason: definition.staleReason,
  };
  return { ok: true, definition: applyStaleAgainstConfirmedTruth(next) };
}

export function acknowledgeAssemblyReview(
  definition: AssemblyDefinition,
  updatedAt: string,
): { ok: true; definition: AssemblyDefinition } | AssemblyRuleFailure {
  if (definition.status !== "STALE") {
    return {
      ok: false,
      error: "review_required",
      reasons: ["Ansamblul nu așteaptă revizuire."],
    };
  }
  return {
    ok: true,
    definition: {
      ...definition,
      status: "DRAFT",
      staleReason: null,
      updatedAt,
    },
  };
}

export function confirmAssembly(
  definition: AssemblyDefinition,
  children: readonly ConfirmedChildProduct[],
  previousTruths: readonly AssemblyTruth[],
  confirmedAt: string,
):
  | { ok: true; definition: AssemblyDefinition; truth: AssemblyTruth; aggregate: AssemblyAggregate }
  | AssemblyRuleFailure {
  if (definition.status === "STALE") {
    return {
      ok: false,
      error: "review_required",
      reasons: [STALE_REASON],
    };
  }
  const invalid = validateCombination(definition, children);
  if (invalid) {
    return invalid;
  }
  const truthBody = {
    assemblyId: definition.assemblyId,
    organizationId: definition.organizationId,
    requestId: definition.requestId,
    kind: definition.kind,
    contractVersion: definition.contractVersion,
    members: definition.members.map(copyMember),
    relations: definition.relations.map(copyRelation),
  };
  const hash = contentHash(truthBody);
  const existing = previousTruths.find((item) => item.contentHash === hash);
  const truth: AssemblyTruth = existing ?? {
    assemblyTruthId: `asmt:${hash.slice(0, 24)}`,
    ...truthBody,
    contentHash: hash,
    confirmedAt,
  };
  if (existing && existing.assemblyId !== definition.assemblyId) {
    return {
      ok: false,
      error: "cross_organization",
      reasons: ["Adevărul de ansamblu nu poate fi reutilizat între lucrări."],
    };
  }
  const aggregate = aggregateFromTruth(truth);
  return {
    ok: true,
    truth,
    aggregate,
    definition: {
      ...definition,
      status: "CONFIRMED",
      confirmedTruthId: truth.assemblyTruthId,
      confirmedTruthHash: truth.contentHash,
      staleReason: null,
      updatedAt: confirmedAt,
    },
  };
}

export function aggregateFromTruth(truth: AssemblyTruth): AssemblyAggregate {
  return {
    derivedFrom: "AssemblyTruth",
    assemblyTruthId: truth.assemblyTruthId,
    contentHash: truth.contentHash,
    childAggregates: truth.members.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      productCode: member.productCode,
      aggregateHash: member.confirmedAggregateHash,
    })),
    relationConsequences: truth.relations.map((relation) => ({
      relationId: relation.relationId,
      processId: "MOUNT_LETTERS_ON_PANEL" as const,
    })),
    assemblyDemand: [],
  };
}

function applyStaleAgainstConfirmedTruth(
  definition: AssemblyDefinition,
): AssemblyDefinition {
  if (!definition.confirmedTruthHash) {
    return { ...definition, status: definition.status === "STALE" ? "STALE" : "DRAFT" };
  }
  const current = contentHash({
    assemblyId: definition.assemblyId,
    organizationId: definition.organizationId,
    requestId: definition.requestId,
    kind: definition.kind,
    contractVersion: definition.contractVersion,
    members: definition.members.map(copyMember),
    relations: definition.relations.map(copyRelation),
  });
  if (current === definition.confirmedTruthHash) {
    return {
      ...definition,
      status: "CONFIRMED",
      staleReason: null,
    };
  }
  return {
    ...definition,
    status: "STALE",
    staleReason: STALE_REASON,
  };
}

function validateCombination(
  definition: AssemblyDefinition,
  children: readonly ConfirmedChildProduct[],
): AssemblyRuleFailure | null {
  const support = definition.members.filter((item) => item.role === "SUPPORT_PANEL");
  const letters = definition.members.filter((item) => item.role === "SIGNAGE_LETTERS");
  if (support.length !== 1 || letters.length !== 1) {
    return {
      ok: false,
      error: support.length + letters.length < 2 ? "missing_member" : "duplicate_role",
      reasons: ["Ansamblul are nevoie de exact un panou ACM și exact un set de litere."],
    };
  }
  if (definition.relations.length !== 1) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relația dintre litere și panou lipsește."],
    };
  }
  const relation = definition.relations[0];
  if (!relation) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relația dintre litere și panou lipsește."],
    };
  }
  if (relation.kind !== LETTERS_ON_ACM_PANEL) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relația permisă este montarea literelor pe panoul ACM."],
    };
  }
  if (relation.sourceMemberId === relation.targetMemberId) {
    return {
      ok: false,
      error: "self_relation",
      reasons: ["Un membru nu poate fi legat de el însuși."],
    };
  }
  if (
    relation.sourceMemberId !== letters[0]?.memberId ||
    relation.targetMemberId !== support[0]?.memberId
  ) {
    return {
      ok: false,
      error: "wrong_role",
      reasons: ["Literele trebuie legate către panoul ACM."],
    };
  }
  for (const member of definition.members) {
    const child = children.find((item) => item.truthId === member.confirmedTruthId);
    if (!child) {
      return {
        ok: false,
        error: "unconfirmed_child",
        reasons: ["Fiecare produs din ansamblu trebuie să aibă o confirmare păstrată."],
      };
    }
    if (child.organizationId !== definition.organizationId) {
      return {
        ok: false,
        error: "cross_organization",
        reasons: ["Produsul confirmat aparține altei organizații."],
      };
    }
    if (
      child.truthHash !== member.confirmedTruthHash ||
      child.aggregateHash !== member.confirmedAggregateHash ||
      child.childQuoteContentHash !== member.childQuoteContentHash
    ) {
      return {
        ok: false,
        error: "stale_child",
        reasons: ["Referința produsului nu mai corespunde confirmării păstrate."],
      };
    }
    if (child.commercial.completeness !== "COMPLETE") {
      return {
        ok: false,
        error: "incomplete_commercial",
        reasons: ["Prețul comercial al unui produs nu este complet."],
      };
    }
  }
  return null;
}

function relationsForMembers(members: readonly AssemblyMember[]): AssemblyRelation[] {
  const letters = members.find((item) => item.role === "SIGNAGE_LETTERS");
  const support = members.find((item) => item.role === "SUPPORT_PANEL");
  if (!letters || !support) {
    return [];
  }
  return [
    {
      relationId: "relation:letters-on-acm-panel",
      kind: LETTERS_ON_ACM_PANEL,
      sourceMemberId: letters.memberId,
      targetMemberId: support.memberId,
    },
  ];
}

function copyMember(member: AssemblyMember): AssemblyMember {
  return { ...member };
}

function copyRelation(relation: AssemblyRelation): AssemblyRelation {
  return { ...relation };
}
