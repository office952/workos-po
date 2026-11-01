import { CLIENT_HUB_SECTION_LABEL } from "../presentation/clientHub";
import { jobSheetSectionLabel } from "../presentation/jobSheetSections";
import { parseClientHubSection, parseJobSheetSection } from "./appRoute";

/**
 * N-018 · names where a held navigation leads, for the unsaved-changes question ("Dacă pleci
 * spre Atelier"). Derived from the path only; unknown destinations get a neutral name.
 * `fromPath`: the page the reader is on; another section of the same client page is then named by
 * its tab (N-020 · "Dacă pleci spre Sedii"), while a link from elsewhere keeps "fișa clientului".
 */
export function describeDestination(href: string, fromPath?: string): string {
  const url = new URL(href, "https://workos.local");
  const path = url.pathname;
  if (path === "/atelier" || /^\/(?:executie|execution)\//.test(path)) return "Atelier";
  if (/^\/lucrari\/[^/]+$/.test(path)) return url.searchParams.get("sectiune") ? jobSheetSectionLabel(parseJobSheetSection(url.search)) : "fișa lucrării";
  if (path === "/lucrari") return "Lucrări";
  if (/^\/clienti\/[^/]+$/.test(path)) {
    if (url.searchParams.get("lucrare")?.startsWith("job:")) return "memoria lucrării";
    return fromPath === path ? CLIENT_HUB_SECTION_LABEL[parseClientHubSection(url.search)] : "fișa clientului";
  }
  if (path === "/clienti") return "Clienți";
  if (/^\/cereri\/[^/]+$/.test(path)) return "cerere";
  if (path === "/cereri") return "Cereri";
  if (path.startsWith("/oferte/") || path.startsWith("/quotes/")) return "ofertă";
  if (path === "/oferte") return "Oferte";
  if (path === "/") return "pagina de start";
  return "pagina cerută";
}
