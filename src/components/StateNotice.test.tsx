import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateNotice, type StateNoticeKind } from "./StateNotice";

const cases: readonly { kind: StateNoticeKind; label: string; role: "status" | "alert" }[] = [
  { kind: "empty", label: "Gol", role: "status" },
  { kind: "loading", label: "Se încarcă", role: "status" },
  { kind: "error", label: "Eroare", role: "alert" },
  { kind: "blocked", label: "Blocat", role: "alert" },
  { kind: "read-only", label: "Doar citire", role: "status" },
  { kind: "disabled", label: "Indisponibil", role: "status" },
  { kind: "complete", label: "Finalizat", role: "status" },
  { kind: "no-selection", label: "Nicio selecție", role: "status" },
];

describe("StateNotice", () => {
  it("names every state in text and explains the next step", () => {
    const { rerender } = render(
      <StateNotice kind="empty" title="Nimic de arătat" reason="Nu există înregistrări." />,
    );

    for (const item of cases) {
      rerender(
        <StateNotice
          kind={item.kind}
          title="Situație"
          reason="De aceea."
          action={<a href="/">Continuă</a>}
        />,
      );
      expect(screen.getByText(item.label)).toBeInTheDocument();
      expect(screen.getByText("De aceea.")).toBeInTheDocument();
      expect(screen.getByRole(item.role)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Continuă" })).toBeInTheDocument();
    }
  });
});
