import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobFilesPanel } from "./JobFilesPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("JobFilesPanel", () => {
  it("shows an empty job archive and keeps the selected file when upload fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/files") && init?.method === "POST") {
          return jsonResponse({ error: "invalid_file" }, 422);
        }
        return jsonResponse({ archive: { jobId: "job-1", files: [], history: [] } });
      }),
    );
    render(<JobFilesPanel jobId="job-archive" />);
    expect(await screen.findByText("Lucrarea nu are încă fișiere.")).toBeTruthy();
    const input = screen.getByLabelText("Fișier");
    const file = new File(["abc"], "contur.nc", { type: "text/plain" });
    await user.upload(input, file);
    expect(screen.getByText(/contur\.nc/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Încarcă fișierul" }));
    await waitFor(() => {
      expect(screen.getByText("Formatul nu este permis.")).toBeTruthy();
    });
    expect(screen.getByText(/contur\.nc/)).toBeTruthy();
  });
});
