import { discardResourceCache, invalidateResourcePrefix, invalidateResources } from "./resourceCache";
import { resourceKeys } from "./resourceKeys";

export function invalidateAfterCreateCustomer(): void {
  invalidateResources(resourceKeys.customers());
}

export function invalidateAfterCreateRequest(customerId: string): void {
  invalidateResources(
    resourceKeys.requests(),
    resourceKeys.customer(customerId),
    resourceKeys.customerWorkspace(customerId),
    resourceKeys.customers(),
  );
}

export function invalidateCustomerProjections(): void {
  invalidateResources(resourceKeys.customers());
  invalidateResourcePrefix(resourceKeys.customerWorkspacePrefix());
}

export function invalidateAfterRequestDetailChange(requestId: string): void {
  invalidateResources(resourceKeys.request(requestId), resourceKeys.requests());
  invalidateCustomerProjections();
}

export function invalidateAfterAcceptQuote(quoteSnapshotId?: string): void {
  const keys = [resourceKeys.quotes()];
  if (quoteSnapshotId) {
    keys.push(resourceKeys.quoteEnvelope(quoteSnapshotId));
  }
  invalidateResources(...keys);
  invalidateCustomerProjections();
}

export function invalidateAfterCreateOrder(quoteSnapshotId?: string): void {
  const keys = [resourceKeys.quotes(), resourceKeys.jobs()];
  if (quoteSnapshotId) {
    keys.push(resourceKeys.quoteEnvelope(quoteSnapshotId));
  }
  invalidateResources(...keys);
  invalidateCustomerProjections();
}

export function invalidateAfterFreezeQuote(): void {
  invalidateResources(resourceKeys.quotes());
  invalidateCustomerProjections();
}

export function invalidateAfterSellerChange(): void {
  invalidateResources(resourceKeys.seller());
}

export function invalidateAfterProductionRelease(jobId: string): void {
  invalidateResources(resourceKeys.job(jobId), resourceKeys.jobs());
  invalidateCustomerProjections();
}

export function invalidateAfterCreateExecutionPlan(jobId: string): void {
  invalidateResources(resourceKeys.job(jobId), resourceKeys.jobs());
  invalidateCustomerProjections();
}

export function invalidateAfterExecutionTaskChange(planId: string): void {
  invalidateResources(
    resourceKeys.executionPlan(planId),
    resourceKeys.operatorInbox(),
    resourceKeys.jobs(),
    resourceKeys.planningWorkload(),
  );
  invalidateResourcePrefix(resourceKeys.jobPrefix());
  invalidateCustomerProjections();
}

export function invalidateAfterOperatorSessionChange(): void {
  invalidateResources(
    resourceKeys.operatorSession(),
    resourceKeys.operatorInbox(),
    resourceKeys.operatorCandidates(),
  );
}

export function invalidateAfterCloudBoundaryChange(): void {
  discardResourceCache();
}

export function invalidateAfterCostEvidenceChange(): void {
  invalidateResources(resourceKeys.resourcesAdmin());
}

export function invalidateAfterCommercialPolicyChange(): void {
  invalidateResources(resourceKeys.commercialAdmin());
}

export function invalidateAfterTechnicalSettingsChange(): void {
  invalidateResources(resourceKeys.technicalAdmin());
}

export function invalidateAfterFormulasChange(): void {
  invalidateResources(resourceKeys.formulasAdmin());
}

export function invalidateAfterProductEnablementChange(): void {
  invalidateResources(resourceKeys.productEnablementAdmin(), resourceKeys.catalog());
}

export function invalidateAfterOrganizationAccessChange(): void {
  invalidateResources(resourceKeys.organizationAccessAdmin());
}

export function invalidateAfterPeopleAdminChange(): void {
  invalidateResources(resourceKeys.peopleAdmin(), resourceKeys.operatorCandidates());
}

export function invalidateAfterWorkcentersAdminChange(): void {
  invalidateResources(
    resourceKeys.workcentersAdmin(),
    resourceKeys.operatorInbox(),
    resourceKeys.jobs(),
    resourceKeys.planningWorkload(),
  );
  invalidateResourcePrefix(resourceKeys.jobPrefix());
  invalidateResourcePrefix("execution-plan:");
  invalidateCustomerProjections();
}
