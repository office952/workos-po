import { getComponentType } from "../product/componentTypes.js";
import { productTemplates } from "../product/productRegistry.js";
import type { ComponentRole, ComponentTypeId } from "../product/types.js";
import { getOperationalProcess } from "./catalog.js";
import { lettersProcessCompositionInspections } from "./composition.js";

export type ProcessUse = {
  processId: string;
  typeId: ComponentTypeId;
  role: ComponentRole;
  typeLabel: string;
  productCode: string;
  productLabel: string;
  displayLine: string;
};

export function processWhereUsed(processId: string): ProcessUse[] {
  const process = getOperationalProcess(processId);
  if (!process) {
    return [];
  }
  const typeUses = productTemplates.flatMap((template) =>
    template.components
      .filter((component) => process.applicableTypeIds.includes(component.typeId))
      .map((component) => {
        const typeLabel = getComponentType(component.typeId).label;
        const role = component.id as ComponentRole;
        const roleLabel = componentRoleLabel(role);
        return {
          processId,
          typeId: component.typeId,
          role,
          typeLabel,
          productCode: template.code,
          productLabel: template.label,
          displayLine: `${template.label} — ${roleLabel} / ${typeLabel}`,
        };
      }),
  );
  if (typeUses.length > 0) {
    return typeUses;
  }
  return productTemplates.flatMap((template) => {
    const used = lettersProcessCompositionInspections(template).some((item) =>
      item.composition.nodes.some((node) => node.processId === processId),
    );
    if (!used) {
      return [];
    }
    return [
      {
        processId,
        typeId: template.components[0]?.typeId ?? "PLEXIGLAS_FACE",
        role: "FACE",
        typeLabel: template.label,
        productCode: template.code,
        productLabel: template.label,
        displayLine: `${template.label} — produs`,
      },
    ];
  });
}

function componentRoleLabel(role: ComponentRole): string {
  switch (role) {
    case "FACE":
      return "Față";
    case "VOLUME":
      return "Volum";
    case "BACK":
      return "Spate";
    case "LIGHTING":
      return "Iluminare";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
