export type CostQualifier = {
  volumeDepthMm?: number;
};

import type { ProductResourceUnit } from "./catalog.js";

export type ResourceRequirement = {
  componentId: string;
  resourceId: string;
  quantity: number;
  unit: ProductResourceUnit;
  costQualifier?: CostQualifier;
};
