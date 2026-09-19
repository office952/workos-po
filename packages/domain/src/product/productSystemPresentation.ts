import { projectProductCatalog } from "./catalogProjection.js";
import { projectComponentArchitecture } from "./componentProjection.js";
import {
  presentedTemplate,
  type DisplayLabelCatalog,
} from "./displayMetadata.js";
import { getFormSchemaForTemplate } from "./productRegistry.js";
import { projectProductSystemAdministration } from "./productSystemAdmin.js";

export function presentProductSystem(labels: DisplayLabelCatalog) {
  return {
    catalog: projectProductCatalog(labels),
    components: projectComponentArchitecture(labels),
    admin: projectProductSystemAdministration(labels),
    template(code: string) {
      return presentedTemplate(code, labels);
    },
    formSchema(code: string) {
      return getFormSchemaForTemplate(code);
    },
  };
}
