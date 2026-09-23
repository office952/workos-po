import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeConfiguratorSession } from "../session/configuratorSession";
import {
  ConfiguratorPage,
  EDIT_PREVIEW_DEBOUNCE_MS,
  INITIAL_PREVIEW_DEBOUNCE_MS,
  type ConfiguratorPageProps,
} from "./ConfiguratorPage";

const LETTERS_PRODUCT = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const ACM_PRODUCT = "PRD-ACM-CASSETTE-NONE";
const LOGO_PRODUCT = "PRD-LOGO-FRONTLIT-PLEXI-AL06";
const LETTERS_ONLY_FIELD = "face.confirmedAreaMm2";
const ACM_ONLY_FIELD = "face.widthMm";

const previewBody = {
  product: {
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    label: "Litere volumetrice luminoase — față plexiglas, volum aluminiu 0,6 mm",
  },
  values: {},
  formSchema: {
    id: "form",
    sections: [
      {
        id: "product",
        title: "Produs",
        fields: [
          {
            id: "root.inscription",
            label: "Textul literelor",
            type: "text",
            required: true,
          },
        ],
      },
    ],
  },
  selectedComponents: [{ id: "FACE", label: "Față" }],
  readiness: "ready",
  missing: [],
  reviewId: "crv1:letters-ready",
};

const acmPreviewBody = {
  product: {
    productCode: ACM_PRODUCT,
    label: "Casete luminoase ACM",
  },
  values: {},
  formSchema: {
    id: "form",
    sections: [
      {
        id: "product",
        title: "Produs",
        fields: [
          {
            id: ACM_ONLY_FIELD,
            label: "Lățime casetă",
            type: "number",
            required: true,
          },
        ],
      },
    ],
  },
  selectedComponents: [{ id: "CASSETTE", label: "Casetă" }],
  readiness: "ready",
  missing: [],
  reviewId: "crv1:acm-ready",
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function confirmBody(options: {
  rate: number;
  cost: number;
  completeness?: string;
  calculationStatus?: string;
  verificationStatus?: string;
  calculatedPriceAvailable?: boolean;
  costCompletenessIssues?: Array<Record<string, unknown>>;
}) {
  const completeness = options.completeness ?? "COMPLETE";
  const calculationStatus =
    options.calculationStatus ??
    (completeness === "COMPLETE" ? "CALCULABLE" : "UNAVAILABLE");
  const verificationStatus = options.verificationStatus ?? "CONFIRMED";
  return {
    eic: {
      completeness,
      calculationStatus,
      verificationStatus,
      completenessReasons: [],
      currency: "EUR",
      total: options.cost,
      lines: [
        {
          resourceId: "aluminium_return_profile",
          label: "Profil aluminiu 0,6 mm",
          quantity: 12.5,
          unit: "m",
          rate: options.rate,
          currency: "EUR",
          cost: options.cost,
        },
      ],
    },
    commercialPrice: {
      netPrice: 100,
      grossPrice: 121,
      vatPercent: 21,
      vatAmount: 21,
      currency: "EUR",
      completeness: "COMPLETE",
      unavailableReasons: [],
      internalCost: options.cost,
      internalCostCurrency: "EUR",
      internalCostCompleteness: completeness,
      calculationStatus,
      verificationStatus,
    },
    costCompletenessIssues: options.costCompletenessIssues ?? [],
    organizationDefaults: {
      markupPercent: 35,
      discountPercent: 0,
      adjustmentAmount: 0,
    },
    quoteCommercialTerms: {
      markupPercent: 35,
      discountPercent: 0,
      adjustmentAmount: 0,
    },
    quoteTermsFromDefaults: true,
    pricingMethod: "PRODUCT_COST_PLUS",
    calculatedPriceAvailable: options.calculatedPriceAvailable ?? completeness === "COMPLETE",
    manualProductPriceAuthorized: true,
    commercialExperience: { quoteBlocker: null },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function installFetch(options: {
  rate: number;
  cost: number;
  sellerConfigured?: boolean;
  completeness?: string;
  calculationStatus?: string;
  verificationStatus?: string;
  calculatedPriceAvailable?: boolean;
  costCompletenessIssues?: Array<Record<string, unknown>>;
}) {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.endsWith("/preview")) {
      return jsonResponse(url.includes(ACM_PRODUCT) ? acmPreviewBody : previewBody);
    }
    if (url.endsWith("/confirm")) {
      return jsonResponse(confirmBody(options));
    }
    if (url.endsWith("/seller")) {
      return jsonResponse({
        configured: options.sellerConfigured !== false,
        seller:
          options.sellerConfigured === false ? null : { legalName: "Isolated" },
      });
    }
    if (url.endsWith("/customers") || url.endsWith("/requests")) {
      return jsonResponse({ error: "not-used-by-product" }, 500);
    }
    if (url.endsWith("/quote-snapshots")) {
      return jsonResponse({
        created: true,
        quoteSnapshot: {
          quoteSnapshotId: "q-live",
          productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
          productLabel: "Litere",
          inscription: "text",
          sourceReviewId: "crv1:letters-ready",
          eic: {
            completeness: "COMPLETE",
            currency: "EUR",
            total: options.cost,
            lines: [
              {
                resourceId: "aluminium_return_profile",
                label: "Profil aluminiu 0,6 mm",
                quantity: 12.5,
                unit: "m",
                rate: options.rate,
                currency: "EUR",
                cost: options.cost,
              },
            ],
          },
        },
      });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function previewPayload(
  fetchMock: ReturnType<typeof vi.fn>,
  productCode: string,
): { values: Record<string, unknown> } {
  const call = fetchMock.mock.calls.find((entry) =>
    String(entry[0]).includes(`/products/${productCode}/preview`),
  );
  expect(call).toBeDefined();
  return JSON.parse(String(call?.[1]?.body)) as { values: Record<string, unknown> };
}

function contextProps(overrides: Partial<ConfiguratorPageProps> = {}): ConfiguratorPageProps {
  return {
    customerId: "cus-1",
    requestId: "req-1",
    productCode: LETTERS_PRODUCT,
    ...overrides,
  };
}

function renderConfigurator(overrides: Partial<ConfiguratorPageProps> = {}) {
  return render(<ConfiguratorPage {...contextProps(overrides)} />);
}

function seedOwnedDrafts(
  drafts: Record<string, string>,
  overrides: Partial<ConfiguratorPageProps> = {},
): ConfiguratorPageProps {
  const context = contextProps(overrides);
  writeConfiguratorSession({
    drafts,
    draftContext: context,
    customerId: context.customerId,
    requestId: context.requestId,
    productCode: context.productCode,
    lastQuote: null,
  });
  return context;
}

async function confirmReady() {
  const user = userEvent.setup();
  await screen.findByLabelText("Textul literelor");
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Confirmă configurația" })).toBeEnabled();
  });
  await user.click(screen.getByRole("button", { name: "Confirmă configurația" }));
  await screen.findByTestId("profile-cost");
  return user;
}

describe("ConfiguratorPage", () => {
  it("sends configuration values to preview and keeps reviewId on confirm", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });

    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();
    expect(screen.getByLabelText("Textul literelor")).toHaveValue("");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06/preview",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirmă configurația" })).toBeEnabled();
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmă configurația" }));
    expect(await screen.findByTestId("profile-cost")).toHaveTextContent(
      "12,5 m × 3,00 EUR/m = 37,50 EUR",
    );

    const confirmCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/confirm"),
    );
    expect(confirmCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"reviewId\":\"crv1:letters-ready\""),
      }),
    );
    expect(String(confirmCall?.[1]?.body)).toContain("\"values\"");
    expect(String(confirmCall?.[1]?.body)).not.toContain("ProductDefinition");
    expect(String(confirmCall?.[1]?.body)).not.toContain("quoteCommercialTerms");
  });

  it("freezes only with existing customer context and does not create seller, customer, or request", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    const user = await confirmReady();
    await user.click(screen.getByRole("button", { name: "Îngheață oferta" }));
    expect(await screen.findByText("Deschide oferta înghețată")).toBeInTheDocument();

    const methods = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      method: String(call[1]?.method ?? "GET"),
    }));
    expect(methods.some((call) => call.url.endsWith("/customers") && call.method === "POST")).toBe(
      false,
    );
    expect(methods.some((call) => call.url.endsWith("/seller") && call.method === "PATCH")).toBe(
      false,
    );
    expect(methods.some((call) => call.url.endsWith("/requests") && call.method === "POST")).toBe(
      false,
    );

    const freezeCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/quote-snapshots"),
    );
    expect(String(freezeCall?.[1]?.body)).toContain("\"reviewId\":\"crv1:letters-ready\"");
    expect(String(freezeCall?.[1]?.body)).toContain("\"customerId\":\"cus-1\"");
  });

  it("blocks freeze when customer context is missing and does not create a customer", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ customerId: null, requestId: null });
    await confirmReady();
    expect(
      screen.getByText(/Selectează un client înainte de a crea oferta/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Îngheață oferta" })).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).endsWith("/customers") &&
          String(call[1]?.method) === "POST",
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/quote-snapshots")),
    ).toBe(false);
  });

  it("blocks freeze when seller is missing and does not update seller", async () => {
    const fetchMock = installFetch({
      rate: 3,
      cost: 37.5,
      sellerConfigured: false,
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(
      screen.getByText("Datele firmei trebuie configurate înainte de a crea oferta."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Îngheață oferta" })).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).endsWith("/seller") && String(call[1]?.method) === "PATCH",
      ),
    ).toBe(false);
    expect(screen.getByLabelText("Denumire firmă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează datele firmei" })).toBeDisabled();
  });

  it("saves seller identity through the API and then allows freeze", async () => {
    let sellerConfigured = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.endsWith("/preview")) {
        return jsonResponse(previewBody);
      }
      if (url.endsWith("/confirm")) {
        return jsonResponse(confirmBody({ rate: 3, cost: 37.5 }));
      }
      if (url.endsWith("/seller") && method === "PATCH") {
        sellerConfigured = true;
        return jsonResponse({ configured: true, seller: { legalName: "Firma Nord" } });
      }
      if (url.endsWith("/seller")) {
        return jsonResponse({
          configured: sellerConfigured,
          seller: sellerConfigured ? { legalName: "Firma Nord" } : null,
        });
      }
      if (url.endsWith("/quote-snapshots")) {
        return jsonResponse({
          created: true,
          quoteSnapshot: {
            quoteSnapshotId: "q-live",
            productCode: LETTERS_PRODUCT,
            productLabel: "Litere",
            inscription: "text",
            sourceReviewId: "crv1:letters-ready",
            eic: {
              completeness: "COMPLETE",
              currency: "EUR",
              total: 37.5,
              lines: [],
            },
          },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    const user = await confirmReady();
    await user.type(screen.getByLabelText("Denumire firmă"), "Firma Nord");
    await user.click(screen.getByRole("button", { name: "Salvează datele firmei" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Îngheață oferta" })).toBeEnabled();
    });
    const sellerPatch = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/seller") && String(call[1]?.method) === "PATCH",
    );
    expect(String(sellerPatch?.[1]?.body)).toContain("\"legalName\":\"Firma Nord\"");
    await user.click(screen.getByRole("button", { name: "Îngheață oferta" }));
    expect(await screen.findByText("Deschide oferta înghețată")).toBeInTheDocument();
  });

  it("presents the server freeze reason without inventing a local quote", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    const fallback = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith("/quote-snapshots")) {
        return jsonResponse(
          {
            error: "seller_unconfigured",
            reasons: ["Datele firmei trebuie configurate înainte de a crea oferta."],
          },
          422,
        );
      }
      return fallback ? fallback(input, init) : jsonResponse({});
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    const user = await confirmReady();
    await user.click(screen.getByRole("button", { name: "Îngheață oferta" }));
    expect(
      await screen.findByText("Datele firmei trebuie configurate înainte de a crea oferta."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Deschide oferta înghețată")).not.toBeInTheDocument();
  });

  it("presents a later server cost without calculating it in the browser", async () => {
    installFetch({ rate: 3.2, cost: 40 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirmă configurația" })).toBeEnabled();
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirmă configurația" }));
    expect(await screen.findByTestId("profile-cost")).toHaveTextContent(
      "12,5 m × 3,20 EUR/m = 40,00 EUR",
    );
  });

  it("asks how this quote is priced and keeps cost separate from customer price", async () => {
    installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.getByText("Cum stabilești prețul acestei oferte?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Calculat din costuri/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Preț net negociat manual/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos pentru această ofertă (%)")).toHaveValue("35");
    expect(screen.getByText("Pornit din valorile implicite ale firmei.")).toBeInTheDocument();
    expect(screen.getByText("Cost intern cunoscut")).toBeInTheDocument();
    expect(screen.getByTestId("customer-price")).toHaveTextContent("Preț net client");
    expect(screen.queryByText("Preț net manual produs")).not.toBeInTheDocument();
  });

  it("does not use proof A/B language", async () => {
    installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.queryByRole("button", { name: "Îngheață oferta A" })).not.toBeInTheDocument();
    expect(screen.queryByText("Oferta A")).not.toBeInTheDocument();
    expect(screen.queryByText("Oferta B")).not.toBeInTheDocument();
  });

  it("starts the first contextual preview without the edit debounce", async () => {
    expect(INITIAL_PREVIEW_DEBOUNCE_MS).toBe(0);
    expect(EDIT_PREVIEW_DEBOUNCE_MS).toBe(250);
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/configurator?customer=cus-1&request=req-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator();
    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();
    const previewCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/preview"));
    expect(previewCall).toBeDefined();
    expect(
      timeoutSpy.mock.calls.some((call) => call[1] === INITIAL_PREVIEW_DEBOUNCE_MS),
    ).toBe(true);
    expect(
      timeoutSpy.mock.calls.some((call) => call[1] === EDIT_PREVIEW_DEBOUNCE_MS),
    ).toBe(false);

    await userEvent.setup().type(screen.getByLabelText("Textul literelor"), "A");
    expect(
      timeoutSpy.mock.calls.some((call) => call[1] === EDIT_PREVIEW_DEBOUNCE_MS),
    ).toBe(true);
    timeoutSpy.mockRestore();
  });

  it("does not send LETTERS-only drafts on the first ACM preview", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [LETTERS_ONLY_FIELD]: "18000" }, { productCode: LETTERS_PRODUCT });
    renderConfigurator({ productCode: ACM_PRODUCT });
    expect(await screen.findByLabelText("Lățime casetă")).toBeInTheDocument();
    expect(screen.getByLabelText("Lățime casetă")).toHaveValue("");
    const values = previewPayload(fetchMock, ACM_PRODUCT).values;
    expect(values[LETTERS_ONLY_FIELD]).toBeUndefined();
    expect(Object.keys(values)).not.toContain(LETTERS_ONLY_FIELD);
  });

  it("does not send ACM-only drafts on the first LETTERS preview", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [ACM_ONLY_FIELD]: "1200" }, { productCode: ACM_PRODUCT });
    renderConfigurator();
    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();
    expect(screen.getByLabelText("Textul literelor")).toHaveValue("");
    const values = previewPayload(fetchMock, LETTERS_PRODUCT).values;
    expect(values[ACM_ONLY_FIELD]).toBeUndefined();
    expect(Object.keys(values)).not.toContain(ACM_ONLY_FIELD);
  });

  it("restores compatible drafts when returning to the same product", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [ACM_ONLY_FIELD]: "1200" }, { productCode: ACM_PRODUCT });
    renderConfigurator({ productCode: ACM_PRODUCT });
    expect(await screen.findByLabelText("Lățime casetă")).toHaveValue("1200");
    expect(previewPayload(fetchMock, ACM_PRODUCT).values[ACM_ONLY_FIELD]).toBe(1200);
  });

  it("clears foreign drafts when the product changes without remounting", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [LETTERS_ONLY_FIELD]: "18000" }, { productCode: LETTERS_PRODUCT });
    const view = renderConfigurator();
    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();

    view.rerender(
      <ConfiguratorPage
        key={ACM_PRODUCT}
        {...contextProps({ productCode: ACM_PRODUCT })}
      />,
    );

    expect(await screen.findByLabelText("Lățime casetă")).toHaveValue("");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes(`/products/${ACM_PRODUCT}/preview`)),
      ).toBe(true);
    });
    const values = previewPayload(fetchMock, ACM_PRODUCT).values;
    expect(values[LETTERS_ONLY_FIELD]).toBeUndefined();
  });

  it("restores drafts for the same product, customer, and request", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [ACM_ONLY_FIELD]: "1200" }, { productCode: ACM_PRODUCT });
    renderConfigurator({ productCode: ACM_PRODUCT });
    expect(await screen.findByLabelText("Lățime casetă")).toHaveValue("1200");
    expect(previewPayload(fetchMock, ACM_PRODUCT).values[ACM_ONLY_FIELD]).toBe(1200);
  });

  it("does not inherit drafts when the request changes for the same product", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts({ [ACM_ONLY_FIELD]: "1200" }, { productCode: ACM_PRODUCT, requestId: "req-A" });
    renderConfigurator({ productCode: ACM_PRODUCT, requestId: "req-B" });
    expect(await screen.findByLabelText("Lățime casetă")).toHaveValue("");
    expect(previewPayload(fetchMock, ACM_PRODUCT).values[ACM_ONLY_FIELD]).toBeUndefined();
  });

  it("does not inherit drafts when the customer and request change for the same product", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts(
      { [ACM_ONLY_FIELD]: "1200" },
      { productCode: ACM_PRODUCT, customerId: "cus-A", requestId: "req-A" },
    );
    renderConfigurator({
      productCode: ACM_PRODUCT,
      customerId: "cus-B",
      requestId: "req-B",
    });
    expect(await screen.findByLabelText("Lățime casetă")).toHaveValue("");
    expect(previewPayload(fetchMock, ACM_PRODUCT).values[ACM_ONLY_FIELD]).toBeUndefined();
  });

  it("freezes with the current customer and request, not a previous context", async () => {
    const fetchMock = installFetch({ rate: 3, cost: 37.5 });
    seedOwnedDrafts(
      {},
      { productCode: LETTERS_PRODUCT, customerId: "cus-A", requestId: "req-A" },
    );
    renderConfigurator({ customerId: "cus-B", requestId: "req-B" });
    const user = await confirmReady();
    await user.click(screen.getByRole("button", { name: "Îngheață oferta" }));
    await screen.findByText("Deschide oferta înghețată");
    const freezeCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/quote-snapshots"),
    );
    const payload = JSON.parse(String(freezeCall?.[1]?.body)) as {
      customerId?: string;
      requestId?: string;
    };
    expect(payload.customerId).toBe("cus-B");
    expect(payload.requestId).toBe("req-B");
  });

  it("does not show a frozen quote from another configuration context", async () => {
    writeConfiguratorSession({
      drafts: {},
      draftContext: contextProps({
        productCode: ACM_PRODUCT,
        customerId: "cus-A",
        requestId: "req-A",
      }),
      customerId: "cus-A",
      requestId: "req-A",
      productCode: ACM_PRODUCT,
      lastQuote: {
        productCode: ACM_PRODUCT,
        quoteSnapshotId: "q-from-a",
        customerId: "cus-A",
        requestId: "req-A",
      },
    });
    installFetch({ rate: 3, cost: 37.5 });
    renderConfigurator({
      productCode: ACM_PRODUCT,
      customerId: "cus-B",
      requestId: "req-B",
    });
    expect(await screen.findByLabelText("Lățime casetă")).toBeInTheDocument();
    expect(screen.queryByText("Deschide oferta înghețată")).not.toBeInTheDocument();
  });

  it("does not wait for seller before the product form or initial preview", async () => {
    let releaseSeller: (() => void) | undefined;
    const sellerGate = new Promise<void>((resolve) => {
      releaseSeller = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/preview")) {
        return jsonResponse(previewBody);
      }
      if (url.endsWith("/seller")) {
        return sellerGate.then(() =>
          jsonResponse({
            configured: true,
            seller: { legalName: "Isolated" },
          }),
        );
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      null,
      "",
      `/?customer=cus-1&product=${LETTERS_PRODUCT}`,
    );
    renderConfigurator({ requestId: null });
    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/preview")),
    ).toBe(true);
    releaseSeller?.();
  });

  it("composes from SlicePage and SurfacePanel without the legacy panel chassis", async () => {
    installFetch({ rate: 3, cost: 37.5 });
    renderConfigurator({ requestId: null });
    expect(await screen.findByLabelText("Textul literelor")).toBeInTheDocument();
    expect(document.querySelector(".page-workspace--configuration")).not.toBeNull();
    expect(document.querySelector(".ui-panel")).not.toBeNull();
    expect(document.querySelector(".floorplan")).toBeNull();
    expect(document.querySelector(".floorplan--form")).toBeNull();
    expect(document.querySelector(".panel")).toBeNull();
    expect(document.querySelector(".panel__header")).toBeNull();
    expect(document.querySelector(".panel__body")).toBeNull();
    expect(document.querySelector(".configurator-new-panel")).toBeNull();
  });

  it("shows the missing cost-evidence resource and a cost-evidence action", async () => {
    installFetch({
      rate: 3,
      cost: 345,
      completeness: "PARTIAL",
      calculatedPriceAvailable: false,
      costCompletenessIssues: [
        {
          type: "MISSING_COST_EVIDENCE",
          impact: "BLOCKS_CALCULATION",
          resourceId: "plexiglas_3mm_opal",
          label: "Plexiglas 3 mm opal",
          reason: "Tarif lipsă pentru Plexiglas 3 mm opal",
        },
      ],
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.getByText("Cost intern cunoscut")).toBeInTheDocument();
    expect(screen.getByText("Incomplet")).toBeInTheDocument();
    expect(screen.getByText("Linii cunoscute")).toBeInTheDocument();
    expect(screen.getByText("Ce lipsește din cost")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi ce lipsește" })).toHaveAttribute(
      "href",
      "#cost-intern-gaps",
    );
    expect(screen.getByText("Plexiglas 3 mm opal")).toBeInTheDocument();
    expect(screen.getByText("Tarif lipsă pentru Plexiglas 3 mm opal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide Dovezi de cost" })).toHaveAttribute(
      "href",
      "/admin/resources",
    );
    expect(screen.getByRole("radio", { name: /Preț net negociat manual/ })).toBeEnabled();
    expect(screen.getByText(/deoarece costul intern este incomplet/)).toBeInTheDocument();
  });

  it("shows a technical gap without claiming a missing tariff", async () => {
    installFetch({
      rate: 3,
      cost: 0,
      completeness: "PARTIAL",
      calculatedPriceAvailable: false,
      costCompletenessIssues: [
        {
          type: "MISSING_TECHNICAL_INPUT",
          impact: "BLOCKS_CALCULATION",
          label: "Față",
          reason: "Suprafață față neconfirmată",
          componentLabel: "Față",
        },
      ],
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.getByText("Suprafață față neconfirmată")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completează configurația" })).toHaveAttribute(
      "href",
      "#configuratie",
    );
    expect(screen.queryByText(/Tarif lipsă/)).not.toBeInTheDocument();
  });

  it("shows provisional evidence as unconfirmed, not missing", async () => {
    installFetch({
      rate: 3,
      cost: 386,
      completeness: "COMPLETE",
      calculationStatus: "CALCULABLE",
      verificationStatus: "NEEDS_VERIFICATION",
      calculatedPriceAvailable: true,
      costCompletenessIssues: [
        {
          type: "PROVISIONAL_COST_EVIDENCE",
          impact: "REQUIRES_VERIFICATION",
          resourceId: "MAT-VINYL-ORACAL-651",
          label: "Vinil Oracal 651",
          reason: "Cost existent, dar neconfirmat",
          rate: 9,
        },
      ],
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.getByText("Cost intern estimat")).toBeInTheDocument();
    expect(screen.getByText("Calculat")).toBeInTheDocument();
    expect(screen.getAllByText("Necesită verificare").length).toBeGreaterThan(0);
    expect(screen.getByText("Valori care necesită verificare")).toBeInTheDocument();
    expect(screen.getByText("Vinil Oracal 651")).toBeInTheDocument();
    expect(screen.getByText("9,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("Cost existent, dar neconfirmat")).toBeInTheDocument();
    expect(screen.queryByText("Ce lipsește din cost")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tarif lipsă/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Calculat din costuri/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Preț net negociat manual/ })).toBeEnabled();
    expect(
      screen.getByText("Calculul folosește 1 valoare care necesită verificare."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Calculul automat nu este disponibil/)).not.toBeInTheDocument();
    expect(screen.getByText("Adaos pentru această ofertă (%)")).toBeInTheDocument();
  });

  it("hides unresolved cost issues when EIC is complete", async () => {
    installFetch({ rate: 3, cost: 37.5 });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    await confirmReady();
    expect(screen.queryByTestId("cost-completeness-issues")).not.toBeInTheDocument();
    expect(screen.queryByText("Ce lipsește din cost")).not.toBeInTheDocument();
  });

  it("does not show internal cost gaps when financial context is hidden", async () => {
    const fetchMock = installFetch({
      rate: 3,
      cost: 345,
      completeness: "PARTIAL",
      calculatedPriceAvailable: false,
      costCompletenessIssues: [
        {
          type: "MISSING_COST_EVIDENCE",
          impact: "BLOCKS_CALCULATION",
          resourceId: "plexiglas_3mm_opal",
          label: "Plexiglas 3 mm opal",
          reason: "Tarif lipsă pentru Plexiglas 3 mm opal",
        },
      ],
    });
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/preview")) {
        return jsonResponse(previewBody);
      }
      if (url.endsWith("/confirm")) {
        return jsonResponse({
          commercialPrice: {
            netPrice: 400,
            grossPrice: 484,
            vatPercent: 21,
            vatAmount: 84,
            currency: "EUR",
            completeness: "COMPLETE",
            unavailableReasons: [],
          },
          pricingMethod: "MANUAL_FIXED_PRODUCT",
          calculatedPriceAvailable: false,
          manualProductPriceAuthorized: true,
          costCompletenessIssues: [
            {
              type: "MISSING_COST_EVIDENCE",
              label: "Plexiglas 3 mm opal",
              reason: "Tarif lipsă pentru Plexiglas 3 mm opal",
            },
          ],
        });
      }
      if (url.endsWith("/seller")) {
        return jsonResponse({ configured: true, seller: { legalName: "Isolated" } });
      }
      void init;
      return jsonResponse({});
    });
    window.history.replaceState(
      null,
      "",
      "/?customer=cus-1&product=PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    );
    renderConfigurator({ requestId: null });
    const user = userEvent.setup();
    await screen.findByLabelText("Textul literelor");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirmă configurația" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Confirmă configurația" }));
    expect(await screen.findByText("Cost intern indisponibil")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-completeness-issues")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Preț net negociat manual/ })).toBeEnabled();
  });

  it("states that a disabled product is unavailable for new work", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/preview")) {
          return jsonResponse(
            {
              error: "product_not_enabled",
              reasons: [
                "Acest produs nu este oferit pentru lucrări noi. Ofertele și lucrările existente rămân deschise.",
              ],
            },
            409,
          );
        }
        if (url.endsWith("/seller")) {
          return jsonResponse({ configured: true, seller: { legalName: "Isolated" } });
        }
        return jsonResponse({});
      }),
    );
    window.history.replaceState(
      null,
      "",
      `/configurator?product=${ACM_PRODUCT}`,
    );
    renderConfigurator({ productCode: ACM_PRODUCT, customerId: null, requestId: null });
    expect(await screen.findByText("Produsul nu este oferit")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Acest produs nu este oferit pentru lucrări noi. Ofertele și lucrările existente rămân deschise.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("product_not_enabled")).not.toBeInTheDocument();
    expect(screen.queryByText(ACM_PRODUCT)).not.toBeInTheDocument();
  });

  it("reloads a logo draft as a ready select without touching depth", async () => {
    const logoSchema = {
      id: "logo-form",
      sections: [
        {
          id: "product",
          title: "Produs",
          fields: [
            {
              id: "root.inscription",
              label: "Denumire logo",
              type: "text",
              required: true,
            },
          ],
        },
        {
          id: "face",
          title: "Față",
          fields: [
            {
              id: "face.confirmedAreaMm2",
              label: "Suprafață confirmată (mm²)",
              type: "number",
              required: true,
            },
          ],
        },
        {
          id: "volume",
          title: "Volum",
          fields: [
            {
              id: "volume.depthMm",
              label: "Adâncime volum",
              type: "select",
              required: true,
              options: [{ value: "60", label: "60 mm" }],
            },
            {
              id: "volume.confirmedPerimeterMm",
              label: "Perimetru confirmat (mm)",
              type: "number",
              required: true,
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/seller")) {
        return jsonResponse({ configured: true, seller: { legalName: "Isolated" } });
      }
      if (!url.endsWith("/preview")) {
        return jsonResponse({});
      }
      const values = JSON.parse(String(init?.body)).values as Record<string, unknown>;
      const depthIsSelect = values["volume.depthMm"] === "60";
      return jsonResponse({
        product: { productCode: LOGO_PRODUCT, label: "Logo volumetric luminos" },
        values,
        formSchema: logoSchema,
        selectedComponents: [],
        readiness: depthIsSelect ? "ready" : "blocked",
        missing: depthIsSelect ? [] : [{ label: "Adâncime volum", fieldId: "volume.depthMm" }],
        reviewId: depthIsSelect ? "crv1:logo-ready" : null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    seedOwnedDrafts(
      {
        "root.inscription": "NORD LOGO",
        "face.confirmedAreaMm2": "180000",
        "volume.depthMm": "60",
        "volume.confirmedPerimeterMm": "8400",
      },
      { productCode: LOGO_PRODUCT },
    );
    renderConfigurator({ productCode: LOGO_PRODUCT });

    expect(await screen.findByText("Gata de confirmare")).toBeInTheDocument();
    expect(screen.queryByText("Lipsesc fapte")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Adâncime volum")).toHaveValue("60");
    const previewCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/preview"),
    );
    expect(previewCalls).toHaveLength(2);
    const first = JSON.parse(String(previewCalls[0]?.[1]?.body)).values as Record<string, unknown>;
    const second = JSON.parse(String(previewCalls[1]?.[1]?.body)).values as Record<
      string,
      unknown
    >;
    expect(first["volume.depthMm"]).toBe(60);
    expect(second["volume.depthMm"]).toBe("60");
    expect(second["volume.confirmedPerimeterMm"]).toBe(8400);
    expect(second["face.confirmedAreaMm2"]).toBe(180000);
    expect(second["root.inscription"]).toBe("NORD LOGO");
  });
});
