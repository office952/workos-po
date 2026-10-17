import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDownload } from "../api/http";
import { navigate, sameOriginNavigation } from "../routing/navigate";
import { AuthenticatedDownloadLink } from "./AuthenticatedDownloadLink";
import { triggerBrowserDownload } from "./download";

vi.mock("../api/http", () => ({
  fetchDownload: vi.fn(),
}));

vi.mock("./download", () => ({
  triggerBrowserDownload: vi.fn(),
}));

function RouterHarness() {
  const [selected, setSelected] = useState(true);
  useEffect(() => {
    function onClick(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const href = sameOriginNavigation(anchor, event);
      if (href === null) {
        return;
      }
      event.preventDefault();
      navigate(href);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <>
      <button type="button" aria-pressed={selected} onClick={() => setSelected(true)}>
        Operația aleasă
      </button>
      <AuthenticatedDownloadLink href="/api/execution-artifacts/artifact-1/download">
        Descarcă
      </AuthenticatedDownloadLink>
    </>
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/lucrari/job-1?task=task-1");
  vi.clearAllMocks();
});

describe("AuthenticatedDownloadLink", () => {
  it("downloads through the app router without leaving the selected operation", async () => {
    window.history.replaceState({}, "", "/lucrari/job-1?task=task-1");
    vi.mocked(fetchDownload).mockResolvedValue({
      ok: true,
      blob: new Blob(["pdf"]),
      filename: "desen.pdf",
    });
    const user = userEvent.setup();
    render(<RouterHarness />);
    await user.click(screen.getByRole("link", { name: "Descarcă" }));
    expect(fetchDownload).toHaveBeenCalledWith("/api/execution-artifacts/artifact-1/download");
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.any(Blob), "desen.pdf");
    expect(`${window.location.pathname}${window.location.search}`).toBe("/lucrari/job-1?task=task-1");
    expect(screen.getByRole("button", { name: "Operația aleasă" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("activates the same download from the keyboard", async () => {
    window.history.replaceState({}, "", "/executie/exp-1?task=task-1");
    vi.mocked(fetchDownload).mockResolvedValue({
      ok: true,
      blob: new Blob(["pdf"]),
      filename: null,
    });
    const user = userEvent.setup();
    render(<RouterHarness />);
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(fetchDownload).toHaveBeenCalledTimes(1);
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.any(Blob), "document");
    expect(window.location.pathname).toBe("/executie/exp-1");
  });
});
