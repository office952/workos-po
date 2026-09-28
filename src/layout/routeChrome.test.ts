import { describe, expect, it } from "vitest";
import { loadingFloorForRoute, layoutForRouteName, STRUCTURAL_LAYOUTS } from "./pageLayout";
import { presentRouteChrome } from "./routeChrome";

describe("route chrome layout contract", () => {
  it("loads Configurator as a workbench", () => {
    expect(presentRouteChrome({ name: "configurator" }).layout).toBe("WORKBENCH");
  });

  it("loads Clienți and Cereri as registries", () => {
    expect(presentRouteChrome({ name: "clients" }).layout).toBe("REGISTRY");
    expect(presentRouteChrome({ name: "requests" }).layout).toBe("REGISTRY");
    expect(loadingFloorForRoute("clients")).toBe("registry");
    expect(loadingFloorForRoute("requests")).toBe("registry");
  });

  it("loads a request as object detail and a frozen quote as a record document", () => {
    const request = presentRouteChrome({ name: "request", requestId: "req-1" });
    expect(request.contextLabel).toBe("Cerere");
    expect(request.currentHref).toBe("/cereri/req-1");
    expect(request.layout).toBe("OBJECT_DETAIL");
    expect(request.variant).toBe("standard");
    expect(request.lead).toBe("Se încarcă detaliile cererii și următorul pas disponibil.");
    expect(request.lead).not.toMatch(/Nu adăuga montaj/);
    expect(request.lead).not.toMatch(/Alege produsul din catalog/);

    const quote = presentRouteChrome({
      name: "quote",
      productCode: "PRD",
      quoteSnapshotId: "q-1",
    });
    expect(quote.layout).toBe("OBJECT_DETAIL");
    expect(quote.variant).toBe("record-document");
  });

  it("maps each major route onto one of the six structural layouts", () => {
    expect(STRUCTURAL_LAYOUTS).toEqual([
      "START_CONTINUATION",
      "REGISTRY",
      "OBJECT_DETAIL",
      "WORKBENCH",
      "OPERATIONAL",
      "ADMIN_MASTER_DETAIL",
    ]);
    expect(layoutForRouteName("home").layout).toBe("START_CONTINUATION");
    expect(layoutForRouteName("quotes").layout).toBe("REGISTRY");
    expect(layoutForRouteName("jobs").layout).toBe("REGISTRY");
    expect(layoutForRouteName("client").layout).toBe("OBJECT_DETAIL");
    expect(layoutForRouteName("catalog").layout).toBe("WORKBENCH");
    expect(layoutForRouteName("assembly").layout).toBe("WORKBENCH");
    expect(layoutForRouteName("planning")).toEqual({ layout: "OPERATIONAL", variant: "queue" });
    expect(layoutForRouteName("atelier")).toEqual({ layout: "OPERATIONAL", variant: "queue" });
    expect(layoutForRouteName("execution")).toEqual({
      layout: "OPERATIONAL",
      variant: "execution-focus",
    });
    expect(layoutForRouteName("job")).toEqual({
      layout: "OPERATIONAL",
      variant: "execution-focus",
    });
    expect(layoutForRouteName("admin").layout).toBe("ADMIN_MASTER_DETAIL");
    expect(layoutForRouteName("admin-products").layout).toBe("ADMIN_MASTER_DETAIL");
    expect(loadingFloorForRoute("job")).toBe("traveler");
    expect(loadingFloorForRoute("execution")).toBe("operational");
    expect(loadingFloorForRoute("catalog")).toBe("form");
    expect(loadingFloorForRoute("admin")).toBe("admin");
  });
});
