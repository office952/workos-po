import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobListItemTransport } from "../../api/types";

const loaders = vi.hoisted(() => ({
  loadRequestDetail: vi.fn(async () => ({ reference: "CER-7" })),
  loadQuoteEnvelope: vi.fn(async () => ({ reference: "OF-9" })),
}));
vi.mock("../../data/routeLoaders", () => loaders);

const { JobContextTrail } = await import("./JobContextTrail");

const job = {
  jobId: "job-1",
  customerId: "cus-1",
  customerDisplayName: "Sign Pro Demo SRL",
  title: "SIGN PRO",
  kind: "PRODUCT",
} as unknown as JobListItemTransport;

function renderTrail(capabilities: readonly string[] | null) {
  return render(<JobContextTrail job={job} capabilities={capabilities} requestId="req-1" quoteSnapshotId="qs-1" sourceHref="/oferte/produs/x/qs-1" operationLabel={null} />);
}

beforeEach(() => {
  loaders.loadRequestDetail.mockClear();
  loaders.loadQuoteEnvelope.mockClear();
});

describe("JobContextTrail · V1 role scope (E)", () => {
  it("Atelier keeps the client name as a plain reference, with no Cerere / Ofertă step and no reads", () => {
    renderTrail(["jobs.read", "execution.operate"]);
    const nav = screen.getByRole("navigation", { name: "Firul lucrării" });
    expect(nav).toHaveTextContent("Sign Pro Demo SRL");
    expect(nav.querySelectorAll("a")).toHaveLength(0);
    expect(nav).not.toHaveTextContent("Cerere");
    expect(nav).not.toHaveTextContent("Ofertă");
    expect(loaders.loadRequestDetail).not.toHaveBeenCalled();
    expect(loaders.loadQuoteEnvelope).not.toHaveBeenCalled();
  });

  it("Producție keeps client and request links but gets no offer step", () => {
    renderTrail(["customers.read", "requests.read", "jobs.read"]);
    const links = [...screen.getByRole("navigation", { name: "Firul lucrării" }).querySelectorAll("a")].map((a) => a.textContent);
    expect(links).toHaveLength(2);
    expect(links[0]).toBe("Sign Pro Demo SRL");
    expect(loaders.loadQuoteEnvelope).not.toHaveBeenCalled();
  });

  it("owner / member, or unknown capabilities, keep the full trail as before", () => {
    renderTrail(null);
    expect(screen.getByRole("navigation", { name: "Firul lucrării" }).querySelectorAll("a")).toHaveLength(3);
  });
});
