import { describe, expect, it } from "vitest";
import { TransportError } from "../../../api/http";
import { checkLogoSize, logoFailure, logoStateFrom, precheckLogoFile } from "./logoModel";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("logo dialog checks (N-023)", () => {
  it("accepts PNG, JPEG and WebP by type or extension and refuses the rest before reading the file", () => {
    expect(precheckLogoFile(file("sigla.png", "image/png"))).toBeNull();
    expect(precheckLogoFile(file("sigla.JPG", "image/jpeg"))).toBeNull();
    expect(precheckLogoFile(file("sigla.webp", ""))).toBeNull();
    expect(precheckLogoFile(file("sigla.svg", "image/svg+xml"))).toBe("UNSUPPORTED_FORMAT");
    expect(precheckLogoFile(file("sigla.gif", "image/gif"))).toBe("UNSUPPORTED_FORMAT");
    expect(precheckLogoFile(file("sigla.jpg", "image/png"))).toBe("TYPE_MISMATCH");
    expect(precheckLogoFile(file("sigla.png", "image/png", 0))).toBe("EMPTY");
    expect(precheckLogoFile(file("sigla.png", "image/png", 2 * 1024 * 1024 + 1))).toBe("TOO_LARGE");
    expect(checkLogoSize({ width: 4096, height: 10 })).toBeNull();
    expect(checkLogoSize({ width: 4097, height: 10 })).toBe("DIMENSIONS");
  });

  it("reads the server's answers in the operator's words, never with internal codes", () => {
    const conflict = logoFailure(new TransportError("x", 409, { error: "stale_revision", logoRevision: 5, logo: null }));
    expect(conflict).toEqual({ kind: "conflict", current: { logo: null, revision: 5 } });
    const refused = logoFailure(new TransportError("x", 422, { error: "invalid_logo", reason: "ANIMATED" }));
    expect(refused).toEqual({ kind: "refused", text: "O imagine animată nu poate fi folosită ca siglă." });
    expect(logoFailure(new TransportError("x", 413, { error: "file_too_large" }))).toMatchObject({ kind: "refused", text: "Fișierul depășește 2 MB." });
    const failed = logoFailure(new TypeError("Failed to fetch"));
    expect(failed.kind).toBe("error");
    for (const result of [conflict, refused, failed]) expect(JSON.stringify(result)).not.toMatch(/expectedRevision|storageKey|MIME|stale_revision|invalid_logo/);
    expect(logoStateFrom({ logoRevision: -1 })).toBeNull();
  });
});
