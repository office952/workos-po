import { getProductTemplate } from "../product/productRegistry.js";
import type { ProductAggregate, ProductTruth } from "../product/types.js";
import { isTemplateEnabledForNewWork } from "../product/productEnablement.js";
import type { ProductEnablementResolution } from "../product/productEnablement.js";
import { LOGO_PRODUCT_CODE } from "../product/logoFrontlitPlexiAl06.js";
import { contentHash } from "./canonical.js";
import {
  LETTERS_ON_ACM_PANEL,
  LOGO_ON_ACM_PANEL,
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  contractVersionForKind,
  mountProcessForRelation,
  productCodeForRole,
  rolesForAssemblyKind,
  templateVersionForRole,
  type AssemblyKind,
  type AssemblyMemberRole,
  type AssemblyRelationKind,
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

export function assemblyV2AvailableForNewWork(
  resolution: ProductEnablementResolution,
): boolean {
  if (!resolution.ok) {
    return false;
  }
  return (
    isTemplateEnabledForNewWork(productCodeForRole("SUPPORT_PANEL"), resolution) &&
    isTemplateEnabledForNewWork(LOGO_PRODUCT_CODE, resolution)
  );
}

export function assemblyKindAvailableForNewWork(
  kind: AssemblyKind,
  resolution: ProductEnablementResolution,
): boolean {
  switch (kind) {
    case "SIGN_ASSEMBLY_ACM_LETTERS_V1":
      return assemblyAvailableForNewWork(resolution);
    case "SIGN_ASSEMBLY_ACM_SIGNAGE_V2":
      return assemblyV2AvailableForNewWork(resolution);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
export function createAssemblyDefinition(input: {
  assemblyId: string;
  organizationId: string;
  requestId: string | null;
  customerId: string | null;
  resolution: ProductEnablementResolution;
  createdAt: string;
  kind?: AssemblyKind;
}): { ok: true; definition: AssemblyDefinition } | AssemblyRuleFailure {
  const kind = input.kind ?? SIGN_ASSEMBLY_ACM_LETTERS_V1;
  if (!assemblyKindAvailableForNewWork(kind, input.resolution)) {
    return {
      ok: false,
      error: "assembly_unavailable",
      reasons: [
        kind === SIGN_ASSEMBLY_ACM_SIGNAGE_V2
          ? "Ansamblul poate fi deschis doar când panoul ACM și logo-ul sunt oferite pentru lucrări noi."
          : "Ansamblul poate fi deschis doar când panoul ACM și literele sunt oferite pentru lucrări noi.",
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
      kind,
      contractVersion: contractVersionForKind(kind),
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
    case "SIGNAGE_LOGO":
      return "member:signage-logo";
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
  if (!rolesForAssemblyKind(definition.kind).includes(role)) {
    return {
      ok: false,
      error: "wrong_role",
      reasons: ["Rolul nu este permis pentru acest tip de ansamblu."],
    };
  }
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
  };
  const members = [
    ...definition.members.filter((item) => item.role !== role),
    member,
  ].sort((left, right) => left.role.localeCompare(right.role));
  const relations = relationsForMembers(definition.kind, members);
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
      processId: mountProcessForRelation(relation.kind),
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
  const logos = definition.members.filter((item) => item.role === "SIGNAGE_LOGO");
  if (definition.kind === SIGN_ASSEMBLY_ACM_LETTERS_V1) {
    if (logos.length > 0) {
      return {
        ok: false,
        error: "wrong_role",
        reasons: ["Ansamblul de litere nu acceptă un logo."],
      };
    }
    if (support.length !== 1 || letters.length !== 1) {
      return {
        ok: false,
        error: support.length + letters.length < 2 ? "missing_member" : "duplicate_role",
        reasons: ["Ansamblul are nevoie de exact un panou ACM și exact un set de litere."],
      };
    }
  } else {
    if (support.length !== 1) {
      return {
        ok: false,
        error: support.length === 0 ? "missing_member" : "duplicate_role",
        reasons: ["Ansamblul are nevoie de exact un panou ACM."],
      };
    }
    if (logos.length !== 1) {
      return {
        ok: false,
        error: logos.length === 0 ? "missing_member" : "duplicate_role",
        reasons: ["Ansamblul are nevoie de exact un logo."],
      };
    }
    if (letters.length > 1) {
      return {
        ok: false,
        error: "duplicate_role",
        reasons: ["Ansamblul acceptă cel mult un set de litere."],
      };
    }
  }
  const relationError = validateRelations(definition, support[0], letters[0], logos[0]);
  if (relationError) {
    return relationError;
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
      child.productCode !== member.productCode ||
      child.productCode !== productCodeForRole(member.role) ||
      child.templateCode !== member.templateCode ||
      child.templateVersion !== member.templateVersion ||
      child.templateVersion !== templateVersionForRole(member.role)
    ) {
      return {
        ok: false,
        error: "wrong_template",
        reasons: ["Produsul confirmat nu este șablonul permis pentru acest rol."],
      };
    }
    if (
      child.truthHash !== member.confirmedTruthHash ||
      child.aggregateHash !== member.confirmedAggregateHash
    ) {
      return {
        ok: false,
        error: "stale_child",
        reasons: ["Referința produsului nu mai corespunde confirmării tehnice păstrate."],
      };
    }
  }
  return null;
}

function validateRelations(
  definition: AssemblyDefinition,
  support: AssemblyDefinition["members"][number] | undefined,
  letters: AssemblyDefinition["members"][number] | undefined,
  logo: AssemblyDefinition["members"][number] | undefined,
): AssemblyRuleFailure | null {
  if (definition.kind === SIGN_ASSEMBLY_ACM_LETTERS_V1) {
    if (definition.relations.length !== 1) {
      return {
        ok: false,
        error: "missing_relation",
        reasons: ["Relația dintre litere și panou lipsește."],
      };
    }
    const relation = definition.relations[0];
    if (!relation || relation.kind !== LETTERS_ON_ACM_PANEL) {
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
      relation.sourceMemberId !== letters?.memberId ||
      relation.targetMemberId !== support?.memberId
    ) {
      return {
        ok: false,
        error: "wrong_role",
        reasons: ["Literele trebuie legate către panoul ACM."],
      };
    }
    return null;
  }
  const expected: AssemblyRelationKind[] = letters
    ? [LOGO_ON_ACM_PANEL, LETTERS_ON_ACM_PANEL]
    : [LOGO_ON_ACM_PANEL];
  if (definition.relations.length !== expected.length) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relațiile de montaj ale ansamblului nu sunt complete."],
    };
  }
  for (const relation of definition.relations) {
    if (relation.sourceMemberId === relation.targetMemberId) {
      return {
        ok: false,
        error: "self_relation",
        reasons: ["Un membru nu poate fi legat de el însuși."],
      };
    }
    if (relation.targetMemberId !== support?.memberId) {
      return {
        ok: false,
        error: "wrong_role",
        reasons: ["Montajul trebuie legat către panoul ACM."],
      };
    }
  }
  const logoRelation = definition.relations.find((item) => item.kind === LOGO_ON_ACM_PANEL);
  if (!logoRelation || logoRelation.sourceMemberId !== logo?.memberId) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relația de montaj a logo-ului pe panoul ACM lipsește."],
    };
  }
  if (letters) {
    const lettersRelation = definition.relations.find((item) => item.kind === LETTERS_ON_ACM_PANEL);
    if (!lettersRelation || lettersRelation.sourceMemberId !== letters.memberId) {
      return {
        ok: false,
        error: "missing_relation",
        reasons: ["Relația de montaj a literelor pe panoul ACM lipsește."],
      };
    }
  } else if (definition.relations.some((item) => item.kind === LETTERS_ON_ACM_PANEL)) {
    return {
      ok: false,
      error: "missing_relation",
      reasons: ["Relația de litere nu este permisă fără un set de litere."],
    };
  }
  return null;
}

function relationsForMembers(
  kind: AssemblyKind,
  members: readonly AssemblyMember[],
): AssemblyRelation[] {
  const letters = members.find((item) => item.role === "SIGNAGE_LETTERS");
  const support = members.find((item) => item.role === "SUPPORT_PANEL");
  const logo = members.find((item) => item.role === "SIGNAGE_LOGO");
  if (kind === SIGN_ASSEMBLY_ACM_LETTERS_V1) {
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
  const relations: AssemblyRelation[] = [];
  if (logo && support) {
    relations.push({
      relationId: "relation:logo-on-acm-panel",
      kind: LOGO_ON_ACM_PANEL,
      sourceMemberId: logo.memberId,
      targetMemberId: support.memberId,
    });
  }
  if (letters && support) {
    relations.push({
      relationId: "relation:letters-on-acm-panel",
      kind: LETTERS_ON_ACM_PANEL,
      sourceMemberId: letters.memberId,
      targetMemberId: support.memberId,
    });
  }
  return relations;
}

function copyMember(member: AssemblyMember): AssemblyMember {
  return {
    memberId: member.memberId,
    role: member.role,
    productCode: member.productCode,
    templateCode: member.templateCode,
    templateVersion: member.templateVersion,
    organizationId: member.organizationId,
    confirmedTruthId: member.confirmedTruthId,
    confirmedTruthHash: member.confirmedTruthHash,
    confirmedAggregateHash: member.confirmedAggregateHash,
  };
}

function copyRelation(relation: AssemblyRelation): AssemblyRelation {
  return { ...relation };
}
