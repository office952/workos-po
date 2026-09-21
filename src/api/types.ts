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

export type QuoteCommercialTermsTransport = {
  markupPercent: number;
  discountPercent: number;
  adjustmentAmount: number;
};

export type ConfirmRequest = {
  values: DraftValues;
  reviewId: string;
  requestId?: string;
  pricingMethod?: "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT";
  quoteCommercialTerms?: QuoteCommercialTermsTransport;
  manualProductNetPrice?: number;
  preferManualProductPrice?: boolean;
};

export type QuoteFreezeRequest = {
  values: DraftValues;
  reviewId: string;
  customerId: string;
  requestId?: string;
  pricingMethod?: "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT";
  quoteCommercialTerms?: QuoteCommercialTermsTransport;
  manualProductNetPrice?: number;
  preferManualProductPrice?: boolean;
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

export type CostCompletenessIssueTransport = {
  type:
    | "MISSING_COST_EVIDENCE"
    | "MISSING_TECHNICAL_INPUT"
    | "UNCALCULATED_COMPONENT"
    | "PROVISIONAL_COST_EVIDENCE"
    | "OTHER";
  impact: "BLOCKS_CALCULATION" | "REQUIRES_VERIFICATION";
  label: string;
  reason: string;
  resourceId: string | null;
  componentLabel: string | null;
  context: string | null;
  rate: number | null;
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
  internalCostCompleteness: string | null;
  markupPercent: number | null;
  markupAmount: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  adjustmentAmount: number | null;
  marginAmount: number | null;
  policySource?: string | null;
  commercialStrategy?: string | null;
  calculationStatus?: string | null;
  verificationStatus?: string | null;
};

export type CommercialPolicyTransport = {
  source: string | null;
  sourceLabel: string | null;
  guidance: string | null;
  version: number | null;
};

export type ConfirmTransport = {
  reviewId: string;
  completeness: string | null;
  calculationStatus: string | null;
  verificationStatus: string | null;
  completenessReasons: string[];
  costCompletenessIssues: CostCompletenessIssueTransport[];
  currency: string | null;
  lines: CostLineTransport[];
  total: number | null;
  financialVisible: boolean;
  commercial: CommercialPriceTransport | null;
  commercialPolicy: CommercialPolicyTransport | null;
  organizationDefaults: QuoteCommercialTermsTransport | null;
  quoteCommercialTerms: QuoteCommercialTermsTransport | null;
  quoteTermsFromDefaults: boolean;
  pricingMethod: "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT" | null;
  calculatedPriceAvailable: boolean;
  manualProductPriceAuthorized: boolean;
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

export type EligibleProviderTransport = {
  id: string;
  kind: string;
  kindLabel: string;
  label: string;
};

export type PlannedResourceTransport = {
  resourceId: string;
  label: string;
  plannedQuantity: number;
  unit: string;
};

export type ActualConsumptionTransport = {
  resourceId: string;
  label: string;
  actualQuantity: number;
  unit: string;
  note: string | null;
};

export type ExecutionTaskCompletionInput = {
  completedQuantity?: number;
  note?: string;
  actualConsumption?: Array<{
    resourceId: string;
    actualQuantity: number;
  }>;
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
  canAssignProvider: boolean;
  canClaimStart: boolean;
  canComplete: boolean;
  requiresCompletedQuantity: boolean;
  plannedQuantity: number | null;
  plannedQuantityLabel: string | null;
  completedQuantityLabel: string | null;
  varianceLabel: string | null;
  waitingFor: string[];
  dependsOnLabels: string[];
  eligibleProviders: EligibleProviderTransport[];
  startBlockReason: string | null;
  operatorRelation: string | null;
  startedByLabel: string | null;
  executorLabel: string | null;
  canRecordActualConsumption: boolean;
  plannedResources: PlannedResourceTransport[];
  actualConsumption: ActualConsumptionTransport[];
};

export type ExecutionPlanProgressTransport = {
  total: number;
  completed: number;
  inProgress: number;
  planned: number;
  waitingDependencies: number;
  noProvider: number;
  varianceCount: number;
};

export type ExecutionPlanTransport = {
  planId: string;
  productLabel: string;
  inscription: string;
  statusLabel: string;
  progressLabel: string;
  progress: ExecutionPlanProgressTransport | null;
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
