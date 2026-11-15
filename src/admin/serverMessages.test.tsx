import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransportError } from "../api/http";
import { adminFailureContent, describeAdminException, describeAdminFailure } from "./serverMessages";

describe("describeAdminFailure", () => {
  it("explains a code the page knows, without a diagnostic", () => {
    expect(
      describeAdminFailure(409, { error: "last_owner_removal", reasons: ["Nu poți elimina ultimul Owner activ."] }, {
        last_owner_removal: "Este ultimul proprietar al organizației.",
      }, "Accesul nu a putut fi revocat."),
    ).toEqual({ text: "Este ultimul proprietar al organizației.", diagnostic: null });
  });

  it("uses the shared wording for forbidden when the page has none", () => {
    expect(describeAdminFailure(403, { error: "forbidden" }, {}, "x").text).toMatch(/Nu ai dreptul/);
  });

  it("keeps the server's own reason for an unknown code, with the code for support", () => {
    expect(
      describeAdminFailure(400, { error: "invalid_policy", reasons: ["Adaosul trebuie să fie între 0 și 500."] }, {}, "fallback"),
    ).toEqual({ text: "Adaosul trebuie să fie între 0 și 500.", diagnostic: "invalid_policy · HTTP 400" });
  });

  it("falls back to the page sentence when nothing explains the refusal", () => {
    expect(describeAdminFailure(500, null, {}, "Costul nu a putut fi salvat.")).toEqual({
      text: "Costul nu a putut fi salvat.",
      diagnostic: "fără cod · HTTP 500",
    });
  });

  it("reads a thrown TransportError and treats any other exception as no answer", () => {
    expect(describeAdminException(new TransportError("x", 409, { error: "duplicate_name" }), { duplicate_name: "Există deja." }, "f"))
      .toEqual({ text: "Există deja.", diagnostic: null });
    expect(describeAdminException(new Error("network"), {}, "Nu a putut fi salvat.")).toEqual({
      text: "Nu a putut fi salvat.",
      diagnostic: "fără răspuns de la server",
    });
  });

  it("shows the code only under the support details", () => {
    render(<p>{adminFailureContent({ text: "Nu a putut fi salvat.", diagnostic: "weird_code · HTTP 422" })}</p>);
    expect(screen.getByText("Nu a putut fi salvat.")).toBeInTheDocument();
    expect(screen.getByText("Detalii pentru suport")).toBeInTheDocument();
    expect(screen.getByText(/weird_code · HTTP 422/).closest("details")).not.toBeNull();
  });
});
