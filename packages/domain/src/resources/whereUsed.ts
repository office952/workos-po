import { productTemplates } from "../product/productRegistry.js";
import type { ComponentRole, ComponentTypeId } from "../product/types.js";
import { liveResourceIdsForType } from "./resolve.js";

export type ResourceUse = {
  resourceId: string;
  typeId: ComponentTypeId;
  role: ComponentRole;
  productCode: string;
  productLabel: string;
};

export function resourceWhereUsed(resourceId: string): ResourceUse[] {
  return productTemplates.flatMap((template) =>
    template.components
      .filter((component) =>
        liveResourceIdsForType(component.typeId).includes(resourceId),
      )
      .map((component) => ({
        resourceId,
        typeId: component.typeId,
        role: component.id as ComponentRole,
        productCode: template.code,
        productLabel: template.label,
      })),
  );
}
