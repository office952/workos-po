import { describe, expect, it } from "vitest";
import { loadingFloorVariantFor, presentRouteChrome } from "./routeChrome";

describe("routeChrome layout contract", () => {
  it("loads Configurator as a configuration workspace, not catalog", () => {
    expect(presentRouteChrome({ name: "configurator" }).workspace).toBe("configuration");
  });

  it("loads Clienți in the pilot registry without a permanent creation rail", () => {
    const chrome = presentRouteChrome({ name: "clients" });
    expect(chrome.workspace).toBe("stack");
    expect(loadingFloorVariantFor(chrome.workspace)).toBe("registry");
    expect(chrome.pilot?.surface).toBe("clients-registry");
    expect(chrome.pilot?.metrics).toEqual(["Total", "Activi", "Retrași", "Necesită acțiune"]);
  });

  it("loads Request with neutral copy that does not invent catalog or installation truth", () => {
    const chrome = presentRouteChrome({ name: "request", requestId: "req-1" });

    expect(chrome.contextLabel).toBe("Cerere");
    expect(chrome.currentHref).toBe("/cereri/req-1");
    expect(chrome.workspace).toBe("object");
    expect(chrome.eyebrow).toBe("Cerere");
    expect(chrome.title).toBe("Cerere");
    expect(chrome.lead).toBe("Se încarcă detaliile cererii și următorul pas disponibil.");
    expect(chrome.lead).not.toMatch(/Nu adăuga montaj/);
    expect(chrome.lead).not.toMatch(/Alege produsul din catalog/);
  });

  it("maps every workspace family to a loading floor without inventing a new chassis", () => {
    expect(loadingFloorVariantFor("stack")).toBe("registry");
    expect(loadingFloorVariantFor("object")).toBe("object");
    expect(loadingFloorVariantFor("catalog")).toBe("form");
    expect(loadingFloorVariantFor("configuration")).toBe("form");
    expect(loadingFloorVariantFor("traveler")).toBe("traveler");
    expect(loadingFloorVariantFor("operational")).toBe("operational");
    expect(loadingFloorVariantFor("operational-gate")).toBe("operational");
    expect(loadingFloorVariantFor("admin")).toBe("admin");
    expect(loadingFloorVariantFor("launchpad")).toBe("registry");
  });
});
