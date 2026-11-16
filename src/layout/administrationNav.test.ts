import { describe, expect, it } from "vitest";
import { parseAppRoute } from "../routing/appRoute";
import { administrationDomains } from "./administrationNav";

/**
 * R3 route inventory, reconciled with the router:
 * - Hub: /admin
 * - 13 Administration destinations, each a route the router names `admin-*`
 *   (Commercial & Financial V1 adds „Firma › Date firmă” and „Reguli de ofertare”);
 * - 3 detail routes that open inside two of them (person; zone; machine);
 * - Catalog: a separate workspace, listed once as an external link, never an admin route.
 */
describe("administration route inventory", () => {
  const items = administrationDomains().flatMap((domain) => domain.items);
  const internal = items.filter((item) => !item.external);
  const external = items.filter((item) => item.external);

  it("has six domains, thirteen admin destinations and one Catalog link", () => {
    expect(administrationDomains().map((domain) => domain.label)).toEqual([
      "Firma",
      "Ce oferi",
      "Cum calculezi",
      "Echipa și atelierul",
      "Execuția",
      "Accesul",
    ]);
    expect(internal).toHaveLength(13);
    expect(external.map((item) => item.href)).toEqual(["/catalog"]);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });

  it("resolves every destination to an admin route, the Catalog link to a non-admin one", () => {
    expect(parseAppRoute("/admin").name).toBe("admin");
    for (const item of internal) {
      expect(parseAppRoute(item.href).name).toMatch(/^admin-/);
    }
    expect(parseAppRoute("/catalog").name).not.toMatch(/^admin/);
  });

  it("keeps the three detail routes inside People and Zone și utilaje", () => {
    expect(parseAppRoute("/admin/people/per%3Aa").name).toBe("admin-person");
    expect(parseAppRoute("/admin/workcenters/wc%3Aa").name).toBe("admin-workcenter");
    expect(parseAppRoute("/admin/workcenters/wc%3Aa/machines/m%3Ab").name).toBe("admin-machine");
  });
});
