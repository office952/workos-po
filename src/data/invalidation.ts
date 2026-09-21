import { invalidateResourcePrefix, invalidateResources } from "./resourceCache";
import { resourceKeys } from "./resourceKeys";

export function invalidateAfterCreateCustomer(): void {
  invalidateResources(resourceKeys.customers());
}

export function invalidateAfterCreateRequest(customerId: string): void {
  invalidateResources(resourceKeys.requests(), resourceKeys.customer(customerId));
}

export function invalidateAfterAcceptQuote(): void {
  invalidateResources(resourceKeys.quotes());
}

export function invalidateAfterCreateOrder(): void {
  invalidateResources(resourceKeys.quotes(), resourceKeys.jobs());
}

export function invalidateAfterFreezeQuote(): void {
  invalidateResources(resourceKeys.quotes());
}

export function invalidateAfterSellerChange(): void {
  invalidateResources(resourceKeys.seller());
}

export function invalidateAfterProductionRelease(jobId: string): void {
  invalidateResources(resourceKeys.job(jobId), resourceKeys.jobs());
}

export function invalidateAfterCreateExecutionPlan(jobId: string): void {
  invalidateResources(resourceKeys.job(jobId), resourceKeys.jobs());
}

export function invalidateAfterExecutionTaskChange(planId: string): void {
  invalidateResources(
    resourceKeys.executionPlan(planId),
    resourceKeys.operatorInbox(),
    resourceKeys.jobs(),
  );
  invalidateResourcePrefix(resourceKeys.jobPrefix());
}

export function invalidateAfterOperatorSessionChange(): void {
  invalidateResources(
    resourceKeys.operatorSession(),
    resourceKeys.operatorInbox(),
    resourceKeys.operatorCandidates(),
  );
}

export function invalidateAfterCloudBoundaryChange(): void {
  invalidateAfterOperatorSessionChange();
  invalidateResources(
    resourceKeys.seller(),
    resourceKeys.customers(),
    resourceKeys.requests(),
    resourceKeys.catalog(),
    resourceKeys.quotes(),
    resourceKeys.jobs(),
    resourceKeys.resourcesAdmin(),
    resourceKeys.commercialAdmin(),
    resourceKeys.technicalAdmin(),
    resourceKeys.formulasAdmin(),
  );
  invalidateResourcePrefix("customer:");
  invalidateResourcePrefix("request:");
  invalidateResourcePrefix("quote");
  invalidateResourcePrefix("job:");
  invalidateResourcePrefix("execution-plan:");
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
