import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppRoute } from "../routing/appRoute";
import { RouteLoadingPage } from "./RouteLoadingPage";

describe("pilot loading chrome", () => {
  it.each([
    [{ name: "clients" }, "Clienți", 4],
    [{ name: "requests" }, "Cereri de ofertă", 2],
    [{ name: "client", customerId: "cus-1" }, "Client", 3],
  ] as const)("keeps the expected metric slots for %s without inventing counts or actions", (route, title, metricCount) => {
    render(<RouteLoadingPage route={route as AppRoute} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect([...document.querySelectorAll(".pilot-instrument__metric-value")].map((node) => node.textContent)).toEqual(Array(metricCount).fill("—"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Se încarcă pagina.");
  });
});
