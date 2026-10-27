import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentCustomerLogo, presentCustomerRegistry, presentCustomerWorkspace } from "../../adapters/customerAdapter";
import { resetResourceCache } from "../../data/resourceCache";
import { ClientsPage } from "../ClientsPage";
import { ClientMark } from "./ClientMark";

/**
 * N-023 · ClientMark: the logo when there is one that loads, the monogram in every other case; the
 * adapter accepts only the API's own content route; the registry rows and the card use the mark.
 */
const LOGO = { revision: 2, contentHref: "/api/customers/cus-a/logo/content?revision=2", width: 300, height: 120 };

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("ClientMark (N-023)", () => {
  it("shows the monogram without a logo", () => {
    const { container } = render(<ClientMark name="Alpha Clima SRL" logo={null} />);
    const mark = container.querySelector(".client-mark");
    expect(mark).toHaveTextContent("AC");
    expect(mark).not.toHaveAttribute("data-logo");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the logo, decorative and contained, and falls back to the monogram when it fails to load", () => {
    const { container, rerender } = render(<ClientMark name="Alpha Clima SRL" logo={LOGO} size="large" />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", LOGO.contentHref);
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("width", "300");
    expect(container.querySelector(".client-mark")).toHaveAttribute("data-logo");
    expect(container.querySelector(".client-mark")).toHaveAttribute("data-size", "large");
    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".client-mark")).toHaveTextContent("AC");
    // A new revision gets its own chance.
    rerender(<ClientMark name="Alpha Clima SRL" logo={{ ...LOGO, revision: 3, contentHref: "/api/customers/cus-a/logo/content?revision=3" }} size="large" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/customers/cus-a/logo/content?revision=3");
  });
});

describe("customer logo transport (N-023)", () => {
  it("accepts only a complete logo served by the API itself", () => {
    expect(presentCustomerLogo(LOGO)).toEqual(LOGO);
    expect(presentCustomerLogo(null)).toBeNull();
    expect(presentCustomerLogo({ ...LOGO, contentHref: "https://example.test/logo.png" })).toBeNull();
    expect(presentCustomerLogo({ ...LOGO, contentHref: "javascript:alert(1)" })).toBeNull();
    expect(presentCustomerLogo({ ...LOGO, width: 0 })).toBeNull();
    const registry = presentCustomerRegistry({ registry: { customers: [{ customerId: "a", displayName: "A", logo: LOGO }, { customerId: "b", displayName: "B" }] } });
    expect(registry.customers.map((item) => item.logo)).toEqual([LOGO, null]);
    const workspace = presentCustomerWorkspace({ workspace: { customer: { customerId: "a", displayName: "A" }, canCreateRequest: true, logo: LOGO, logoRevision: 4 } });
    expect(workspace).toMatchObject({ logo: LOGO, logoRevision: 4 });
    const older = presentCustomerWorkspace({ workspace: { customer: { customerId: "a", displayName: "A" }, canCreateRequest: true } });
    expect(older).toMatchObject({ logo: null, logoRevision: 0 });
  });
});

describe("registry and card (N-023)", () => {
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
  const ALPHA = { customerId: "cus-a", displayName: "Alpha Clima SRL", status: "ACTIVE", statusLabel: "Activ", openRequestCount: 0, quoteCount: 0, jobCount: 0, needsAttention: false, attentionLabel: null, logo: LOGO };
  const BETA = { customerId: "cus-b", displayName: "Beta Signs SRL", status: "RETIRED", statusLabel: "Retras", openRequestCount: 0, quoteCount: 0, jobCount: 0, needsAttention: false, attentionLabel: null, logo: null };

  it("shows each client's logo or monogram in the register rows and on the card, the name always visible", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/customers")) return json(200, { registry: { summary: { total: 2, active: 1, retired: 1, needsAttention: 0 }, customers: [ALPHA, BETA] } });
      if (url.endsWith("/cus-a/workspace")) return json(200, { workspace: { customer: ALPHA, canCreateRequest: true, logo: LOGO, logoRevision: 2, requests: [], quotes: [], jobs: [] } });
      return json(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ClientsPage search="" />);
    await screen.findByRole("link", { name: "Alpha Clima SRL" });
    const rows = screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
    const alpha = rows.find((row) => row.getAttribute("data-row-id") === "cus-a")!;
    const beta = rows.find((row) => row.getAttribute("data-row-id") === "cus-b")!;
    expect(alpha.querySelector(".client-mark img")).toHaveAttribute("src", LOGO.contentHref);
    expect(within(alpha).getByRole("link", { name: "Alpha Clima SRL" })).toBeInTheDocument();
    // The inactive client without a logo keeps its monogram.
    expect(beta.querySelector(".client-mark img")).toBeNull();
    expect(within(beta).getByText("BS")).toBeInTheDocument();
    // One registry read for every logo: no request per client.
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/logo"))).toHaveLength(0);

    await userEvent.click(alpha);
    rerender(<ClientsPage search="?client=cus-a" />);
    const card = await screen.findByRole("article", { name: "Cartela clientului Alpha Clima SRL" });
    expect(card.querySelector(".client-mark[data-size='large'] img")).toHaveAttribute("src", LOGO.contentHref);
  });
});
