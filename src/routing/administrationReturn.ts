import { sanitizeCatalogReturn } from "../features/catalog/catalogSelection";
import { sanitizeConfiguratorReturn } from "./configuratorReturn";

export const CATALOG_ADMIN_RETURN_LABEL = "Înapoi la definițiile produselor";
export const CONFIGURATOR_ADMIN_RETURN_LABEL = "Înapoi la configurare";

export type AdministrationReturn = {
  href: string;
  label: string;
};

function readReturnParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("return");
}

/** Configurator origin wins when the return is a valid in-app Configurator path; Catalog fallback is unchanged. */
export function administrationReturnFromSearch(search: string): AdministrationReturn {
  const raw = readReturnParam(search);
  const configurator = sanitizeConfiguratorReturn(raw);
  if (configurator) {
    return { href: configurator, label: CONFIGURATOR_ADMIN_RETURN_LABEL };
  }
  return {
    href: sanitizeCatalogReturn(raw) ?? "/catalog",
    label: CATALOG_ADMIN_RETURN_LABEL,
  };
}
