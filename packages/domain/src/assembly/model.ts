import type { FrozenCommercialOffer } from "../commercial/quoteSnapshot.js";
import type { FrozenProductionInput } from "../production/snapshot.js";
import type { ProductTruth } from "../product/types.js";
import type {
  AssemblyContractVersion,
  AssemblyDefinitionStatus,
  AssemblyKind,
  AssemblyMemberRole,
  AssemblyRelationKind,
} from "./contract.js";

export type AssemblyMember = {
  memberId: string;
  role: AssemblyMemberRole;
  productCode: string;
  templateCode: string;
  templateVersion: string;
  organizationId: string;
  confirmedTruthId: string;
  confirmedTruthHash: string;
  confirmedAggregateHash: string;
};

export type AssemblyRelation = {
  relationId: string;
  kind: AssemblyRelationKind;
  sourceMemberId: string;
  targetMemberId: string;
};

export type AssemblyDefinition = {
  assemblyId: string;
  organizationId: string;
  requestId: string | null;
  customerId: string | null;
  kind: AssemblyKind;
  contractVersion: AssemblyContractVersion;
  status: AssemblyDefinitionStatus;
  members: readonly AssemblyMember[];
  relations: readonly AssemblyRelation[];
  confirmedTruthId: string | null;
  confirmedTruthHash: string | null;
  staleReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssemblyTruth = {
  assemblyTruthId: string;
  assemblyId: string;
  organizationId: string;
  requestId: string | null;
  kind: AssemblyKind;
  contractVersion: AssemblyContractVersion;
  members: readonly AssemblyMember[];
  relations: readonly AssemblyRelation[];
  contentHash: string;
  confirmedAt: string;
};

export type AssemblyAggregateChild = {
  memberId: string;
  role: AssemblyMemberRole;
  productCode: string;
  aggregateHash: string;
};

export type AssemblyAggregate = {
  derivedFrom: "AssemblyTruth";
  assemblyTruthId: string;
  contentHash: string;
  childAggregates: readonly AssemblyAggregateChild[];
  relationConsequences: readonly {
    relationId: string;
    processId: "MOUNT_LETTERS_ON_PANEL" | "MOUNT_LOGO_ON_PANEL";
  }[];
  assemblyDemand: readonly [];
};

export type ConfirmedChildProduct = {
  truthId: string;
  organizationId: string;
  productCode: string;
  templateCode: string;
  templateVersion: string;
  familyId: string;
  reviewId: string;
  truthHash: string;
  aggregateHash: string;
  confirmedAt: string;
  productLabel: string;
  inscription: string;
  childQuoteSnapshotId: string | null;
  childQuoteContentHash: string | null;
  commercial: FrozenCommercialOffer | null;
  productionInput: FrozenProductionInput;
  eicTotal: number;
  eicCurrency: "EUR";
  eicCompleteness: "COMPLETE" | "PARTIAL";
  truth: ProductTruth;
};

export const ASSEMBLY_RULE_ERRORS = [
  "assembly_unavailable",
  "wrong_role",
  "wrong_template",
  "duplicate_role",
  "missing_member",
  "missing_relation",
  "self_relation",
  "unconfirmed_child",
  "stale_child",
  "cross_organization",
  "review_required",
  "incomplete_commercial",
] as const;
export type AssemblyRuleError = (typeof ASSEMBLY_RULE_ERRORS)[number];

export type AssemblyRuleFailure = {
  ok: false;
  error: AssemblyRuleError;
  reasons: readonly string[];
};
