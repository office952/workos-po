import { SITE_INSTALLATION_LABEL, SITE_INSTALLATION_SCOPE_ID } from "../installation/scope.js";
import {
  INSTALL_AT_SITE_ID,
  PACK_PRODUCT_ID,
  getOperationalProcess,
  getProductionCapability,
  processProviderRequirement,
} from "../processes/catalog.js";
import type { FrozenProductionOperation } from "./snapshot.js";

export function appendInstallAtSiteOperation(
  operations: readonly FrozenProductionOperation[],
): readonly FrozenProductionOperation[] | null {
  const packs = operations.filter((operation) => operation.processId === PACK_PRODUCT_ID);
  if (packs.length !== 1) {
    return null;
  }
  const pack = packs[0];
  if (!pack || operations.some((operation) => operation.processId === INSTALL_AT_SITE_ID)) {
    return null;
  }
  const install = installAtSiteOperation(pack.id);
  if (!install) {
    return null;
  }
  return [...operations.map((operation) => ({
    ...operation,
    dependsOn: [...operation.dependsOn],
    quantities: operation.quantities.map((item) => ({ ...item })),
    resourceDemands: operation.resourceDemands.map((item) => ({ ...item })),
  })), install];
}

export function installAtSiteOperation(dependsOnPackId: string): FrozenProductionOperation | null {
  const process = getOperationalProcess(INSTALL_AT_SITE_ID);
  const capability = process ? getProductionCapability(process.requiredCapabilityId) : undefined;
  if (!process || !capability) {
    return null;
  }
  return {
    id: `SITE:${INSTALL_AT_SITE_ID}`,
    processId: process.id,
    processLabel: process.label,
    scope: SITE_INSTALLATION_SCOPE_ID,
    scopeLabel: SITE_INSTALLATION_LABEL,
    typeId: null,
    dependsOn: [dependsOnPackId],
    requiredCapabilityId: capability.id,
    requiredCapabilityLabel: capability.label,
    providerRequirement: processProviderRequirement(process),
    quantities: [],
    resourceDemands: [],
  };
}
