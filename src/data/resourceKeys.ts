export const resourceKeys = {
  health: () => "health",
  seller: () => "seller",
  customers: () => "customers",
  customer: (customerId: string) => `customer:${customerId}`,
  requests: () => "requests",
  request: (requestId: string) => `request:${requestId}`,
  catalog: () => "catalog",
  quotes: () => "quotes",
  quote: (productCode: string, quoteSnapshotId: string) =>
    `quote:${productCode}:${quoteSnapshotId}`,
  quoteAcceptance: (productCode: string, quoteSnapshotId: string) =>
    `quote-acceptance:${productCode}:${quoteSnapshotId}`,
  quoteOrder: (productCode: string, quoteSnapshotId: string) =>
    `quote-order:${productCode}:${quoteSnapshotId}`,
  jobs: () => "jobs",
  job: (jobId: string) => `job:${jobId}`,
  jobPrefix: () => "job:",
  executionPlan: (planId: string) => `execution-plan:${planId}`,
  operatorSession: () => "operator-session",
  operatorCandidates: () => "operator-candidates",
  operatorInbox: () => "operator-inbox",
  resourcesAdmin: () => "resources-admin",
  commercialAdmin: () => "commercial-admin",
  technicalAdmin: () => "technical-admin",
  formulasAdmin: () => "formulas-admin",
  productEnablementAdmin: () => "product-enablement-admin",
} as const;
