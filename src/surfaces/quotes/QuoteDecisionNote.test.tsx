import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuoteDecisionNote } from "./QuoteDecisionNote";
import { commercialLifecycleLabel, quoteDecisionMode } from "./quoteDecisionMode";

describe("CJ1-R1 · the offer explains only the decision still open", () => {
  it("follows the server's commercial status and next action", () => {
    expect(quoteDecisionMode({ ordered: true, status: { commercialStatus: "ORDERED" }, nextAction: "OPEN_ORDER" })).toBe("ordered");
    expect(quoteDecisionMode({ ordered: false, status: { commercialStatus: "ACCEPTED_WITHOUT_ORDER" }, nextAction: "CREATE_ORDER" })).toBe("confirm-order");
    expect(quoteDecisionMode({ ordered: false, status: { commercialStatus: "AWAITING_CUSTOMER" }, nextAction: "ACCEPT_QUOTE" })).toBe("accept");
    expect(quoteDecisionMode({ ordered: false, status: { commercialStatus: "DECLINED_BY_CUSTOMER" }, nextAction: null })).toBe("none");
    expect(quoteDecisionMode({ ordered: false, status: null, nextAction: null })).toBe("none");
  });

  it("after acceptance without order names the open obligation, not the completed acceptance", () => {
    render(<QuoteDecisionNote mode="confirm-order" permission="Confirmarea comenzii: numai proprietarul." />);
    expect(screen.getByRole("heading", { name: "Obligație deschisă" })).toBeInTheDocument();
    expect(screen.getByText(/Clientul a acceptat oferta, dar comanda nu este confirmată/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ce se întâmplă când accepți" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Acceptarea creează comanda/)).not.toBeInTheDocument();
  });

  it("before acceptance names the issued quote, not an approved price or an order", () => {
    render(<QuoteDecisionNote mode="accept" permission="Poți accepta oferta." />);
    expect(screen.getByRole("heading", { name: "Ofertă emisă, încă neacceptată" })).toBeInTheDocument();
    expect(screen.getByText(/Prețul aprobat intern nu este o comandă/)).toBeInTheDocument();
    expect(screen.getByText("Poți accepta oferta.")).toBeInTheDocument();
  });

  it("after the customer order names the accepted command, not the issued quote", () => {
    render(<QuoteDecisionNote mode="ordered" permission="—" />);
    expect(screen.getByRole("heading", { name: "Comandă acceptată a clientului" })).toBeInTheDocument();
    expect(commercialLifecycleLabel("ordered")).toBe("Comandă acceptată a clientului");
    expect(commercialLifecycleLabel("accept")).toBe("Ofertă emisă, încă neacceptată");
  });

  it("gives a decided offer no instructions", () => {
    render(<QuoteDecisionNote mode="none" permission="Acceptarea nu este disponibilă pentru această ofertă." />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
