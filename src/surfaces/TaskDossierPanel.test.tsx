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
    await user.click(await screen.findByRole("button", { name: "Adaugă fișier" }));
    const input = screen.getByLabelText("Fișier");
    const file = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Încarcă fișierul" }));

    await waitFor(() => {
      expect(screen.getByText("Fișierul nu este într-un format permis.")).toBeInTheDocument();
    });
    expect(screen.getByText(/plan\.pdf/)).toBeInTheDocument();
  });

  it("previews a general file without linking it", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return jsonResponse({
          dossier: {
            ...emptyDossier.dossier,
            planFiles: [
              {
                artifactId: "general-1",
                originalFileName: "fatada.cdr",
                mimeType: "application/octet-stream",
                sizeLabel: "1 KB",
                category: "TECHNICAL",
                purpose: null,
                purposeLabel: null,
                note: null,
                usedAt: null,
                preview: "NONE",
                uploadedAt: "2026-10-18T01:00:00Z",
                downloadHref: "/api/execution-artifacts/general-1/download",
                linkedToTask: false,
                supersedesArtifactId: null,
              },
            ],
          },
        });
      }),
    );
    const user = userEvent.setup();
    render(<TaskDossierPanel taskId="task-1" canInstruct={false} />);
    await user.click(await screen.findByRole("button", { name: "fatada.cdr" }));
    expect(screen.getByRole("heading", { name: "fatada.cdr" })).toBeInTheDocument();
    expect(calls.some((call) => call.includes("artifact-links"))).toBe(false);
    expect(calls.some((call) => call.includes("artifact-use"))).toBe(false);
  });

  it("warns about a later general version without replacing the linked file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo, init?: RequestInit) => {
        if (init?.method === "POST") {
          return jsonResponse({ error: "unexpected" }, 500);
        }
        return jsonResponse({
          dossier: {
            ...emptyDossier.dossier,
            files: [
              {
                artifactId: "old-1",
                originalFileName: "v1.cdr",
                mimeType: "application/octet-stream",
                sizeLabel: "1 KB",
                category: "TECHNICAL",
                purpose: null,
                purposeLabel: null,
                note: null,
                usedAt: null,
                preview: "NONE",
                uploadedAt: "2026-10-17T01:00:00Z",
                downloadHref: "/api/execution-artifacts/old-1/download",
                linkedToTask: true,
                supersedesArtifactId: null,
              },
            ],
            planFiles: [
              {
                artifactId: "new-1",
                originalFileName: "v2.cdr",
                mimeType: "application/octet-stream",
                sizeLabel: "1 KB",
                category: "TECHNICAL",
                purpose: null,
                purposeLabel: null,
                note: null,
                usedAt: null,
                preview: "NONE",
                uploadedAt: "2026-10-18T01:00:00Z",
                downloadHref: "/api/execution-artifacts/new-1/download",
                linkedToTask: false,
                supersedesArtifactId: "old-1",
              },
            ],
          },
        });
      }),
    );
    const user = userEvent.setup();
    render(<TaskDossierPanel taskId="task-1" canInstruct={false} />);
    await user.click(await screen.findByRole("button", { name: "v1.cdr" }));
    expect(await screen.findByText(/versiune ulterioară/)).toHaveTextContent("v2.cdr");
    expect(screen.getByRole("heading", { name: "v1.cdr" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deschide v2.cdr" }));
    expect(screen.getByRole("heading", { name: "v2.cdr" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asociază operației" })).toBeInTheDocument();
  });

  it("keeps each operation draft when moving away and back", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(emptyDossier)));
    const user = userEvent.setup();
    const view = render(<TaskDossierPanel taskId="task-a" canInstruct taskLabel="A" sessionScope="org-1" />);
    await user.click(await screen.findByRole("button", { name: "Adaugă observație" }));
    await user.type(screen.getByLabelText("Observație"), "Text A");
    await user.click(screen.getByRole("button", { name: "Semnalează problemă" }));
    await user.selectOptions(screen.getByLabelText("Motiv"), "DRAWING");
    await user.type(screen.getByLabelText("Descriere"), "Motiv A");
    await user.click(screen.getByRole("button", { name: "Adaugă instrucțiune" }));
    await user.type(screen.getByLabelText("Instrucțiune tehnică"), "Instrucțiune A");

    view.rerender(<TaskDossierPanel taskId="task-b" canInstruct taskLabel="B" sessionScope="org-1" />);
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(screen.getByLabelText("Observație"), "Text B");

    view.rerender(<TaskDossierPanel taskId="task-a" canInstruct taskLabel="A" sessionScope="org-1" />);
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    expect(screen.getByLabelText("Observație")).toHaveValue("Text A");
    await user.click(screen.getByRole("button", { name: "Semnalează problemă" }));
    expect(screen.getByLabelText("Motiv")).toHaveValue("DRAWING");
    expect(screen.getByLabelText("Descriere")).toHaveValue("Motiv A");
    await user.click(screen.getByRole("button", { name: "Adaugă instrucțiune" }));
    expect(screen.getByLabelText("Instrucțiune tehnică")).toHaveValue("Instrucțiune A");
  });

  it("applies a late save only to the operation that submitted it", async () => {
    const pendingSave: { run: (() => void) | null } = { run: null };
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          posts.push(url);
          return new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => {
            pendingSave.run = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  dossier: {
                    ...emptyDossier.dossier,
                    taskId: "task-a",
                    observations: [
                      {
                        entryId: "o1",
                        kind: "OBSERVATION",
                        body: "Text A",
                        reasonCode: null,
                        reasonLabel: null,
                        authorLabel: "Ana",
                        createdAt: "2026-10-18T01:00:00Z",
                      },
                    ],
                  },
                }),
              });
          });
        }
        const taskId = url.includes("task-b") ? "task-b" : "task-a";
        return jsonResponse({ dossier: { ...emptyDossier.dossier, taskId } });
      }),
    );
    const user = userEvent.setup();
    const view = render(<TaskDossierPanel taskId="task-a" canInstruct={false} sessionScope="org-1" />);
    await user.click(await screen.findByRole("button", { name: "Adaugă observație" }));
    await user.type(screen.getByLabelText("Observație"), "Text A");
    await user.click(screen.getByRole("button", { name: "Salvează observația" }));
    view.rerender(<TaskDossierPanel taskId="task-b" canInstruct={false} sessionScope="org-1" />);
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    await user.type(screen.getByLabelText("Observație"), "Text B");
    pendingSave.run?.();
    await waitFor(() => expect(screen.getByLabelText("Observație")).toHaveValue("Text B"));
    expect(posts).toEqual(["/api/execution-tasks/task-a/observations"]);
    view.rerender(<TaskDossierPanel taskId="task-a" canInstruct={false} sessionScope="org-1" />);
    await user.click(screen.getByRole("button", { name: "Adaugă observație" }));
    expect(screen.getByLabelText("Observație")).toHaveValue("");
  });
});
