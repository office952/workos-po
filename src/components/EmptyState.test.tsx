import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

describe("EmptyState", () => {
  it("names the empty collection and an existing action", () => {
    render(
      <EmptyState
        title="Nu există cereri"
        description="Începe de la un client."
        action={
          <a className="text-link" href="/clienti">
            Începe de la un client
          </a>
        }
      />,
    );

    expect(screen.getByText("Nu există cereri")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Începe de la un client" })).toHaveAttribute(
      "href",
      "/clienti",
    );
  });
});

describe("ErrorState", () => {
  it("announces a structural failure without internal jargon", () => {
    render(
      <ErrorState title="Lista nu a putut fi citită">
        Clienții nu sunt disponibili în acest runtime.
      </ErrorState>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Lista nu a putut fi citită");
    expect(screen.getByRole("alert")).not.toHaveTextContent("TransportError");
  });
});
