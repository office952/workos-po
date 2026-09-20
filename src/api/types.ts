export type JsonObject = Record<string, unknown>;

export type HealthTransport = {
  status: string;
  service: string;
  apiContractId: string;
};

export type DraftValues = Record<string, string | number | boolean | null>;

export type PreviewRequest = {
  values: DraftValues;
  requestId?: string;
};

export type ConfirmRequest = {
  values: DraftValues;
  reviewId: string;
  requestId?: string;
};

export type QuoteFreezeRequest = {
  values: DraftValues;
  reviewId: string;
  customerId: string;
  requestId?: string;
};

export type ConfigurationReadiness = "ready" | "blocked";

export type MissingFact = {
  fieldId?: string;
  label: string;
};

export type InstallationTransport = {
  selected: boolean;
  prequoteReady: boolean | null;
  incompleteReasons: string[];
};

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormFieldType = "text" | "select" | "number";

export type PresentedFormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  hint?: string;
  min?: number;
  options: FormFieldOption[];
};

export type PresentedFormSection = {
  id: string;
  title: string;
  fields: PresentedFormField[];
};

export type PresentedFormSchema = {
  id: string;
  sections: PresentedFormSection[];
};

export type PresentedComponent = {
  id: string;
  label: string;
};

export type PreviewTransport = {
  product: {
    code: string;
    label: string;
  };
  values: DraftValues;
  formSchema: PresentedFormSchema | null;
  selectedComponents: PresentedComponent[];
  readiness: ConfigurationReadiness;
  missing: MissingFact[];
  reviewId: string | null;
  installation: InstallationTransport;
};

export type CostLineTransport = {
  resourceId: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  currency: string;
  cost: number;
};

export type CommercialPriceTransport = {
  netPrice: number | null;
  grossPrice: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  currency: string | null;
  completeness: string | null;
  unavailableReasons: string[];
  internalCost: number | null;
  internalCostCurrency: string | null;
};

export type ConfirmTransport = {
  reviewId: string;
  completeness: string | null;
  completenessReasons: string[];
  currency: string | null;
  lines: CostLineTransport[];
  total: number | null;
  financialVisible: boolean;
  commercial: CommercialPriceTransport | null;
  quoteBlocker: string | null;
};

export type QuoteSnapshotTransport = {
  quoteSnapshotId: string;
  productCode: string;
  productLabel: string;
  inscription: string | null;
  sourceReviewId: string | null;
  customerId: string | null;
  customerDisplayName: string | null;
  requestId: string | null;
  completeness: string | null;
  currency: string | null;
  lines: CostLineTransport[];
  total: number | null;
  financialVisible: boolean;
  commercial: CommercialPriceTransport | null;
};

export type CustomerTransport = {
  customerId: string;
  displayName: string;
  status: string;
  city: string | null;
};

export type RequestListItemTransport = {
  requestId: string;
  title: string;
  reference: string | null;
  customerId: string;
  customerDisplayName: string | null;
  statusLabel: string;
  contextLabel: string | null;
  updatedAt: string | null;
  nextActionLabel: string;
};

export type RequestDetailTransport = {
  requestId: string;
  title: string;
  description: string;
  customerId: string;
  customerDisplayName: string | null;
  statusLabel: string;
  linkedQuoteIds: string[];
  linkedQuoteProductCodes: string[];
};

export type CatalogProductTransport = {
  code: string;
  label: string;
  description: string;
  familyLabel: string | null;
};

export type QuoteListItemTransport = {
  quoteSnapshotId: string;
  productCode: string;
  productLabel: string;
  reference: string;
  inscription: string;
  customerDisplayName: string | null;
  stageLabel: string;
  updatedAt: string | null;
  nextActionLabel: string;
  requestId: string | null;
  orderSnapshotId: string | null;
};

export type JobListItemTransport = {
  jobId: string;
  productCode: string;
  productLabel: string;
  inscription: string;
  customerDisplayName: string | null;
  stage: string;
  stageLabel: string;
  nextAction: string;
  nextActionLabel: string;
  progressLabel: string | null;
  updatedAt: string | null;
  releaseSnapshotId: string | null;
  planId: string | null;
  orderSnapshotId: string;
};

export type OperatorCandidateTransport = {
  personId: string;
  displayName: string;
  pinConfigured: boolean;
  availabilityLabel: string;
};

export type OperatorSessionTransport = {
  personId: string;
  displayName: string;
};

export type InboxTaskTransport = {
  taskId: string;
  planId: string;
  jobId: string | null;
  processLabel: string;
  scopeLabel: string;
  statusLabel: string;
  productLabel: string;
  inscription: string;
  canClaimStart: boolean;
  requiresProvider: boolean;
  lane: string;
};

export type ExecutionTaskTransport = {
  taskId: string;
  processLabel: string;
  scopeLabel: string;
  seqLabel: string;
  status: string;
  statusLabel: string;
  assignmentLabel: string;
  requiresProvider: boolean;
  requiredCapabilityId: string | null;
  canAssign: boolean;
  canClaimStart: boolean;
  canComplete: boolean;
  requiresCompletedQuantity: boolean;
  plannedQuantity: number | null;
  plannedQuantityLabel: string | null;
  completedQuantityLabel: string | null;
  varianceLabel: string | null;
  waitingFor: string[];
  eligibleProviderIds: string[];
  eligibleProviderLabels: string[];
  startBlockReason: string | null;
  operatorRelation: string | null;
};

export type ExecutionPlanTransport = {
  planId: string;
  productLabel: string;
  inscription: string;
  statusLabel: string;
  progressLabel: string;
  sourceSnapshotId: string;
  jobId: string | null;
  tasks: ExecutionTaskTransport[];
};

export type ResourcesWriteState = "READY" | "NOT_IMPLEMENTED";

export type CostEvidenceQualifierTransport = {
  kind: string;
  label: string;
  unitLabel: string;
  value: number;
};

export type CostEvidenceRowTransport = {
  evidenceRowId: string | null;
  resourceId: string;
  resourceLabel: string;
  qualifierIdentity: string | null;
  qualifierLabel: string | null;
  qualifier: CostEvidenceQualifierTransport | null;
  amount: number | null;
  currency: string | null;
  unitLabel: string | null;
  amountDisplay: string | null;
  note: string | null;
  lastChangedAt: string | null;
};

export type ResourcesAdminTransport = {
  writeState: ResourcesWriteState;
  canEdit: boolean;
  rows: CostEvidenceRowTransport[];
};

export type CloudAccessMode = "cloud" | "single_plane";

export type CloudMembershipRole = "owner" | "member";

export type CloudSessionUserTransport = {
  userId: string;
  email: string;
};

export type CloudSessionOrganizationTransport = {
  organizationId: string;
  displayName: string;
  slug: string;
  role: CloudMembershipRole | null;
};

export type CloudSessionMembershipTransport = {
  organizationId: string;
  displayName: string;
  slug: string;
  role: CloudMembershipRole;
  status: "ACTIVE" | "DISABLED";
};

export type CloudSessionTransport = {
  mode: CloudAccessMode;
  authConfigured: boolean;
  user: CloudSessionUserTransport | null;
  organization: CloudSessionOrganizationTransport | null;
  memberships: CloudSessionMembershipTransport[];
};
