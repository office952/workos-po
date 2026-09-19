import { createProductSystemRuntime, type ProductSystemRuntime } from "../productSystem/runtime.js";
import type { OperationalPlaneDescriptor } from "./controlPlane.js";
import { resolveProviderRegistry } from "./bootstrapPolicy.js";
import { PlaneIdentityError } from "./planeIdentity.js";
import { derivePlanePaths } from "./paths.js";

export type RuntimeRegistry = {
  getOrOpen(
    descriptor: OperationalPlaneDescriptor,
    cloudRoot: string,
  ): ProductSystemRuntime;
  evict(organizationId: string): void;
  closeAll(): void;
};

export function createRuntimeRegistry(): RuntimeRegistry {
  const runtimes = new Map<string, ProductSystemRuntime>();

  return {
    getOrOpen(descriptor, cloudRoot) {
      const cached = runtimes.get(descriptor.organizationId);
      if (cached) {
        if (
          cached.organizationId !== descriptor.organizationId ||
          cached.planeId !== descriptor.planeId
        ) {
          cached.close();
          runtimes.delete(descriptor.organizationId);
        } else {
          return cached;
        }
      }
      const paths = derivePlanePaths(cloudRoot, descriptor.planeKey);
      try {
        const runtime = createProductSystemRuntime(paths.sqlitePath, {
          documentsRoot: paths.documentsRoot,
          bindPlaneIdentity: false,
          bootstrapPolicy: descriptor.bootstrapPolicy,
          providerRegistry: resolveProviderRegistry(descriptor.bootstrapPolicy),
          planeIdentity: {
            planeId: descriptor.planeId,
            organizationId: descriptor.organizationId,
          },
        });
        runtimes.set(descriptor.organizationId, runtime);
        return runtime;
      } catch (error) {
        if (error instanceof PlaneIdentityError) {
          throw error;
        }
        throw error;
      }
    },
    evict(organizationId) {
      const runtime = runtimes.get(organizationId);
      runtime?.close();
      runtimes.delete(organizationId);
    },
    closeAll() {
      for (const runtime of runtimes.values()) {
        runtime.close();
      }
      runtimes.clear();
    },
  };
}
