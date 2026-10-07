import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProductPicker } from "./ProductPicker";

it("pages a 100-product collection and resets pagination when searching or changing taxonomy", async () => {
  const products = Array.from({ length: 100 }, (_, index) => ({ code: `P${index}`, label: `Produs ${index}`, description: "", familyLabel: index < 50 ? "Litere" : "Panouri", categoryLabel: index % 2 === 0 ? "Luminos" : "Simplu" }));
  const choose = vi.fn(); render(<ProductPicker products={products} onChoose={choose} />);
  expect(screen.getByText("100 din 100 produse")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^Produs/ })).toHaveLength(20);
  await userEvent.click(screen.getByRole("button", { name: "Următor" }));
  expect(screen.getByText("Pagina 2 din 5")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Caută produs"), "Produs 99");
  expect(screen.getByText("1 din 100 produse")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^Produs 99/ }));
  expect(choose).toHaveBeenCalledWith(products[99]);
  await userEvent.click(screen.getByRole("button", { name: "Resetează filtrele" }));
  await userEvent.selectOptions(screen.getByLabelText("Familie"), "Litere");
  await userEvent.selectOptions(screen.getByLabelText("Categorie"), "Luminos");
  expect(screen.getByText("25 din 100 produse")).toBeInTheDocument();
  expect(screen.getByText("Pagina 1 din 2")).toBeInTheDocument();
});
