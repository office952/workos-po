import { describe, expect, it } from "vitest";
import { routeCapability } from "../routing/routeCapability";
import { parseAppRoute } from "../routing/appRoute";
import { visibleNavGroups } from "./globalNav";

const ids = (capabilities: readonly string[] | null) =>
  visibleNavGroups(capabilities).flatMap((group) => group.items.map((item) => item.id));

describe("V1 navigation reflects server capabilities", () => {
  it("keeps every module when the server sends no capabilities (single-plane / legacy)", () => {
    expect(ids(null)).toEqual(["clients", "requests", "quotes", "jobs", "atelier", "catalog", "administration"]);
  });

  it("shows the workshop only Lucrări and Atelier", () => {
    expect(ids(["jobs.read", "execution.operate"])).toEqual(["jobs", "atelier"]);
  });

  it("shows production no Oferte", () => {
    const production = ["org.settings.read", "resources.read", "customers.read", "requests.read", "planning.read", "planning.manage", "production.release", "jobs.read", "jobs.files.write", "execution.operate", "execution.supervise", "materials.decide", "inventory.read"];
    expect(ids(production)).not.toContain("quotes");
    expect(ids(production)).toContain("jobs");
  });

  it("a narrowed group describes only what remains (no hidden module in the summary)", () => {
    const production = ["org.settings.read", "customers.read", "requests.read", "jobs.read", "execution.operate"];
    const commercial = visibleNavGroups(production).find((group) => group.items.some((item) => item.id === "clients"));
    expect(commercial?.summary).toBe("Clienți și Cereri.");
    // Full groups (owner/member, or no capabilities) keep their original summary.
    expect(visibleNavGroups(null).find((group) => group.items.some((item) => item.id === "clients"))?.summary).toBe("Clienți, cereri și oferte.");
  });

  it("maps routes to the capability the page needs", () => {
    expect(routeCapability(parseAppRoute("/oferte"))).toBe("quotes.read");
    expect(routeCapability(parseAppRoute("/admin/access"))).toBe("org.access.read");
    expect(routeCapability(parseAppRoute("/cont/securitate"))).toBeNull();
    expect(routeCapability(parseAppRoute("/atelier"))).toBe("execution.operate");
  });
});
