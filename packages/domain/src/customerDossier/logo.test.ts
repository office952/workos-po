import { describe, expect, it } from "vitest";
import { customerLogoContentHref, inspectCustomerLogo, readCustomerLogoExpectedRevision } from "./logo.js";

// A 1 × 1 RGBA PNG: signature, IHDR, IDAT (zlib of "0 0 0 0 0"), IEND, with their CRCs.
const PNG_1X1 = Uint8Array.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c6360000200000500017a5eab3f0000000049454e44ae426082"
    .match(/../g)!
    .map((pair) => parseInt(pair, 16)),
);

describe("N-023 · customer logo contract", () => {
  it("names the content by customer and revision, never by storage", () => {
    expect(customerLogoContentHref("cus:1 a", 3)).toBe("/api/customers/cus%3A1%20a/logo/content?revision=3");
  });

  it("reads expectedRevision as an integer ≥ 0 from a form field, a query or JSON", () => {
    expect(readCustomerLogoExpectedRevision("0")).toBe(0);
    expect(readCustomerLogoExpectedRevision(" 12 ")).toBe(12);
    expect(readCustomerLogoExpectedRevision(4)).toBe(4);
    for (const bad of [undefined, null, "", "-1", "1.5", "abc", -1, 1.5, "1e3"]) expect(readCustomerLogoExpectedRevision(bad)).toBeNull();
  });

  it("recognizes a PNG from its bytes and returns its size and image data for inflation", () => {
    const inspected = inspectCustomerLogo(PNG_1X1, { mimeType: "image/png", fileName: "s.png" });
    expect(inspected).toMatchObject({ ok: true, image: { mimeType: "image/png", width: 1, height: 1, png: { inflatedBytes: 5, rowBytes: 4 } } });
    // Interlaced: the announced size counts the reduced passes (a 1 × 1 image has only the first).
    const interlaced = PNG_1X1.slice();
    interlaced[28] = 1; // interlace method; the CRC no longer matches
    expect(inspectCustomerLogo(interlaced, { mimeType: null, fileName: "s.png" })).toEqual({ ok: false, reason: "MALFORMED" });
  });

  it("judges the bytes, not the name or the declared type", () => {
    expect(inspectCustomerLogo(PNG_1X1, { mimeType: "image/webp", fileName: "s.png" })).toEqual({ ok: false, reason: "TYPE_MISMATCH" });
    expect(inspectCustomerLogo(PNG_1X1, { mimeType: null, fileName: "s.gif" })).toEqual({ ok: false, reason: "TYPE_MISMATCH" });
    expect(inspectCustomerLogo(PNG_1X1, { mimeType: "application/octet-stream", fileName: "sigla" }).ok).toBe(true);
    expect(inspectCustomerLogo(new TextEncoder().encode("<svg/>"), { mimeType: "image/svg+xml", fileName: "s.svg" })).toEqual({ ok: false, reason: "UNSUPPORTED_FORMAT" });
  });
});
