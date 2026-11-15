import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialAdminPage } from "./CommercialAdminPage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultAdmin = {
  canEdit: true,
  resolutionOk: true,
  source: "CODE_DEFAULT",
  sourceLabel: "Politică de sistem",
  guidance: "Politica de sistem. Valorile nu au fost încă confirmate pentru această organizație.",
  policyId: "DEFAULT_COMMERCIAL_POLICY",
  activeVersion: null,
  editable: {
    markupPercent: 35,
    vatPercent: 21,
    defaultDiscountPercent: 0,
    defaultAdjustment: 0,
  },
  readOnly: { currency: "EUR", rounding: 0.01 },
  history: [],
};

describe("CommercialAdminPage", () => {
  it("shows the system policy state without claiming organization confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<CommercialAdminPage />);

    expect(
      await screen.findByText(
        "Politica de sistem. Valorile nu au fost încă confirmate pentru această organizație.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos implicit")).toHaveValue("35");
    expect(screen.getAllByText(/Politică de sistem/).length).toBeGreaterThan(0);
    // No draft yet: no save action and no unsaved-changes bar.
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administrare" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Valori comerciale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Valori comerciale" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Costuri de producție" })).toHaveAttribute(
      "href",
      "/admin/resources",
    );
  });

  it("does not tell the owner that saved organization defaults still need configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...defaultAdmin,
          source: "ORGANIZATION",
          sourceLabel: "Valori implicite ale firmei",
          guidance:
            "Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă.",
          activeVersion: 1,
        }),
      }),
    );

    render(<CommercialAdminPage />);

    expect(
      await screen.findByText("Punct de pornire pentru oferte noi"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Politica trebuie configurată")).not.toBeInTheDocument();
  });

  it("shows the owner-only restriction to a member instead of a loading failure", async () => {
    const fetchMock = vi.fn<(input: RequestInfo) => Promise<unknown>>(() =>
      jsonResponse({ error: "forbidden" }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialAdminPage />);

    expect(await screen.findByText("Acces doar pentru proprietar")).toBeInTheDocument();
    expect(
      screen.getByText(/Valorile comerciale sunt disponibile doar proprietarului organizației\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Doar citire")).toBeInTheDocument();
    expect(screen.queryByText("Încărcarea a eșuat")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administrare" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/admin/commercial-policy",
    ]);
  });

  it("keeps a genuine server failure distinct from the owner-only restriction", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "internal" }, 500)));

    render(<CommercialAdminPage />);

    expect(await screen.findByText("Încărcarea a eșuat")).toBeInTheDocument();
    expect(screen.getByText("Politica comercială nu este disponibilă.")).toBeInTheDocument();
    expect(screen.queryByText("Acces doar pentru proprietar")).not.toBeInTheDocument();
  });

  it("keeps a network failure distinct from the owner-only restriction", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    render(<CommercialAdminPage />);

    expect(await screen.findByText("Încărcarea a eșuat")).toBeInTheDocument();
    expect(screen.queryByText("Acces doar pentru proprietar")).not.toBeInTheDocument();
  });

  it("treats a malformed policy response as an error, not as forbidden", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse("not-a-policy")));

    render(<CommercialAdminPage />);

    expect(await screen.findByText("Încărcarea a eșuat")).toBeInTheDocument();
    expect(screen.queryByText("Acces doar pentru proprietar")).not.toBeInTheDocument();
  });

  it("saves a new organization version", async () => {
    const saved = {
      ...defaultAdmin,
      source: "ORGANIZATION",
      sourceLabel: "Valori implicite ale firmei",
      guidance: null,
      activeVersion: 1,
      editable: {
        markupPercent: 30,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      },
      history: [
        {
          version: 1,
          status: "ACTIVE",
          source: "ORGANIZATION",
          createdAt: "2026-09-20T00:00:00.000Z",
          effectiveFrom: "2026-09-20T00:00:00.000Z",
          markupPercent: 30,
          vatPercent: 21,
          defaultDiscountPercent: 0,
          defaultAdjustment: 0,
        },
      ],
    };
    let organizationSaved = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/commercial-policy") && String(init?.method ?? "GET") === "POST") {
        organizationSaved = true;
        return jsonResponse(saved);
      }
      return jsonResponse(organizationSaved ? saved : defaultAdmin);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit");
    await userEvent.clear(markup);
    await userEvent.type(markup, "30");
    const bar = screen.getByRole("region", { name: "Modificări nesalvate" });
    expect(bar).toHaveTextContent("1 modificare nesalvată");
    expect(bar).toHaveTextContent("Adaos implicit 35 → 30 %");
    expect(screen.getByText("era 35 %")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    const review = await screen.findByRole("dialog", { name: "Revizuiește modificările" });
    expect(review).toHaveTextContent("se va crea versiunea 1");
    expect(review).toHaveTextContent("Ofertele înghețate rămân neschimbate.");
    expect(organizationSaved).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Salvează versiunea 1" }));
    expect(await screen.findByText("Politica a fost salvată")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos implicit")).toHaveValue("30");
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
  });

  it("keeps the draft when the save fails and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo, init?: RequestInit) =>
        String(init?.method ?? "GET") === "POST"
          ? jsonResponse({ error: "internal" }, 500)
          : jsonResponse(defaultAdmin),
      ),
    );
    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit");
    await userEvent.clear(markup);
    await userEvent.type(markup, "28");
    await userEvent.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    await userEvent.click(await screen.findByRole("button", { name: "Salvează versiunea 1" }));
    expect(await screen.findByText("Politica comercială nu a putut fi salvată.")).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos implicit")).toHaveValue("28");
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toBeInTheDocument();
  });

  it("restores the saved values on Renunță without a dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(defaultAdmin)));
    render(<CommercialAdminPage />);
    const vat = await screen.findByLabelText("TVA");
    await userEvent.clear(vat);
    await userEvent.type(vat, "19");
    await userEvent.click(screen.getByRole("button", { name: "Renunță" }));
    expect(screen.getByLabelText("TVA")).toHaveValue("21");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
  });

  it("holds navigation to another page while a draft exists", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(defaultAdmin)));
    const { navigate } = await import("../routing/navigate");
    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit");
    await userEvent.clear(markup);
    await userEvent.type(markup, "31");
    const before = window.location.pathname;
    act(() => navigate("/admin/resources"));
    expect(await screen.findByRole("dialog", { name: "Ai modificări nesalvate" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(before);
    await userEvent.click(screen.getByRole("button", { name: "Rămân pe pagină" }));
    expect(screen.getByLabelText("Adaos implicit")).toHaveValue("31");
  });

  it("marks a value that is not a number instead of sending it", async () => {
    const fetchMock = vi.fn<(input: RequestInfo, init?: RequestInit) => ReturnType<typeof jsonResponse>>(() => jsonResponse(defaultAdmin));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit");
    await userEvent.clear(markup);
    await userEvent.type(markup, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    await userEvent.click(await screen.findByRole("button", { name: "Salvează versiunea 1" }));
    expect(await screen.findByText("Valorile comerciale trebuie să fie numere.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });
});

/**
 * R3 safety fix · leaving with a draft never saves around the review: „Revizuiește și salvează” in
 * the leave question opens the same review as the change bar, and the page is left only after that
 * review was confirmed and the server accepted the save.
 */
describe("CommercialAdminPage · leave question uses the normal review", () => {
  const savedV1 = {
    ...defaultAdmin,
    source: "ORGANIZATION",
    sourceLabel: "Valori implicite ale firmei",
    guidance: null,
    activeVersion: 1,
    editable: { markupPercent: 31, vatPercent: 21, defaultDiscountPercent: 0, defaultAdjustment: 0 },
  };

  async function draftAndLeave(fetchMock: ReturnType<typeof vi.fn>) {
    window.history.replaceState(null, "", "/admin/commercial");
    vi.stubGlobal("fetch", fetchMock);
    const { navigate } = await import("../routing/navigate");
    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit");
    await userEvent.clear(markup);
    await userEvent.type(markup, "31");
    act(() => navigate("/admin/resources"));
    return screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
  }

  const posts = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([, init]) => String((init as RequestInit | undefined)?.method ?? "GET") === "POST");

  it("opens the review first, saves only on its confirmation, then continues once", async () => {
    let saved = false;
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      if (String(init?.method ?? "GET") === "POST") {
        saved = true;
        return jsonResponse(savedV1);
      }
      return jsonResponse(saved ? savedV1 : defaultAdmin);
    });
    const ask = await draftAndLeave(fetchMock);
    expect(within(ask).queryByRole("button", { name: "Salvează și continuă" })).not.toBeInTheDocument();
    await userEvent.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    const review = await screen.findByRole("dialog", { name: "Revizuiește modificările" });
    expect(review).toHaveTextContent("Adaos implicit");
    expect(posts(fetchMock)).toHaveLength(0);
    expect(window.location.pathname).toBe("/admin/commercial");
    await userEvent.click(within(review).getByRole("button", { name: "Salvează versiunea 1" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/resources"));
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("stays on the page with the draft when the save fails, and never navigates", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) =>
      String(init?.method ?? "GET") === "POST" ? jsonResponse({ error: "internal" }, 500) : jsonResponse(defaultAdmin),
    );
    const ask = await draftAndLeave(fetchMock);
    await userEvent.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    const review = await screen.findByRole("dialog", { name: "Revizuiește modificările" });
    await userEvent.click(within(review).getByRole("button", { name: "Salvează versiunea 1" }));
    expect(await within(review).findByText(/nu a putut fi salvată/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/commercial");
    await userEvent.click(within(review).getByRole("button", { name: "Înapoi la editare" }));
    // The flow closed with the draft still there: the leave question comes back instead of leaving.
    expect(await screen.findByRole("dialog", { name: "Ai modificări nesalvate" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rămân pe pagină" }));
    expect(screen.getByLabelText("Adaos implicit")).toHaveValue("31");
    expect(window.location.pathname).toBe("/admin/commercial");
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("„Pleacă fără salvare” leaves without any save request", async () => {
    const fetchMock = vi.fn(() => jsonResponse(defaultAdmin));
    const ask = await draftAndLeave(fetchMock);
    await userEvent.click(within(ask).getByRole("button", { name: "Pleacă fără salvare" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/resources"));
    expect(posts(fetchMock)).toHaveLength(0);
  });
});
