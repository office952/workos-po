import type { AppRoute } from "./appRoute";

/**
 * V1 Organization Access: the server capability a page needs. The UI uses it only to avoid
 * showing a page the role cannot load; every API call is authorized on the server.
 * `null` = no capability needed (any authenticated role).
 */
export function routeCapability(route: AppRoute): string | null {
  switch (route.name) {
    case "home":
      return "org.settings.read";
    case "clients":
    case "client":
      return "customers.read";
    case "requests":
    case "request":
      return "requests.read";
    case "new-request":
      return "requests.write";
    case "catalog":
      return "org.settings.read";
    case "assembly":
      return "assemblies.read";
    case "configurator":
      return "configurator.use";
    case "quotes":
    case "quote":
    case "assembly-quote":
      return "quotes.read";
    case "jobs":
    case "job":
      return "jobs.read";
    case "planning":
      return "planning.read";
    case "atelier":
    case "execution":
      return "execution.operate";
    // The commercial page explains its owner-only answer itself (unchanged for member).
    case "admin":
    case "admin-services":
    case "admin-material-readiness":
    case "admin-external-production":
    case "admin-technical":
    case "admin-formulas":
    case "admin-products":
    case "admin-commercial":
    case "admin-offering":
    case "admin-company":
      return "org.settings.read";
    case "admin-resources":
    case "admin-people":
    case "admin-person":
    case "admin-workcenters":
    case "admin-workcenter":
    case "admin-machine":
      return "resources.read";
    case "admin-access":
      return "org.access.read";
    case "foundation":
    case "account-security":
    case "unknown":
      return null;
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}
