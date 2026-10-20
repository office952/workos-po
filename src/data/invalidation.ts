import { discardResourceCache, invalidateResourcePrefix, invalidateResources } from "./resourceCache";
import { resourceKeys } from "./resourceKeys";

export function invalidateAfterCreateCustomer(): void {
  invalidateResources(resourceKeys.customers(), resourceKeys.customerIntake());
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
  invalidateResources(resourceKeys.customers(), resourceKeys.customerIntake());
  invalidateResourcePrefix(resourceKeys.customerWorkspacePrefix());
}

export function invalidateAfterRequestDetailChange(requestId: string): void {
  invalidateResources(resourceKeys.request(requestId), resourceKeys.requests());
  invalidateCustomerProjections();
}

export function invalidateAfterAssemblyMemberChange(
  assemblyId: string,
  memberRole?: string,
): void {
  const keys = [resourceKeys.assembly(assemblyId)];
  if (memberRole) {
    keys.push(resourceKeys.assemblyMember(assemblyId, memberRole));
  }
  invalidateResources({ refetchUnobserved: true }, ...keys);
}

export function invalidateAfterAcceptQuote(
  quoteSnapshotId?: string,
  requestId?: string | null,
): void {
  const keys = [resourceKeys.quotes()];
  if (quoteSnapshotId) {
    keys.push(resourceKeys.quoteEnvelope(quoteSnapshotId));
  }
  if (requestId) {
    keys.push(resourceKeys.request(requestId));
  }
  invalidateResources(...keys);
  invalidateCustomerProjections();
}

export function invalidateAfterCreateOrder(
  quoteSnapshotId?: string,
  requestId?: string | null,
): void {
  const keys = [resourceKeys.quotes(), resourceKeys.jobs()];
  if (quoteSnapshotId) {
    keys.push(resourceKeys.quoteEnvelope(quoteSnapshotId));
  }
  if (requestId) {
    keys.push(resourceKeys.request(requestId));
  }
  invalidateResources(...keys);
  invalidateCustomerProjections();
}

export function invalidateAfterAcceptAssemblyQuote(input: {
  assemblyId: string;
  requestId: string | null;
}): void {
  invalidateResourcePrefix(resourceKeys.assemblyQuote(""));
  invalidateResources(resourceKeys.assembly(input.assemblyId), resourceKeys.quotes(), resourceKeys.jobs());
  if (input.requestId) {
    invalidateAfterRequestDetailChange(input.requestId);
  } else {
    invalidateCustomerProjections();
  }
}

export function invalidateAfterFreezeQuote(requestId?: string | null): void {
  const keys = [resourceKeys.quotes()];
  if (requestId) {
    keys.push(resourceKeys.request(requestId), resourceKeys.requests());
  }
  invalidateResources(...keys);
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
  invalidateResources(resourceKeys.job(jobId), resourceKeys.jobs(), resourceKeys.jobMaterialPreparation(jobId));
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

export function invalidateAfterJobMaterialDecision(jobId: string): void {
  invalidateResources(resourceKeys.jobMaterialPreparation(jobId), resourceKeys.operatorInbox());
  invalidateResourcePrefix("execution-plan:");
  invalidateResourcePrefix(resourceKeys.jobPrefix());
}

export function invalidateAfterOperatorSessionChange(): void {
  invalidateResources(
    resourceKeys.operatorSession(),
    resourceKeys.operatorInbox(),
    resourceKeys.operatorCandidates(),
  );
  // Execution actions and operatorRelation belong to the current viewer.
  invalidateResourcePrefix(resourceKeys.executionPlanPrefix());
}

export function invalidateAfterCloudBoundaryChange(): void {
  discardResourceCache();
}

export function invalidateAfterCostEvidenceChange(): void {
  invalidateResources(resourceKeys.resourcesAdmin(), resourceKeys.assemblyOperationCostAdmin());
}

export function invalidateAfterCommercialPolicyChange(): void {
  invalidateResources(resourceKeys.commercialAdmin());
}

export function invalidateAfterTechnicalSettingsChange(): void {
  invalidateResources(resourceKeys.technicalAdmin(), resourceKeys.productSystem());
}

export function invalidateAfterFormulasChange(): void {
  invalidateResources(resourceKeys.formulasAdmin(), resourceKeys.productSystem());
}

export function invalidateAfterProductEnablementChange(): void {
  invalidateResources(resourceKeys.productEnablementAdmin(), resourceKeys.catalog());
}

export function invalidateAfterOrganizationAccessChange(): void {
  invalidateResources(resourceKeys.organizationAccessAdmin());
}

export function invalidateAfterPeopleAdminChange(): void {
  invalidateResources(resourceKeys.peopleAdmin(), resourceKeys.operatorCandidates(), resourceKeys.operatorInbox());
  invalidateResourcePrefix(resourceKeys.executionPlanPrefix());
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
