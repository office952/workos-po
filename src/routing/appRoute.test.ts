import { describe, expect, it } from "vitest";
import {
  canonicalLocation,
  atelierHref,
  requestProductHref,
  configuratorHref,
  executionHref,
  parseJobContext,
  parseTaskContext,
  ADMINISTRATION_HREF,
  isAdministrationPath,
  navItemCurrent,
  parseAppRoute,
  parseCustomerContext,
  parseSpineContext,
  quoteHref,
} from "./appRoute";

describe("parseAppRoute", () => {
  it("maps the slice paths", () => {
    expect(parseAppRoute("/")).toEqual({ name: "home" });
    expect(parseAppRoute("/admin")).toEqual({ name: "admin" });
    expect(parseAppRoute("/clienti")).toEqual({ name: "clients" });
    expect(parseAppRoute("/configurator")).toEqual({ name: "configurator" });
    expect(parseAppRoute("/clienti/cus-1")).toEqual({ name: "client", customerId: "cus-1" });
    expect(parseAppRoute("/cereri")).toEqual({ name: "requests" });
    expect(parseAppRoute("/cereri/noua")).toEqual({ name: "new-request" });
    expect(parseAppRoute("/cereri/req-1")).toEqual({ name: "request", requestId: "req-1" });
    expect(parseAppRoute("/catalog")).toEqual({ name: "catalog" });
    expect(parseAppRoute("/oferte")).toEqual({ name: "quotes" });
    expect(parseAppRoute("/lucrari")).toEqual({ name: "jobs" });
    expect(parseAppRoute("/lucrari/job-1")).toEqual({ name: "job", jobId: "job-1" });
    expect(parseAppRoute("/planificare")).toEqual({ name: "planning" });
    expect(parseAppRoute("/atelier")).toEqual({ name: "atelier" });
    expect(parseAppRoute("/executie/exp-1")).toEqual({ name: "execution", planId: "exp-1" });
    expect(parseAppRoute("/admin/resources")).toEqual({ name: "admin-resources" });
    expect(parseAppRoute("/admin/services")).toEqual({ name: "admin-services" });
    expect(parseAppRoute("/admin/material-readiness")).toEqual({
      name: "admin-material-readiness",
    });
    expect(parseAppRoute("/admin/external-production")).toEqual({
      name: "admin-external-production",
    });
    expect(parseAppRoute("/admin/commercial")).toEqual({ name: "admin-commercial" });
    expect(parseAppRoute("/admin/technical")).toEqual({ name: "admin-technical" });
    expect(parseAppRoute("/admin/formulas")).toEqual({ name: "admin-formulas" });
    expect(parseAppRoute("/admin/products")).toEqual({ name: "admin-products" });
    expect(parseAppRoute("/admin/access")).toEqual({ name: "admin-access" });
    expect(parseAppRoute("/admin/people")).toEqual({ name: "admin-people" });
    expect(parseAppRoute("/admin/people/per%3A1")).toEqual({
      name: "admin-person",
      personId: "per:1",
    });
    expect(parseAppRoute("/admin/workcenters")).toEqual({ name: "admin-workcenters" });
    expect(parseAppRoute("/admin/workcenters/wc%3A1")).toEqual({
      name: "admin-workcenter",
      workcenterId: "wc:1",
    });
    expect(parseAppRoute("/admin/workcenters/wc%3A1/machines/mch%3A2")).toEqual({
      name: "admin-machine",
      workcenterId: "wc:1",
      machineId: "mch:2",
    });
    expect(parseAppRoute("/foundation")).toEqual({ name: "foundation" });
    expect(parseAppRoute(quoteHref("PRD-LETTERS-FRONTLIT-PLEXI-AL06", "q1"))).toEqual({
      name: "quote",
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      quoteSnapshotId: "q1",
    });
  });

  it("reads customer context from search without exposing it as a route name", () => {
    expect(parseCustomerContext("?customer=cus-1")).toBe("cus-1");
    expect(parseCustomerContext("customer=cus-1")).toBe("cus-1");
    expect(parseCustomerContext("?customer=")).toBeNull();
    expect(parseCustomerContext("")).toBeNull();
  });

  it("builds configurator context from the request, not a hardcoded product", () => {
    expect(
      parseSpineContext("?customer=cus-1&request=req-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06"),
    ).toEqual({
      customerId: "cus-1",
      requestId: "req-1",
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    });
    expect(
      configuratorHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: "PRD-OTHER",
      }),
    ).toBe("/configurator?customer=cus-1&request=req-1&product=PRD-OTHER");
    expect(canonicalLocation("/", "")).toBeNull();
    expect(canonicalLocation("/", "?product=PRD-OTHER")).toBe(
      "/configurator?product=PRD-OTHER",
    );
    expect(navItemCurrent("/clienti", "/clienti")).toBe(true);
    expect(navItemCurrent("/configurator", "/configurator")).toBe(true);
    expect(navItemCurrent("/", "/clienti")).toBe(false);
    expect(navItemCurrent("/", "/")).toBe(true);
    expect(navItemCurrent("/", "/configurator")).toBe(false);
    expect(navItemCurrent("/admin/products", "/admin")).toBe(true);
    expect(navItemCurrent("/admin/products", "/admin/resources")).toBe(false);
    expect(navItemCurrent("/quotes/PRD-X/q-1", "/oferte")).toBe(true);
    expect(navItemCurrent("/quotes/PRD-X/q-1", "/lucrari")).toBe(false);
    expect(navItemCurrent("/cereri/req-1", "/cereri")).toBe(true);
    expect(navItemCurrent("/lucrari/job-1", "/lucrari")).toBe(true);
    expect(navItemCurrent("/executie/exp-1", "/atelier")).toBe(true);
    expect(navItemCurrent("/executie/exp-1", "/lucrari")).toBe(false);
    expect(isAdministrationPath("/admin/resources")).toBe(true);
    expect(isAdministrationPath("/admin/commercial")).toBe(true);
    expect(isAdministrationPath("/admin/technical")).toBe(true);
    expect(navItemCurrent("/admin/technical", ADMINISTRATION_HREF)).toBe(true);
    expect(navItemCurrent("/admin/resources", ADMINISTRATION_HREF)).toBe(true);
    expect(navItemCurrent("/admin/commercial", ADMINISTRATION_HREF)).toBe(true);
    expect(navItemCurrent("/clienti", ADMINISTRATION_HREF)).toBe(false);
    expect(navItemCurrent("/oferte", ADMINISTRATION_HREF)).toBe(false);
    expect(
      requestProductHref("req-1"),
    ).toBe("/cereri/req-1?alege-produs=1#alege-produs");

    expect(atelierHref({ jobId: "ord-1" })).toBe("/atelier?job=ord-1");
    expect(executionHref("exp-1", { taskId: "task-1", jobId: "ord-1" })).toBe(
      "/executie/exp-1?task=task-1&job=ord-1",
    );
    expect(parseJobContext("?job=ord-1")).toBe("ord-1");
    expect(parseTaskContext("?task=task-1")).toBe("task-1");
  });
});

it("redirects historical commercial Catalog URLs to request intake/selection", () => {
  expect(canonicalLocation("/catalog", "?request=req%3A1&customer=cus%3A1")).toBe("/cereri/req%3A1?alege-produs=1#alege-produs");
  expect(canonicalLocation("/catalog", "?customer=cus%3A1")).toBe("/cereri/noua?customer=cus%3A1");
  expect(canonicalLocation("/catalog", "?product=PRD-TEST")).toBeNull();
});
