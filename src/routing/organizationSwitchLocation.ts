import { parseAppRoute } from "./appRoute";

/**
 * After a successful organization switch, leave a previous-org record URL that cannot be
 * read in the new organization. List and Start routes stay: they reload for the new org.
 * Client dossier stays: isolation re-fetch on the same URL is an existing valid flow.
 */
export function safeHrefAfterOrganizationSwitch(pathname: string, search = ""): string | null {
  const route = parseAppRoute(pathname);
  const query = search.startsWith("?") ? search.slice(1) : search;
  switch (route.name) {
    case "home":
    case "clients":
    case "client":
    case "requests":
    case "new-request":
    case "catalog":
    case "assembly":
    case "quotes":
    case "jobs":
    case "planning":
    case "admin":
    case "admin-resources":
    case "admin-services":
    case "admin-material-readiness":
    case "admin-external-production":
    case "admin-commercial":
    case "admin-offering":
    case "admin-company":
    case "admin-technical":
    case "admin-formulas":
    case "admin-products":
    case "admin-access":
    case "admin-people":
    case "admin-workcenters":
    case "account-security":
    case "foundation":
    case "unknown":
      return null;
    case "request":
      return "/cereri";
    case "configurator":
      return "/";
    case "quote":
    case "assembly-quote":
      return "/oferte";
    case "job":
      return "/lucrari";
    case "execution":
      return "/atelier";
    case "atelier": {
      const params = new URLSearchParams(query);
      return params.has("plan") || params.has("task") || params.has("job") ? "/atelier" : null;
    }
    case "admin-person":
      return "/admin/people";
    case "admin-workcenter":
    case "admin-machine":
      return "/admin/workcenters";
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}
