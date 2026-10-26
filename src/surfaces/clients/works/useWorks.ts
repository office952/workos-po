import { customerWorksQueryString, fetchCustomerWorks, type CustomerWorksParams } from "../../../api/customerDossier";
import { presentCustomerWorks } from "../../../adapters/customerDossierAdapter";
import { invalidateResources } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";

/** The works of a client as the server filters and pages them (`GET /api/customers/:id/works`). */
export function useWorks(customerId: string, params: CustomerWorksParams) {
  const key = resourceKeys.customerWorks(customerId, customerWorksQueryString(params));
  const works = useResource(key, async () => {
    const presented = presentCustomerWorks(await fetchCustomerWorks(customerId, params));
    if (!presented) throw new Error("unpresentable");
    return presented;
  });
  return { ...works, retry: () => invalidateResources(key) };
}
