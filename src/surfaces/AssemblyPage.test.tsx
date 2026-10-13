import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { AssemblyPage, assemblyLead } from "./AssemblyPage";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState(null, "", "/");
});

describe("assemblyLead", () => {
  it("keeps the letters assembly wording when logo is absent", () => {
    expect(assemblyLead(false, true)).toContain("Configurează literele");
    expect(assemblyLead(false, true)).toContain("panoul ACM");
    expect(assemblyLead(false, true)).toContain("pregătește oferta");
  });

  it("says letters are optional only when the logo assembly has no letters", () => {
    expect(assemblyLead(true, false)).toBe(
      "Configurează panoul și logo-ul. Literele sunt opționale.",
    );
  });

  it("names the panel, letters, and logo when letters are present", () => {
    expect(assemblyLead(true, true)).toBe(
      "Configurează panoul, literele și logo-ul, apoi confirmă ansamblul.",
    );
  });
});

describe("AssemblyPage", () => {
  it("uses the full composition lead when letters are confirmed", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:full");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            assembly: {
              assemblyId: "asm:full",
              label: "Panou ACM + litere + logo volumetric",
              statusLabel: "Confirmat",
              stale: false,
              staleReason: null,
              canConfirm: false,
              scopes: [
                { id: "acm", title: "Panou ACM", complete: true, summary: "Panou" },
                { id: "logo", title: "Logo", complete: true, summary: "Logo" },
                { id: "letters", title: "Litere", complete: true, summary: "Litere" },
                { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
                { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
              ],
              quote: null,
              orderId: null,
              productionId: null,
              executionPlanId: null,
            },
          }),
        }),
      ),
    );

    render(<AssemblyPage />);
    expect(
      await screen.findByText(
        "Configurează panoul, literele și logo-ul, apoi confirmă ansamblul.",
      ),
    ).toBeInTheDocument();
  });

  it("enables confirm when a remount refetches canConfirm from the server", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:sync");
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          assembly: {
            assemblyId: "asm:sync",
            customerId: "cus:1",
            requestId: "crq:1",
            label: "Panou ACM + litere volumetrice",
            statusLabel: "În lucru",
            stale: false,
            staleReason: null,
            canConfirm: true,
            scopes: [
              {
                id: "acm",
                title: "Panou ACM",
                complete: true,
                summary: "Panou",
                productCode: "ACM_PANEL",
                role: "SUPPORT_PANEL",
              },
              {
                id: "letters",
                title: "Litere",
                complete: true,
                summary: "Litere",
                productCode: "LETTERS_V1",
                role: "SIGNAGE_LETTERS",
              },
              { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
              { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
            ],
            quote: null,
            orderId: null,
            productionId: null,
            executionPlanId: null,
          },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssemblyPage />);
    const confirmButton = await screen.findByRole("button", { name: "Confirmă ansamblul" });
    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows the frozen quote with Romanian amounts, honest PARTIAL production cost and consult-only members after an order", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:released");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            assembly: {
              assemblyId: "asm:released",
              customerId: "cus:1",
              requestId: "crq:1",
              label: "Panou ACM + litere volumetrice",
              statusLabel: "Confirmat",
              stale: false,
              staleReason: null,
              canConfirm: false,
              scopes: [
                { id: "acm", title: "Panou ACM", complete: true, summary: "Panou", productCode: "ACM_PANEL", role: "SUPPORT_PANEL" },
                { id: "letters", title: "Litere", complete: true, summary: "Litere", productCode: "LETTERS_V1", role: "SIGNAGE_LETTERS" },
                { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
                { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
              ],
              quote: {
                label: "Panou ACM + litere volumetrice",
                sections: [{ title: "Litere", inscription: "ABC", grossPrice: 647.68 }],
                netPrice: 633.34,
                vatAmount: 133,
                grossPrice: 766.34,
                currency: "EUR",
              },
              orderId: "asmo:1",
              productionId: "asmp:1",
              executionPlanId: null,
              productionCost: {
                total: 461.64,
                currency: "EUR",
                completeness: "PARTIAL",
                completenessLabel: "Incomplet pentru configurația curentă",
                unpricedOperations: ["Montaj litere pe panou", "Control final"],
              },
              membersEditable: false,
            },
          }),
        }),
      ),
    );

    render(<AssemblyPage />);
    expect(await screen.findByText("766,34 EUR")).toBeInTheDocument();
    expect(screen.getByText("ABC · 647,68 EUR cu TVA")).toBeInTheDocument();
    expect(screen.getByText("461,64 EUR")).toBeInTheDocument();
    expect(screen.getByText(/Montaj litere pe panou, Control final/)).toBeInTheDocument();
    screen.getByRole("button", { name: /Panou ACM/ }).click();
    expect(await screen.findByRole("link", { name: "Consultă configurația" })).toBeInTheDocument();
  });

  it("labels frozen section amounts as VAT-inclusive and keeps net, VAT and gross totals separate", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:vat");
    const quote = {
      label: "Panou ACM + litere volumetrice",
      sections: [
        { title: "Litere", inscription: "AUDIT", grossPrice: 453.4 },
        { title: "Panou ACM", inscription: "AUDIT", grossPrice: 415.08 },
      ],
      netPrice: 717.75,
      vatAmount: 150.73,
      grossPrice: 868.48,
      currency: "EUR",
    };
    const frozen = JSON.parse(JSON.stringify(quote)) as typeof quote;
    const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          assembly: {
            assemblyId: "asm:vat",
            customerId: "cus:1",
            requestId: "crq:1",
            label: "Panou ACM + litere volumetrice",
            statusLabel: "Confirmat",
            stale: false,
            staleReason: null,
            canConfirm: false,
            scopes: [
              { id: "acm", title: "Panou ACM", complete: true, summary: "Panou" },
              { id: "letters", title: "Litere", complete: true, summary: "Litere" },
              { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
            ],
            quote,
            orderId: null,
            productionId: null,
            executionPlanId: null,
          },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssemblyPage />);

    expect(await screen.findByText("Secțiuni · sume cu TVA inclus")).toBeInTheDocument();
    expect(screen.getByText("AUDIT · 453,40 EUR cu TVA")).toBeInTheDocument();
    expect(screen.getByText("AUDIT · 415,08 EUR cu TVA")).toBeInTheDocument();
    expect(screen.getByText("Total net (fără TVA)")).toBeInTheDocument();
    expect(screen.getByText("717,75 EUR")).toBeInTheDocument();
    expect(screen.getByText("150,73 EUR")).toBeInTheDocument();
    expect(screen.getByText("Total comercial (cu TVA)")).toBeInTheDocument();
    expect(screen.getByText("868,48 EUR")).toBeInTheDocument();
    expect(screen.queryByText("717,75 EUR cu TVA")).not.toBeInTheDocument();
    expect(quote).toEqual(frozen);
    expect(
      fetchMock.mock.calls.every(([, init]) => String(init?.method ?? "GET") === "GET"),
    ).toBe(true);
  });

  it("freezes the assembly quote only after the Owner accepts its unconfirmed rates", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:ack");
    const fetchMock = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          assembly:
            init?.method === "POST"
              ? {
                  ...confirmedAssembly("asm:ack"),
                  quote: QUOTE,
                  frozenRateAcknowledgement: {
                    acknowledgedAt: "2026-10-13T09:00:00.000Z",
                    rates: [UNCONFIRMED_RATE],
                  },
                }
              : {
                  ...confirmedAssembly("asm:ack"),
                  rateAcknowledgement: {
                    status: "REQUIRED",
                    bindingHash: "binding-1",
                    canAcknowledge: true,
                    rates: [UNCONFIRMED_RATE],
                  },
                },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssemblyPage />);
    const quoteButton = await screen.findByRole("button", { name: "Pregătește oferta" });
    expect(screen.getByText("Prețul clientului folosește tarife neconfirmate")).toBeInTheDocument();
    expect(screen.getByText(/Panou ACM · 18,00 EUR \/ m²/)).toBeInTheDocument();
    expect(quoteButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(quoteButton).not.toBeDisabled();
    });
    fireEvent.click(quoteButton);

    expect(await screen.findByText("Tarife neconfirmate acceptate")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/assemblies/asm:ack/quote");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      rateAcknowledgement: { bindingHash: "binding-1" },
    });
  });

  it("drops a stale acknowledgement and reloads the requirement when the server refuses it", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:stale");
    const pendingAssembly = {
      ...confirmedAssembly("asm:stale"),
      rateAcknowledgement: {
        status: "REQUIRED",
        bindingHash: "binding-old",
        canAcknowledge: true,
        rates: [UNCONFIRMED_RATE],
      },
    };
    const fetchMock = vi.fn((_path: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? {
              ok: false,
              status: 409,
              json: async () => ({
                error: "rate_acknowledgement_stale",
                reasons: ["Oferta sau tarifele s-au schimbat după acceptare."],
              }),
            }
          : { ok: true, status: 200, json: async () => ({ assembly: pendingAssembly }) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssemblyPage />);
    const quoteButton = await screen.findByRole("button", { name: "Pregătește oferta" });
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(quoteButton).not.toBeDisabled();
    });
    fireEvent.click(quoteButton);

    expect(await screen.findByText("Acțiunea nu a fost finalizată")).toBeInTheDocument();
    expect(screen.getByText("Oferta sau tarifele s-au schimbat după acceptare.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(quoteButton).toBeDisabled();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").length).toBeGreaterThan(1);
    });
  });

  it("tells a commercial user to ask for acknowledgement without offering the binding", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:commercial");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            assembly: {
              ...confirmedAssembly("asm:commercial"),
              rateAcknowledgement: {
                status: "REQUIRED",
                bindingHash: null,
                canAcknowledge: false,
                rates: [{ ...UNCONFIRMED_RATE, amount: undefined, currency: undefined }],
              },
            },
          }),
        }),
      ),
    );

    render(<AssemblyPage />);
    expect(
      await screen.findByText(/pot fi acceptate doar de un utilizator cu acces financiar/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/18,00 EUR/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pregătește oferta" })).toBeDisabled();
  });
});

const UNCONFIRMED_RATE = {
  resourceId: "acm_3mm",
  label: "Placă ACM 3 mm",
  reason: "Valoare generată automat (AI), neconfirmată de owner",
  sourceLabel: "Decizie AI / default de dezvoltare",
  unitLabel: "m²",
  context: "Panou ACM",
  amount: 18,
  currency: "EUR",
};

const QUOTE = {
  label: "Panou ACM + litere volumetrice",
  sections: [{ title: "Panou ACM", inscription: "ACK", grossPrice: 120 }],
  netPrice: 100,
  vatAmount: 20,
  grossPrice: 120,
  currency: "EUR",
};

function confirmedAssembly(assemblyId: string) {
  return {
    assemblyId,
    customerId: "cus:1",
    requestId: "crq:1",
    label: "Panou ACM + litere volumetrice",
    statusLabel: "Confirmat",
    stale: false,
    staleReason: null,
    canConfirm: false,
    scopes: [
      { id: "acm", title: "Panou ACM", complete: true, summary: "Panou" },
      { id: "letters", title: "Litere", complete: true, summary: "Litere" },
      { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
      { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
    ],
    quote: null,
    orderId: null,
    productionId: null,
    executionPlanId: null,
    rateAcknowledgement: null,
    frozenRateAcknowledgement: null,
  };
}
