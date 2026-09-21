import { presentCatalogProducts } from "../adapters/catalogAdapter";
import { presentSellerConfigured } from "../adapters/contextAdapter";
import { presentCustomer, presentCustomerList } from "../adapters/customerAdapter";
import { presentExecutionPlan } from "../adapters/executionAdapter";
import { presentHealth, type HealthPresentation } from "../adapters/healthAdapter";
import { presentJobDetail, presentJobList } from "../adapters/jobAdapter";
import {
  presentInboxTasks,
  presentOperatorCandidates,
  presentOperatorSession,
} from "../adapters/operatorAdapter";
import { presentQuoteSnapshot } from "../adapters/quoteAdapter";
import { presentAcceptanceId, presentOrderSnapshotId, presentQuoteList } from "../adapters/quoteListAdapter";
import { presentRequestDetail, presentRequestList } from "../adapters/requestAdapter";
import { presentCommercialPolicyAdmin } from "../adapters/commercialPolicyAdapter";
import { presentResourcesAdmin } from "../adapters/resourcesAdapter";
import { presentFormulasAdmin } from "../adapters/formulasAdapter";
import { presentTechnicalSettingsAdmin } from "../adapters/technicalSettingsAdapter";
import { fetchProductCatalog } from "../api/catalog";
import { fetchCustomer, fetchCustomers } from "../api/customers";
import { fetchHealth } from "../api/health";
import { fetchJob, fetchJobOverview } from "../api/jobs";
import { fetchExecutionPlan, fetchQuoteAcceptance, fetchQuoteOrder } from "../api/lifecycle";
import { fetchOperatorCandidates, fetchOperatorInbox, fetchOperatorSession } from "../api/operator";
import { fetchQuoteSnapshot } from "../api/quote";
import { fetchQuoteOverview } from "../api/quotes";
import { fetchRequest, fetchRequests } from "../api/requests";
import { fetchCommercialPolicy } from "../api/commercialPolicy";
import { fetchResourcesAdmin } from "../api/resources";
import { fetchFormulas } from "../api/formulas";
import { fetchTechnicalSettings } from "../api/technicalSettings";
import { fetchSeller } from "../api/seller";

export async function loadHealthPresentation(): Promise<HealthPresentation> {
  try {
    return presentHealth(await fetchHealth());
  } catch {
    return {
      kind: "incompatible",
      received: null,
      reason: "Verificarea contractului nu este disponibilă pe această origine.",
    };
  }
}

export async function loadSellerConfigured(): Promise<boolean> {
  try {
    return presentSellerConfigured(await fetchSeller());
  } catch {
    return false;
  }
}

export async function loadCustomerList() {
  return presentCustomerList(await fetchCustomers());
}

export async function loadCustomer(customerId: string) {
  const presented = presentCustomer(await fetchCustomer(customerId));
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadRequestList() {
  return presentRequestList(await fetchRequests());
}

export async function loadRequestDetail(requestId: string) {
  const presented = presentRequestDetail(await fetchRequest(requestId));
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadCatalogProducts() {
  return presentCatalogProducts(await fetchProductCatalog());
}

export async function loadQuoteList() {
  return presentQuoteList(await fetchQuoteOverview());
}

export async function loadQuoteSnapshot(productCode: string, quoteSnapshotId: string) {
  const presented = presentQuoteSnapshot(await fetchQuoteSnapshot(productCode, quoteSnapshotId));
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadQuoteAcceptance(productCode: string, quoteSnapshotId: string) {
  try {
    return presentAcceptanceId(await fetchQuoteAcceptance(productCode, quoteSnapshotId));
  } catch {
    return null;
  }
}

export async function loadQuoteOrder(productCode: string, quoteSnapshotId: string) {
  try {
    return presentOrderSnapshotId(await fetchQuoteOrder(productCode, quoteSnapshotId));
  } catch {
    return null;
  }
}

export async function loadJobList() {
  return presentJobList(await fetchJobOverview());
}

export async function loadJobDetail(jobId: string) {
  const presented = presentJobDetail(await fetchJob(jobId));
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadExecutionPlan(planId: string) {
  const presented = presentExecutionPlan(await fetchExecutionPlan(planId));
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadOperatorSession() {
  return presentOperatorSession(await fetchOperatorSession());
}

export async function loadOperatorCandidates() {
  return presentOperatorCandidates(await fetchOperatorCandidates());
}

export async function loadOperatorInbox() {
  return presentInboxTasks(await fetchOperatorInbox());
}

export async function loadResourcesAdmin() {
  const presented = presentResourcesAdmin(await fetchResourcesAdmin());
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadCommercialPolicyAdmin() {
  const presented = presentCommercialPolicyAdmin(await fetchCommercialPolicy());
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadTechnicalSettingsAdmin() {
  const presented = presentTechnicalSettingsAdmin(await fetchTechnicalSettings());
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}

export async function loadFormulasAdmin() {
  const presented = presentFormulasAdmin(await fetchFormulas());
  if (!presented) {
    throw new Error("unpresentable");
  }
  return presented;
}
