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
): CatalogTreeNode[] {
  return buildCatalogTree(
    presentedFamilies(labels),
    presentedCategories(labels),
    presentedTemplates(labels),
  );
}
