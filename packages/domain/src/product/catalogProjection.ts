import { buildCatalogTree } from "./catalog.js";
import {
  presentedCategories,
  presentedFamilies,
  presentedTemplates,
  type DisplayLabelCatalog,
} from "./displayMetadata.js";
import type { CatalogTreeNode } from "./types.js";

export function projectProductCatalog(
  labels: DisplayLabelCatalog,
  options?: { readonly enabledTemplateCodes?: readonly string[] },
): CatalogTreeNode[] {
  const allowed = options?.enabledTemplateCodes
    ? new Set(options.enabledTemplateCodes)
    : null;
  const templates = presentedTemplates(labels).filter((template) =>
    allowed ? allowed.has(template.code) : true,
  );
  return buildCatalogTree(
    presentedFamilies(labels),
    presentedCategories(labels),
    templates,
  );
}
