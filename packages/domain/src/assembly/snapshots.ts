import type {
  FrozenCommercialOffer,
  FrozenCustomerIdentity,
  FrozenJobCommercial,
  FrozenSellerIdentity,
  FrozenSiteInstallationQuoteLineV2,
} from "../commercial/quoteSnapshot.js";
import type { FrozenRateAcknowledgement } from "../commercial/rateAcknowledgement.js";
import type { SiteInstallationOperationalView } from "../installation/hostContext.js";
import type { FrozenProductionInput, FrozenProductionOperation } from "../production/snapshot.js";
import type { AssemblyKind, AssemblyMemberRole } from "./contract.js";
import type { FrozenAssemblyOperationCost } from "./operationCostEvidence.js";

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
  schemaVersion: 1 | 2;
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
  serviceLine?: FrozenSiteInstallationQuoteLineV2;
  /** Absent on quotes issued before identities were frozen; their hashes exclude both fields. */
  customer?: FrozenCustomerIdentity;
  seller?: FrozenSellerIdentity;
  /** Absent when no acknowledgement was required; its hash excludes `acknowledgedAt`. */
  rateAcknowledgement?: FrozenRateAcknowledgement;
  /** Absent on quotes frozen before assembly operation costing; their hashes exclude it. */
  operationCost?: FrozenAssemblyOperationCost;
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
  schemaVersion: 1 | 2;
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
  serviceLine?: FrozenSiteInstallationQuoteLineV2;
  /** Copied unchanged from the accepted quote; absent when that quote carried none. */
  operationCost?: FrozenAssemblyOperationCost;
};

/** What production reconciled from the order's frozen operation evidence. */
export type AssemblyProductionOperationCost = {
  evidenceStatus: "VALID" | "INVALID";
  evidenceHash: string;
  policyVersion: number | null;
  pricedProcessIds: readonly string[];
  includedProcessIds: readonly string[];
  unpricedProcessIds: readonly string[];
  total: number;
  currency: "EUR";
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
  schemaVersion: 1 | 2;
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
  siteInstallation?: SiteInstallationOperationalView;
  /** Present only when the source order froze operation evidence. */
  operationCost?: AssemblyProductionOperationCost;
};
