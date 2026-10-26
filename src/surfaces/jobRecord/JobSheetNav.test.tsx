import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobSheetNav } from "./JobSheetNav";

afterEach(() => vi.unstubAllGlobals());

describe("JobSheetNav · sticky sections (N-018)", () => {
  it("keeps the section anchor outside the sticky bar and shows the identity only once the header is out of view", () => {
    let notify: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { notify = callback; }
      observe() {}
      disconnect() {}
    });
    const headerRef = createRef<HTMLElement>();
    const { container } = render(
      <>
        <header ref={headerRef}>Antet</header>
        <JobSheetNav jobId="job-1" active="operatii" identity="Panou și litere · În lucru · Operația 02" headerRef={headerRef} />
      </>,
    );
    const anchor = container.querySelector("[data-section-top]")!;
    const bar = container.querySelector(".job-sheet__sticky")!;
    expect(bar.contains(anchor)).toBe(false);
    expect(anchor.nextElementSibling).toBe(bar);
    expect(screen.getByRole("navigation", { name: "Secțiunile lucrării" })).toBeInTheDocument();
    const identity = screen.getByText("Panou și litere · În lucru · Operația 02");
    expect(bar).not.toHaveAttribute("data-stuck");
    expect(identity).toHaveAttribute("aria-hidden", "true");
    act(() => notify!([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute("data-stuck");
    expect(identity).toHaveAttribute("aria-hidden", "false");
    act(() => notify!([{ isIntersecting: true }]));
    expect(bar).not.toHaveAttribute("data-stuck");
  });
});
