import { describe, expect, it } from "vitest";
import { safeHrefAfterOrganizationSwitch } from "./organizationSwitchLocation";

describe("safeHrefAfterOrganizationSwitch", () => {
  it("leaves list, start and client-hub routes in place", () => {
    expect(safeHrefAfterOrganizationSwitch("/")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/clienti")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/clienti/cus-one")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/cereri")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/lucrari")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/atelier")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/admin/access")).toBeNull();
    expect(safeHrefAfterOrganizationSwitch("/cont/securitate")).toBeNull();
  });

  it("moves previous-org record URLs to the matching list of the new organization", () => {
    expect(safeHrefAfterOrganizationSwitch("/lucrari/ord%3Ajob-a")).toBe("/lucrari");
    expect(safeHrefAfterOrganizationSwitch("/oferte/produs/PRD-X/qts%3A1")).toBe("/oferte");
    expect(safeHrefAfterOrganizationSwitch("/oferte/ansamblu/asmq%3A1")).toBe("/oferte");
    expect(safeHrefAfterOrganizationSwitch("/cereri/crq%3A1")).toBe("/cereri");
    expect(safeHrefAfterOrganizationSwitch("/configurator", "?customer=cus-1&request=crq-1")).toBe("/");
    expect(safeHrefAfterOrganizationSwitch("/executie/exp%3A1")).toBe("/atelier");
    expect(safeHrefAfterOrganizationSwitch("/atelier", "?plan=exp%3A1")).toBe("/atelier");
    expect(safeHrefAfterOrganizationSwitch("/admin/people/per%3A1")).toBe("/admin/people");
    expect(safeHrefAfterOrganizationSwitch("/admin/workcenters/wc%3A1")).toBe("/admin/workcenters");
    expect(safeHrefAfterOrganizationSwitch("/admin/workcenters/wc%3A1/machines/mch%3A2")).toBe("/admin/workcenters");
  });
});
