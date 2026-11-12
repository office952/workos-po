import { describe, expect, it } from "vitest";
import {
  CATALOG_ADMIN_RETURN_LABEL,
  CONFIGURATOR_ADMIN_RETURN_LABEL,
  administrationReturnFromSearch,
} from "./administrationReturn";

const LETTERS = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

describe("administrationReturnFromSearch", () => {
  it("returns to the Configurator that opened administration", () => {
    const standalone = administrationReturnFromSearch(
      `?component=LIGHTING_FRONT_LED&return=${encodeURIComponent(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}`)}`,
    );
    expect(standalone).toEqual({
      href: `/configurator?customer=cus-1&request=req-1&product=${LETTERS}`,
      label: CONFIGURATOR_ADMIN_RETURN_LABEL,
    });
    const member = administrationReturnFromSearch(
      `?return=${encodeURIComponent(`/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm:1&role=SIGNAGE_LETTERS`)}`,
    );
    expect(member).toEqual({
      href: `/configurator?customer=cus-1&request=req-1&product=${LETTERS}&assembly=asm%3A1&role=SIGNAGE_LETTERS`,
      label: CONFIGURATOR_ADMIN_RETURN_LABEL,
    });
  });

  it("keeps the Catalog return and falls back when the destination is invalid", () => {
    expect(
      administrationReturnFromSearch(
        "?component=LIGHTING_FRONT_LED&return=%2Fcatalog%3Fproduct%3DPRD-TEST%26component%3DLIGHTING",
      ),
    ).toEqual({
      href: "/catalog?product=PRD-TEST&component=LIGHTING",
      label: CATALOG_ADMIN_RETURN_LABEL,
    });
    expect(administrationReturnFromSearch("?component=LIGHTING_FRONT_LED")).toEqual({
      href: "/catalog",
      label: CATALOG_ADMIN_RETURN_LABEL,
    });
    expect(
      administrationReturnFromSearch(
        "?return=https://example.test/configurator?customer=cus-1",
      ),
    ).toEqual({
      href: "/catalog",
      label: CATALOG_ADMIN_RETURN_LABEL,
    });
  });
});
