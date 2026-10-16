import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDossierPanel } from "./TaskDossierPanel";

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

const emptyDossier = {
  dossier: {
    taskId: "task-1",
    instructions: [],
    observations: [],
    issues: [],
    files: [],
    planFiles: [],
    history: [],
  },
};

describe("TaskDossierPanel", () => {
  it("keeps the observation when the save fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/observations") && init?.method === "POST") {
          return jsonResponse({ error: "invalid_text" }, 422);
        }
        return jsonResponse(emptyDossier);
      }),
    );

    render(<TaskDossierPanel taskId="task-1" canInstruct={false} />);
    await user.click(await screen.findByRole("button", { name: "Adaugă observație" }));
    const field = screen.getByLabelText("Observație");
    await user.type(field, "Muchia nu e curată");
    await user.click(screen.getByRole("button", { name: "Salvează observația" }));

    expect(await screen.findByText(/Textul este gol sau prea lung|Dosarul nu a putut fi actualizat/)).toBeInTheDocument();
    expect(field).toHaveValue("Muchia nu e curată");
  });

  it("keeps the selected file when the upload fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/artifacts") && init?.method === "POST") {
          return jsonResponse({ error: "invalid_file" }, 422);
        }
        return jsonResponse(emptyDossier);
      }),
    );

    render(<TaskDossierPanel taskId="task-1" canInstruct={false} />);
    await user.click(await screen.findByRole("button", { name: "Atașează fișier" }));
    const input = screen.getByLabelText("Fișier");
    const file = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Încarcă fișierul" }));

    await waitFor(() => {
      expect(screen.getByText("Fișierul nu este într-un format permis.")).toBeInTheDocument();
    });
    expect(screen.getByText("plan.pdf")).toBeInTheDocument();
  });
});
