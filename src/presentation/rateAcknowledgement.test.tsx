import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  presentConfirm,
  presentRateAcknowledgement,
  rateAcknowledgementSatisfied,
} from "../adapters/confirmAdapter";
import { presentQuoteSnapshot } from "../adapters/quoteAdapter";
import type { RateAcknowledgementTransport } from "../api/types";
import { FrozenRateAcknowledgementNotice, RateAcknowledgementNotice } from "./rateAcknowledgement";

const commercialRate = {
  resourceId: "MAT-VINYL-ORACAL-651",
  label: "Folie vinil",
  reason: "Tarif preluat din evidența veche, neconfirmat",
  sourceLabel: "Evidență legacy",
  unitLabel: "m²",
  context: null,
};
const ownerRate = { ...commercialRate, amount: 9, currency: "EUR" };

function required(overrides: Partial<RateAcknowledgementTransport> = {}): RateAcknowledgementTransport {
  return {
    status: "REQUIRED",
    bindingHash: "a".repeat(64),
    canAcknowledge: true,
    rates: [ownerRate],
    ...overrides,
  };
}

describe("rate acknowledgement adapter", () => {
  it("keeps the binding and hides amounts the server did not send", () => {
    const presented = presentRateAcknowledgement({
      status: "REQUIRED",
      bindingHash: "b".repeat(64),
      canAcknowledge: false,
      rates: [commercialRate],
    });
    expect(presented).toEqual({
      status: "REQUIRED",
      bindingHash: "b".repeat(64),
      canAcknowledge: false,
      rates: [{ ...commercialRate, amount: null, currency: null }],
    });
  });

  it("drops a requirement with no rates or an unknown status", () => {
    expect(presentRateAcknowledgement({ status: "NOT_REQUIRED", rates: [] })).toBeNull();
    expect(presentRateAcknowledgement({ status: "REQUIRED", rates: [] })).toBeNull();
    expect(presentRateAcknowledgement(null)).toBeNull();
  });

  it("never lets disclosure-only rates be acknowledged", () => {
    const presented = presentRateAcknowledgement({
      status: "DISCLOSURE_ONLY",
      bindingHash: null,
      canAcknowledge: true,
      rates: [ownerRate],
    });
    expect(presented?.canAcknowledge).toBe(false);
  });

  it("reads the requirement from the confirm payload and the record from a frozen quote", () => {
    expect(
      presentConfirm({ rateAcknowledgement: required() }, "crv1:x")?.rateAcknowledgement?.status,
    ).toBe("REQUIRED");
    const quote = presentQuoteSnapshot({
      quoteSnapshot: {
        quoteSnapshotId: "qts:x",
        productCode: "x",
        rateAcknowledgement: {
          acknowledgedAt: "2026-10-13T08:00:00.000Z",
          acknowledgedByUserId: "user",
          rates: [commercialRate],
        },
      },
    });
    expect(quote?.rateAcknowledgement?.rates[0]?.label).toBe("Folie vinil");
  });
});

describe("rateAcknowledgementSatisfied", () => {
  it("needs the exact current binding only when acknowledgement is required", () => {
    expect(rateAcknowledgementSatisfied(null, null)).toBe(true);
    expect(rateAcknowledgementSatisfied(required({ status: "DISCLOSURE_ONLY" }), null)).toBe(true);
    expect(rateAcknowledgementSatisfied(required(), null)).toBe(false);
    expect(rateAcknowledgementSatisfied(required(), "c".repeat(64))).toBe(false);
    expect(rateAcknowledgementSatisfied(required(), "a".repeat(64))).toBe(true);
    expect(rateAcknowledgementSatisfied(required({ bindingHash: null }), null)).toBe(false);
  });
});

describe("RateAcknowledgementNotice", () => {
  it("lets an authorized user acknowledge the listed rates", () => {
    const onChange = vi.fn();
    render(
      <RateAcknowledgementNotice
        requirement={required()}
        acknowledged={false}
        disabled={false}
        onAcknowledgedChange={onChange}
      />,
    );
    expect(screen.getByText("Folie vinil")).toBeInTheDocument();
    expect(screen.getByText(/9[,.]00/)).toBeInTheDocument();
    expect(screen.getByText(/nu confirmă tariful firmei/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("tells a user without financial access who can acknowledge, without amounts", () => {
    render(
      <RateAcknowledgementNotice
        requirement={required({
          canAcknowledge: false,
          rates: [{ ...commercialRate, amount: null, currency: null }],
        })}
        acknowledged={false}
        disabled={false}
        onAcknowledgedChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/doar de un utilizator cu acces financiar/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR|€/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Deschide Dovezi de cost" })).toBeNull();
  });

  it("only discloses rates under a manual price", () => {
    render(
      <RateAcknowledgementNotice
        requirement={required({ status: "DISCLOSURE_ONLY", bindingHash: null, canAcknowledge: false })}
        acknowledged={false}
        disabled={false}
        onAcknowledgedChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Tarife neconfirmate în costul intern")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows the acknowledgement kept on the frozen quote", () => {
    render(
      <FrozenRateAcknowledgementNotice
        acknowledgement={{
          acknowledgedAt: "2026-10-13T08:00:00.000Z",
          rates: [{ ...commercialRate, amount: null, currency: null }],
        }}
      />,
    );
    expect(screen.getByText("Tarife neconfirmate acceptate")).toBeInTheDocument();
    expect(screen.getByText("Folie vinil")).toBeInTheDocument();
  });
});
