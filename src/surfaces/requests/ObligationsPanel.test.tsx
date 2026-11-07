import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommercialJourneyItemTransport, CommercialJourneyTransport } from "../../api/types";
import { ObligationsPanel } from "./ObligationsPanel";

function item(partial: Partial<CommercialJourneyItemTransport> = {}): CommercialJourneyItemTransport {
  return {
    kind: "CONFIRM_ORDER",
    key: "offer:q-1",
    quoteSnapshotId: "q-1",
    quoteKind: "PRODUCT",
    productCode: "PRD-LETTERS",
    assemblyId: null,
    title: "Confirmarea comenzii",
    detail: "Litere · OF-1",
    hint: "Se confirmă în ofertă, numai de proprietar.",
    actionLabel: "Deschide pentru confirmare",
    href: "/quotes/q-1",
    action: "OPEN_QUOTE",
    ...partial,
  };
}

function journey(partial: Partial<CommercialJourneyTransport> = {}): CommercialJourneyTransport {
  return {
    offerSummary: {
      count: 1,
      awaitingCustomer: 0,
      acceptedWithoutOrder: 1,
      ordered: 0,
      declined: 0,
      notPursued: 0,
      superseded: 0,
      undecided: 0,
      summaryLabel: "1 ofertă · 1 acceptată fără comandă",
    },
    actionable: [],
    waiting: [],
    actionableCount: 0,
    waitingCount: 0,
    orderCount: 0,
    nextAction: "OPEN_QUOTE",
    nextActionLabel: "Deschide oferta",
    nextActionHref: "/quotes/q-1",
    needsAttention: false,
    attentionLabel: null,
    phase: "OPEN",
    phaseLabel: "Deschisă",
    phaseAt: null,
    administrativeNote: null,
    ...partial,
  };
}

describe("ObligationsPanel (CJ1-P2)", () => {
  it("names organization work without claiming it belongs to the viewer", () => {
    render(
      <ObligationsPanel
        requestId="req-1"
        journey={journey({
          actionable: [item()],
          actionableCount: 1,
          needsAttention: true,
        })}
      />,
    );
    const panel = screen.getByTestId("request-obligations");
    expect(panel).toHaveTextContent("1 acțiune de rezolvat");
    expect(panel).not.toHaveTextContent(/acțiune a ta|acțiuni ale tale|actiunile tale/i);
    expect(screen.getByRole("link", { name: /Deschide pentru confirmare/ })).toHaveAttribute("href", "/oferte/produs/PRD-LETTERS/q-1");
  });

  it("keeps undecided offers as waiting without claiming the customer was contacted", () => {
    render(
      <ObligationsPanel
        requestId="req-1"
        journey={journey({
          waiting: [
            item({
              kind: "AWAIT_CUSTOMER",
              key: "offer:q-2",
              quoteSnapshotId: "q-2",
              title: "Ofertă nedecisă",
              hint: "Nu există încă o decizie comercială înregistrată.",
              actionLabel: "Deschide oferta",
              href: "/quotes/q-2",
            }),
          ],
          waitingCount: 1,
          offerSummary: {
            count: 1,
            awaitingCustomer: 1,
            acceptedWithoutOrder: 0,
            ordered: 0,
            declined: 0,
            notPursued: 0,
            superseded: 0,
            undecided: 0,
            summaryLabel: "1 ofertă · 1 nedecisă",
          },
        })}
      />,
    );
    const panel = screen.getByTestId("request-obligations");
    expect(panel).toHaveTextContent("1 ofertă nedecisă");
    expect(panel).not.toHaveTextContent(/așteaptă răspunsul|așteptarea clientului|Nimic de făcut/i);
    expect(screen.getByRole("link", { name: /Deschide oferta/ })).toHaveAttribute("href", "/oferte/produs/PRD-LETTERS/q-2");
  });

  it("counts two organization actions in the plural", () => {
    render(
      <ObligationsPanel
        requestId="req-1"
        journey={journey({
          actionable: [item(), item({ key: "offer:q-3", quoteSnapshotId: "q-3", href: "/quotes/q-3" })],
          actionableCount: 2,
          needsAttention: true,
        })}
      />,
    );
    expect(screen.getByTestId("request-obligations")).toHaveTextContent("2 acțiuni de rezolvat");
  });
});
