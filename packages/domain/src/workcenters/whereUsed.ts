import { processesForCapability } from "../processes/catalog.js";
import { processWhereUsed, type ProcessUse } from "../processes/whereUsed.js";
import { workcenterRegistry, type WorkcenterRegistry } from "./catalog.js";

export type ProviderUse = ProcessUse & {
  capabilityId: string;
};

export function providerWhereUsed(
  kind: "WORKCENTER" | "MACHINE",
  id: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): readonly ProviderUse[] {
  const provider =
    kind === "WORKCENTER" ? registry.getWorkcenter(id) : registry.getMachine(id);
  if (!provider) {
    return [];
  }
  return provider.capabilityIds.flatMap((capabilityId) =>
    processesForCapability(capabilityId).flatMap((process) =>
      processWhereUsed(process.id).map((use) => ({
        ...use,
        capabilityId,
      })),
    ),
  );
}
