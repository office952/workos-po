import { useCallback } from "react";
import type { ExternalProductionAdmin } from "../adapters/externalProductionAdapter";
import type { MaterialReadinessAdmin } from "../adapters/materialReadinessAdapter";
import type { PeopleAdminTransport } from "../adapters/peopleAdapter";
import type { ProductEnablementAdminTransport } from "../adapters/productEnablementAdapter";
import type { WorkcentersAdminTransport } from "../adapters/workcentersAdapter";
import type { OperationalServicesAdminTransport } from "../api/types";
import { invalidateResources, type ResourceSnapshot } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import {
  loadExternalProductionAdmin,
  loadMaterialReadinessAdmin,
  loadOperationalServicesAdmin,
  loadPeopleAdmin,
  loadProductEnablementAdmin,
  loadWorkcentersAdmin,
} from "../data/routeLoaders";
import {
  factError,
  factPending,
  factReady,
  presentOrganizationOperatingPicture,
  type FactLoad,
  type OrganizationOperatingPicture,
  type OrganizationOperatingRole,
} from "../presentation/organizationOperatingPicture";

export const OPERATING_PICTURE_RESOURCE_KEYS = [
  resourceKeys.peopleAdmin(),
  resourceKeys.workcentersAdmin(),
  resourceKeys.productEnablementAdmin(),
  resourceKeys.operationalServicesAdmin(),
  resourceKeys.materialReadinessAdmin(),
  resourceKeys.externalProductionAdmin(),
] as const;

export function retryOrganizationOperatingPicture(): void {
  invalidateResources(...OPERATING_PICTURE_RESOURCE_KEYS);
}

export function useOrganizationOperatingPicture(input: {
  role: OrganizationOperatingRole;
}): {
  picture: OrganizationOperatingPicture;
  retry: () => void;
} {
  const people = useResource(resourceKeys.peopleAdmin(), loadPeopleAdmin);
  const workcenters = useResource(resourceKeys.workcentersAdmin(), loadWorkcentersAdmin);
  const products = useResource(resourceKeys.productEnablementAdmin(), loadProductEnablementAdmin);
  const services = useResource(resourceKeys.operationalServicesAdmin(), loadOperationalServicesAdmin);
  const materials = useResource(resourceKeys.materialReadinessAdmin(), loadMaterialReadinessAdmin);
  const external = useResource(resourceKeys.externalProductionAdmin(), loadExternalProductionAdmin);
  const retry = useCallback(() => {
    retryOrganizationOperatingPicture();
  }, []);
  const picture = presentOrganizationOperatingPicture({
    actorRole: input.role,
    people: peopleFact(people),
    workcenters: workcentersFact(workcenters),
    products: productsFact(products),
    installation: installationFact(services),
    materials: materialsFact(materials),
    external: externalFact(external),
  });
  const staleReadFailed = [people, workcenters, products, services, materials, external].some(
    (resource) => resource.status === "error",
  );

  return {
    picture: {
      ...picture,
      loadFailed: picture.loadFailed || staleReadFailed,
    },
    retry,
  };
}

function toFact<T, U>(resource: ResourceSnapshot<T>, read: (data: T) => U): FactLoad<U> {
  if (resource.data !== undefined) {
    return factReady(read(resource.data));
  }
  if (resource.status === "error") {
    return factError();
  }
  return factPending();
}

function peopleFact(resource: ResourceSnapshot<PeopleAdminTransport>): FactLoad<{
  count: number;
  withPinCount: number;
}> {
  return toFact(resource, (data) => {
    const active = data.people.filter((person) => person.status === "ACTIVE");
    return {
      count: active.length,
      withPinCount: active.filter((person) => person.operatorPinConfigured).length,
    };
  });
}

function workcentersFact(resource: ResourceSnapshot<WorkcentersAdminTransport>): FactLoad<{
  count: number;
  machineCount: number;
}> {
  return toFact(resource, (data) => ({
    count: data.workcenters.filter((item) => item.lifecycle === "ACTIVE").length,
    machineCount: data.machines.filter((item) => item.lifecycle === "ACTIVE").length,
  }));
}

function productsFact(resource: ResourceSnapshot<ProductEnablementAdminTransport>): FactLoad<{
  enabledCount: number;
  offeredCount: number;
}> {
  return toFact(resource, (data) => ({
    enabledCount: data.products.filter((item) => item.enabled).length,
    offeredCount: data.products.length,
  }));
}

function installationFact(
  resource: ResourceSnapshot<OperationalServicesAdminTransport>,
): FactLoad<{ mode: string | null; label: string } | null> {
  return toFact(resource, (data) => {
    const capability = data.capabilities.find((item) => item.capabilityId === "SITE_INSTALLATION") ?? null;
    if (!capability) return null;
    return { mode: capability.offerMode, label: capability.offerModeLabel };
  });
}

function materialsFact(
  resource: ResourceSnapshot<MaterialReadinessAdmin>,
): FactLoad<{ policy: "REQUIRED" | "DISABLED" }> {
  return toFact(resource, (data) => ({ policy: data.mode }));
}

function externalFact(
  resource: ResourceSnapshot<ExternalProductionAdmin>,
): FactLoad<{ policy: "ENABLED" | "DISABLED" }> {
  return toFact(resource, (data) => ({ policy: data.mode }));
}
