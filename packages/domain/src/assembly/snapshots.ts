import type { FrozenCommercialOffer, FrozenJobCommercial } from "../commercial/quoteSnapshot.js";
import type { FrozenProductionInput, FrozenProductionOperation } from "../production/snapshot.js";
import type { AssemblyKind, AssemblyMemberRole } from "./contract.js";

export type AssemblyQuoteMember = {
  memberId: string;
  role: AssemblyMemberRole;
  roleLabel: string;
  productCode: string;
  productLabel: string;
  inscription: string;
  childQuoteSnapshotId: string;
  childQuoteContentHash: string;
  confirmedTruthId: string;
  confirmedTruthHash: string;
  commercial: FrozenCommercialOffer;
};

export type AssemblyQuoteSnapshot = {
  quoteSnapshotId: string;
  schemaVersion: 1;
  status: "FROZEN";
  organizationId: string;
  requestId: string | null;
  assemblyKind: AssemblyKind;
  assemblyContractVersion: "product-assembly-v1" | "product-assembly-v2";
  assemblyId: string;
  assemblyTruthId: string;
  assemblyTruthHash: string;
  label: string;
  createdAt: string;
  contentHash: string;
  members: readonly AssemblyQuoteMember[];
  relationCommercialPrice: null;
  totals: FrozenJobCommercial;
};

export type AssemblyOrderChild = {
  memberId: string;
  role: AssemblyMemberRole;
  productCode: string;
  templateCode: string;
  templateVersion: string;
  truthId: string;
  truthHash: string;
  aggregateHash: string;
  productLabel: string;
  inscription: string;
  childQuoteSnapshotId: string;
  childQuoteContentHash: string;
  commercial: FrozenCommercialOffer;
  productionInput: FrozenProductionInput;
  eicTotal: number;
  eicCurrency: "EUR";
  eicCompleteness: "COMPLETE" | "PARTIAL";
};

export type AssemblyOrderSnapshot = {
  orderSnapshotId: string;
  schemaVersion: 1;
  status: "FROZEN";
  organizationId: string;
  requestId: string | null;
  sourceQuoteSnapshotId: string;
  sourceQuoteContentHash: string;
  assemblyId: string;
  assemblyTruthId: string;
  assemblyTruthHash: string;
  assemblyKind: AssemblyKind;
  label: string;
  createdAt: string;
  contentHash: string;
  members: readonly AssemblyQuoteMember[];
  children: readonly AssemblyOrderChild[];
  relationCommercialPrice: null;
  totals: FrozenJobCommercial;
};

export type AssemblyProductionMember = {
  memberId: string;
  role: AssemblyMemberRole;
  productCode: string;
  templateCode: string;
  templateVersion: string;
  truthHash: string;
  productionInputHash: string;
  operations: readonly FrozenProductionOperation[];
};

export type AssemblyProductionSnapshot = {
  snapshotId: string;
  schemaVersion: 1;
  status: "ACCEPTED";
  organizationId: string;
  sourceOrderSnapshotId: string;
  sourceOrderContentHash: string;
  assemblyId: string;
  assemblyTruthId: string;
  assemblyTruthHash: string;
  assemblyKind: AssemblyKind;
  label: string;
  createdAt: string;
  contentHash: string;
  members: readonly AssemblyProductionMember[];
  assemblyOperations: readonly FrozenProductionOperation[];
  eicTotal: number;
  eicCurrency: "EUR";
  eicCompleteness: "COMPLETE" | "PARTIAL";
};
