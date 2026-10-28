import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import { CollapsedCard, ExpandedCard } from "./HistoryEntryCard";

const waiting = (title: string): HistoryEntry => ({
  entryId: "project:r",
  kind: "PROJECT",
  title,
  reference: "CER-1",
  eventDateLabel: "28 oct. 2026",
  year: 2026,
  state: "OFERTARE",
  stateLabel: "Ofertare",
  provenance: "WORKOS",
  provenanceLabel: "În WorkOS",
  site: null,
  siteAtTimeLabel: null,
  description: null,
  request: { requestId: "r", reference: "CER-1", title, statusLabel: "Deschisă" },
  states: ["OFERTARE"],
  branches: [],
  historicalWorkId: null,
  documents: [],
  photoCount: 0,
  representativePhotoId: null,
  matchedOn: [],
});

const historical: HistoryEntry = {
  entryId: "historical:h1",
  kind: "HISTORICAL_WORK",
  title: "Refacere fațadă",
  reference: "AC-2021",
  eventDateLabel: "2021",
  year: 2021,
  state: "FINALIZAT",
  stateLabel: "Finalizată",
  provenance: "HISTORICAL_RECORD",
  provenanceLabel: "Înregistrare istorică",
  site: { siteId: "s1", name: "Depozit", line: "Depozit Ghimbav", active: true },
  siteAtTimeLabel: null,
  description: "Lucrare înregistrată după execuție.",
  request: null,
  states: ["FINALIZAT"],
  branches: [],
  historicalWorkId: "hwork:1",
  documents: [],
  photoCount: 0,
  representativePhotoId: null,
  matchedOn: [],
};

describe("history card semantics", () => {
  it("shows De ofertat on a request that has no quote, including one whose product is still unchosen", () => {
    const { rerender } = render(
      <CollapsedCard entry={waiting("Intervenție fără ofertă")} quotes={[]} mode="desktop" onExpand={() => undefined} onOpen={() => undefined} focusOnMount={false} provenanceLabels={{}} />,
    );
    expect(screen.getByText("De ofertat")).toBeInTheDocument();
    expect(screen.getByText("fără ofertă")).toBeInTheDocument();
    expect(screen.queryByText("Ofertare")).not.toBeInTheDocument();

    rerender(
      <CollapsedCard entry={waiting("Totem — produs neales")} quotes={[]} mode="desktop" onExpand={() => undefined} onOpen={() => undefined} focusOnMount={false} provenanceLabels={{}} />,
    );
    expect(screen.getByText("De ofertat")).toBeInTheDocument();
  });

  it("keeps Ofertare when a quote already exists", () => {
    const quoted = waiting("Casetă");
    quoted.branches = [
      {
        branchId: "q1",
        state: "OFERTARE",
        stateLabel: "Ofertare",
        quote: { quoteSnapshotId: "q1", kind: "PRODUCT", productCode: "P", reference: "OF-1", stageLabel: "Creată", superseded: false },
        orderSnapshotId: null,
        job: null,
        site: null,
      },
    ];
    render(<CollapsedCard entry={quoted} quotes={[]} mode="desktop" onExpand={() => undefined} onOpen={() => undefined} focusOnMount={false} provenanceLabels={{}} />);
    expect(screen.getByText("Ofertare")).toBeInTheDocument();
    expect(screen.queryByText("De ofertat")).not.toBeInTheDocument();
  });

  it("opens a historical record in Lucrări without calling it a production sheet", () => {
    render(
      <ExpandedCard
        customerId="cus-1"
        entry={historical}
        dossier={null}
        quotes={[]}
        requests={[]}
        mode="desktop"
        onCollapse={() => undefined}
        onOpen={() => undefined}
        onSite={() => undefined}
        onPreviewQuote={() => undefined}
        focusOnMount={false}
        provenanceLabels={{}}
      />,
    );
    const link = screen.getByRole("link", { name: "Vezi înregistrarea istorică" });
    expect(link).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=hwork%3A1");
    expect(screen.queryByRole("link", { name: "Deschide fișa lucrării" })).not.toBeInTheDocument();
  });
});
