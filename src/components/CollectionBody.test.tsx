import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { collectionViewState } from "./collectionViewState";
import { CollectionBody } from "./LoadingFloor";

describe("collectionViewState", () => {
  it("maps resource counts onto the shared collection states", () => {
    expect(collectionViewState("loading", 0, 0)).toBe("loading");
    expect(collectionViewState("error", 0, 0)).toBe("error");
    expect(collectionViewState("success", 0, 0)).toBe("empty");
    expect(collectionViewState("success", 4, 0)).toBe("filtered-empty");
    expect(collectionViewState("success", 4, 2)).toBe("ready");
    expect(collectionViewState("loading", 4, 2)).toBe("refreshing");
  });
});

describe("CollectionBody", () => {
  it("reserves the worklist family while loading without fabricating rows", () => {
    render(
      <CollectionBody
        status="loading"
        itemCount={0}
        visibleCount={0}
        loadingLabel="Se citesc clienții"
        columns={["Client", "Loc", "Stare", "Acțiune"]}
        worklistLabel="Clienți înregistrați"
        variant="commercial"
        errorTitle="Lista nu a putut fi citită"
        errorBody="Clienții nu sunt disponibili."
        empty={<p>Gol</p>}
        filteredEmpty={<p>Filtrat</p>}
      >
        <span>rând</span>
      </CollectionBody>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Se citesc clienții");
    expect(document.querySelector(".worklist--commercial")).not.toBeNull();
    expect(document.querySelectorAll(".worklist__head span")).toHaveLength(4);
    expect(screen.queryByText("rând")).not.toBeInTheDocument();
  });

  it("keeps visible rows when refreshing instead of blanking the list", () => {
    render(
      <CollectionBody
        status="loading"
        itemCount={2}
        visibleCount={1}
        loadingLabel="Se citesc clienții"
        columns={["Client", "Loc", "Stare", "Acțiune"]}
        worklistLabel="Clienți înregistrați"
        variant="commercial"
        errorTitle="Lista nu a putut fi citită"
        errorBody="Clienții nu sunt disponibili."
        empty={<p>Gol</p>}
        filteredEmpty={<p>Filtrat</p>}
      >
        <span>Client vizibil</span>
      </CollectionBody>,
    );

    const list = screen.getByLabelText("Clienți înregistrați");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list).toHaveTextContent("Client vizibil");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the structural error state when the collection cannot load", () => {
    render(
      <CollectionBody
        status="error"
        itemCount={0}
        visibleCount={0}
        loadingLabel="Se citesc clienții"
        columns={["Client"]}
        worklistLabel="Clienți"
        errorTitle="Lista nu a putut fi citită"
        errorBody="Clienții nu sunt disponibili în acest runtime."
        empty={<p>Gol</p>}
        filteredEmpty={<p>Filtrat</p>}
      >
        <span>rând</span>
      </CollectionBody>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Lista nu a putut fi citită");
    expect(alert).toHaveTextContent("Clienții nu sunt disponibili în acest runtime.");
  });
});
