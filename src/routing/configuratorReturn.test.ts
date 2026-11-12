import { describe, expect, it } from "vitest";
import { configuratorHref } from "./appRoute";
import {
  configuratorAdminHref,
  configuratorReturnHref,
  sanitizeConfiguratorReturn,
} from "./configuratorReturn";

const LETTERS = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

describe("configuratorReturnHref", () => {
  it("keeps the request spine and does not use configuratorHref for assembly members", () => {
    expect(
      configuratorReturnHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
      }),
    ).toBe(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`);
    expect(
      configuratorHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
      }),
    ).toBe(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`);
    expect(
      configuratorReturnHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
        assemblyId: "asm:1",
        memberRole: "SIGNAGE_LETTERS",
      }),
    ).toBe(
      `/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm%3A1&role=SIGNAGE_LETTERS`,
    );
    expect(
      configuratorHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
      }),
    ).not.toContain("assembly");
  });

  it("omits a partial assembly member instead of emitting an ambiguous return", () => {
    expect(
      configuratorReturnHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
        assemblyId: "asm:1",
      }),
    ).toBe(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`);
    expect(
      configuratorReturnHref({
        customerId: "cus-1",
        requestId: "req-1",
        productCode: LETTERS,
        memberRole: "SIGNAGE_LETTERS",
      }),
    ).toBe(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`);
  });

  it("encodes administration links with the Configurator return", () => {
    const href = configuratorAdminHref("/admin/technical", "LIGHTING_FRONT_LED", {
      customerId: "cus-1",
      requestId: "req-1",
      productCode: LETTERS,
      assemblyId: "asm:1",
      memberRole: "SUPPORT_PANEL",
    });
    const url = new URL(href, "https://workos.local");
    expect(url.pathname).toBe("/admin/technical");
    expect(url.searchParams.get("component")).toBe("LIGHTING_FRONT_LED");
    expect(url.searchParams.get("return")).toBe(
      `/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm%3A1&role=SUPPORT_PANEL`,
    );
  });
});

describe("sanitizeConfiguratorReturn", () => {
  it("accepts standalone and assembly-member Configurator destinations", () => {
    expect(
      sanitizeConfiguratorReturn(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`),
    ).toBe(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`);
    expect(
      sanitizeConfiguratorReturn(
        `/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm:1&role=SIGNAGE_LOGO`,
      ),
    ).toBe(
      `/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm%3A1&role=SIGNAGE_LOGO`,
    );
    expect(sanitizeConfiguratorReturn("/configurator")).toBe("/configurator");
    expect(sanitizeConfiguratorReturn(`/configurator?product=${LETTERS}`)).toBe(
      `/configurator?product=${LETTERS}`,
    );
  });

  it("rejects external, catalog, operational and ambiguous returns", () => {
    expect(sanitizeConfiguratorReturn("/catalog?product=PRD-TEST")).toBeNull();
    expect(sanitizeConfiguratorReturn("/admin/technical")).toBeNull();
    expect(sanitizeConfiguratorReturn("https://example.test/configurator")).toBeNull();
    expect(sanitizeConfiguratorReturn("//example.test/configurator")).toBeNull();
    expect(sanitizeConfiguratorReturn("/configurator?redirect=https://example.test")).toBeNull();
    expect(sanitizeConfiguratorReturn(`/configurator?product=${LETTERS}#https://example.test`)).toBeNull();
    expect(sanitizeConfiguratorReturn("/configurator?product=../admin")).toBeNull();
    expect(sanitizeConfiguratorReturn("/configurator?customer=cus-1&customer=cus-2")).toBeNull();
    expect(
      sanitizeConfiguratorReturn(`/configurator?product=${LETTERS}&assembly=asm:1`),
    ).toBeNull();
    expect(
      sanitizeConfiguratorReturn(`/configurator?product=${LETTERS}&role=SIGNAGE_LETTERS`),
    ).toBeNull();
    expect(
      sanitizeConfiguratorReturn(`/configurator?product=${LETTERS}&assembly=asm:1&role=UNKNOWN`),
    ).toBeNull();
    expect(sanitizeConfiguratorReturn("configurator?product=PRD-TEST")).toBeNull();
    expect(sanitizeConfiguratorReturn("/configurator/extra")).toBeNull();
  });
});
