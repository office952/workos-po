import type { PeopleAdminTransport } from "../adapters/peopleAdapter";
import type { ProductEnablementAdminTransport } from "../adapters/productEnablementAdapter";
import type { WorkcentersAdminTransport } from "../adapters/workcentersAdapter";
import {
  loadExternalProductionAdmin,
  loadMaterialReadinessAdmin,
  loadOperationalServicesAdmin,
  loadPeopleAdmin,
  loadProductEnablementAdmin,
  loadWorkcentersAdmin,
} from "../data/routeLoaders";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import {
  presentOrganizationOperatingPicture,
  type OrganizationOperatingFacts,
  type OrganizationOperatingPicture,
  type OrganizationOperatingRole,
} from "../presentation/organizationOperatingPicture";

export function useOrganizationOperatingPicture(input: {
  role: OrganizationOperatingRole;
  organizationName: string | null;
}): { picture: OrganizationOperatingPicture; pending: boolean } {
  const people = useResource(resourceKeys.peopleAdmin(), loadPeopleAdmin);
  const workcenters = useResource(resourceKeys.workcentersAdmin(), loadWorkcentersAdmin);
  const products = useResource(resourceKeys.productEnablementAdmin(), loadProductEnablementAdmin);
  const services = useResource(resourceKeys.operationalServicesAdmin(), loadOperationalServicesAdmin);
  const materials = useResource(resourceKeys.materialReadinessAdmin(), loadMaterialReadinessAdmin);
  const external = useResource(resourceKeys.externalProductionAdmin(), loadExternalProductionAdmin);
  const facts = collectFacts({
    people: people.data,
    workcenters: workcenters.data,
    products: products.data,
    installation: services.data?.capabilities.find((item) => item.capabilityId === "SITE_INSTALLATION") ?? null,
    materials: materials.data,
    external: external.data,
  });
  const pending = [people, workcenters, products, services, materials, external].some(
    (resource) => resource.status !== "error" && resource.data === undefined,
  );
  return {
    picture: presentOrganizationOperatingPicture({
      facts,
      role: input.role,
      organizationName: input.organizationName,
    }),
    pending,
  };
}

function collectFacts(input: {
  people: PeopleAdminTransport | undefined;
  workcenters: WorkcentersAdminTransport | undefined;
  products: ProductEnablementAdminTransport | undefined;
  installation: { offerMode: string | null; offerModeLabel: string } | null | undefined;
  materials: { mode: string; modeLabel: string } | undefined;
  external: { mode: string; modeLabel: string } | undefined;
}): OrganizationOperatingFacts {
  const activePeople = input.people?.people.filter((person) => person.status === "ACTIVE") ?? null;
  const activeWorkcenters = input.workcenters?.workcenters.filter((item) => item.lifecycle === "ACTIVE") ?? null;
  const activeMachines = input.workcenters?.machines.filter((item) => item.lifecycle === "ACTIVE") ?? null;
  return {
    peopleCount: activePeople ? activePeople.length : null,
    peopleWithPinCount: activePeople
      ? activePeople.filter((person) => person.operatorPinConfigured).length
      : null,
    workcenterCount: activeWorkcenters ? activeWorkcenters.length : null,
    machineCount: activeMachines ? activeMachines.length : null,
    enabledProductCount: input.products
      ? input.products.products.filter((item) => item.enabled).length
      : null,
    offeredProductCount: input.products ? input.products.products.length : null,
    siteInstallationMode: input.installation ? input.installation.offerMode : null,
    siteInstallationModeLabel: input.installation?.offerModeLabel ?? null,
    materialReadinessMode: input.materials?.mode ?? null,
    materialReadinessModeLabel: input.materials?.modeLabel ?? null,
    externalProductionMode: input.external?.mode ?? null,
    externalProductionModeLabel: input.external?.modeLabel ?? null,
  };
}
