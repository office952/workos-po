import { describe, expect, it } from "vitest";
import {
  canonicalLocation,
  atelierHref,
  catalogHref,
  configuratorHref,
  executionHref,
  parseJobContext,
  parseTaskContext,
  navItemCurrent,
  parseAppRoute,
  parseCustomerContext,
  parseSpineContext,
  quoteHref,
} from "./appRoute";

describe("parseAppRoute", () => {
  it("maps the slice paths", () => {
    expect(parseAppRoute("/")).toEqual({ name: "clients" });
    expect(parseAppRoute("/clienti")).toEqual({ name: "clients" });
    expect(parseAppRoute("/configurator")).toEqual({ name: "configurator" });
    expect(parseAppRoute("/clienti/cus-1")).toEqual({ name: "client", customerId: "cus-1" });
    expect(parseAppRoute("/cereri")).toEqual({ name: "requests" });
    expect(parseAppRoute("/cereri/req-1")).toEqual({ name: "request", requestId: "req-1" });
    expect(parseAppRoute("/catalog")).toEqual({ name: "catalog" });
    expect(parseAppRoute("/oferte")).toEqual({ name: "quotes" });
    expect(parseAppRoute("/lucrari")).toEqual({ name: "jobs" });
    expect(parseAppRoute("/lucrari/job-1")).toEqual({ name: "job", jobId: "job-1" });
    expect(parseAppRoute("/atelier")).toEqual({ name: "atelier" });
    expect(parseAppRoute("/executie/exp-1")).toEqual({ name: "execution", planId: "exp-1" });
    expect(parseAppRoute("/admin/resources")).toEqual({ name: "admin-resources" });
    expect(parseAppRoute("/admin/commercial")).toEqual({ name: "admin-commercial" });
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

  it("builds configurator context from cerere and catalog, not a hardcoded product", () => {
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
    expect(canonicalLocation("/", "")).toBe("/clienti");
    expect(canonicalLocation("/", "?product=PRD-OTHER")).toBe(
      "/configurator?product=PRD-OTHER",
    );
    expect(navItemCurrent("/clienti", "/clienti")).toBe(true);
    expect(navItemCurrent("/configurator", "/configurator")).toBe(true);
    expect(navItemCurrent("/", "/clienti")).toBe(true);
    expect(navItemCurrent("/", "/configurator")).toBe(false);
    expect(navItemCurrent("/quotes/PRD-X/q-1", "/oferte")).toBe(true);
    expect(navItemCurrent("/quotes/PRD-X/q-1", "/lucrari")).toBe(false);
    expect(navItemCurrent("/cereri/req-1", "/cereri")).toBe(true);
    expect(navItemCurrent("/lucrari/job-1", "/lucrari")).toBe(true);
    expect(navItemCurrent("/executie/exp-1", "/atelier")).toBe(true);
    expect(navItemCurrent("/executie/exp-1", "/lucrari")).toBe(false);
    expect(
      catalogHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: null,
      }),
    ).toBe("/catalog?customer=cus-1&request=req-1");
    expect(atelierHref({ jobId: "ord-1" })).toBe("/atelier?job=ord-1");
    expect(executionHref("exp-1", { taskId: "task-1", jobId: "ord-1" })).toBe(
      "/executie/exp-1?task=task-1&job=ord-1",
    );
    expect(parseJobContext("?job=ord-1")).toBe("ord-1");
    expect(parseTaskContext("?task=task-1")).toBe("task-1");
  });
});
