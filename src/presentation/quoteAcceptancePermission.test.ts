import { describe, expect, it } from "vitest";
import { presentQuoteAcceptancePermission } from "./quoteAcceptancePermission";

const ready = { roleReady: true, unavailable: false, serverAllows: true };

describe("presentQuoteAcceptancePermission", () => {
  it("lets the owner accept when the server allows it", () => {
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "cloud", role: "owner" }).allowed).toBe(true);
  });

  it("lets a ready single-plane session accept without inventing an owner role", () => {
    const permission = presentQuoteAcceptancePermission({ ...ready, mode: "single_plane", role: null });
    expect(permission.allowed).toBe(true);
    expect(permission.message).not.toContain("Proprietar");
  });

  it("hides acceptance from a member", () => {
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "cloud", role: "member" }).allowed).toBe(false);
  });

  it("does not authorize a cloud session whose role was not read", () => {
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "cloud", role: null }).allowed).toBe(false);
  });

  it("does not authorize an incomplete or unavailable session", () => {
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "cloud", role: "owner", roleReady: false }).allowed).toBe(false);
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "single_plane", role: null, unavailable: true }).allowed).toBe(false);
  });

  it("keeps the server refusal even for an owner", () => {
    expect(presentQuoteAcceptancePermission({ ...ready, mode: "cloud", role: "owner", serverAllows: false }).allowed).toBe(false);
  });
});
