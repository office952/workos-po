import { customerHistoryQueryString, fetchCustomerCommercialTerms, fetchCustomerDossier, fetchCustomerHistory } from "../../../api/customerDossier";
import { readTransportErrorCode, TransportError } from "../../../api/http";
import { presentCommercialTerms, presentCustomerDossier, presentCustomerHistory } from "../../../adapters/customerDossierAdapter";
import { invalidateResourcePrefix, invalidateResources } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";

export function useCustomerDossier(customerId: string) {
  return useResource(resourceKeys.customerDossier(customerId), async () => {
    const presented = presentCustomerDossier(await fetchCustomerDossier(customerId));
    if (!presented) throw new Error("unpresentable");
    return presented;
  });
}

/** The unfiltered history (one entry): the tab counts, the years of the client and its first documented activity. */
const TOTALS_QUERY = { page: 1, pageSize: 1 };

export function useHistoryTotals(customerId: string) {
  return useResource(resourceKeys.customerHistory(customerId, customerHistoryQueryString(TOTALS_QUERY)), async () => {
    const presented = presentCustomerHistory(await fetchCustomerHistory(customerId, TOTALS_QUERY));
    if (!presented) throw new Error("unpresentable");
    return presented;
  });
}

/** The commercial terms of the client: one resource for the header contacts and Date comerciale. */
export function useCommercialTerms(customerId: string) {
  return useResource(resourceKeys.customerCommercialTerms(customerId), async () => {
    const presented = presentCommercialTerms(await fetchCustomerCommercialTerms(customerId));
    if (!presented) throw new Error("unpresentable");
    return presented;
  });
}

/** After any dossier change: the dossier, every cached history page and the workspace counts. */
export function refreshCustomerDossier(customerId: string): void {
  invalidateResources(resourceKeys.customerDossier(customerId), resourceKeys.customerWorkspace(customerId), resourceKeys.customerCommercialTerms(customerId), resourceKeys.customers());
  invalidateResourcePrefix(resourceKeys.customerHistoryPrefix(customerId));
  invalidateResourcePrefix(resourceKeys.customerWorksPrefix(customerId));
}

const ERROR_TEXT: Record<string, string> = {
  invalid_payload: "Verifică valorile completate.",
  invalid_metadata: "Alege tipul documentului; pentru fotografii alege și etapa. Data se scrie AAAA-LL-ZZ.",
  invalid_links: "Asocierea aleasă nu este validă.",
  invalid_file: "Alege un fișier care nu este gol.",
  file_too_large: "Fișierul depășește limita de încărcare.",
  subject_not_of_customer: "Asocierea aleasă nu aparține acestui client.",
  site_not_of_customer: "Sediul ales nu aparține acestui client.",
  reference_document_not_of_customer: "Contractul de referință trebuie să fie un document al acestui client.",
  site_inactive: "Sediul este inactiv și nu poate primi lucrări noi.",
  stale_revision: "Datele au fost modificate între timp de altcineva. Închide formularul și reia modificarea pe datele actuale.",
  forbidden: "Rolul tău nu permite această modificare.",
  not_found: "Clientul sau documentul nu mai există.",
  storage_unavailable: "Spațiul de stocare nu este disponibil acum. Reîncearcă.",
};

export function dossierErrorText(error: unknown): string {
  if (error instanceof TransportError) {
    const code = readTransportErrorCode(error.body);
    if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  }
  return "Operația nu a reușit. Valorile au rămas în formular; poți reîncerca.";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDay(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
