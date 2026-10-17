import { Blob as NodeBlob } from "node:buffer";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DossierFile } from "../api/taskDossier";
import { JobArtifactPreview } from "./JobArtifactPreview";

const download = vi.hoisted(() => vi.fn());
vi.mock("../api/http", () => ({
  fetchDownload: (...args: unknown[]) => download(...args),
}));
function file(id: string, extension = "pdf", preview = "NONE"): DossierFile {
  return {
    artifactId: id,
    originalFileName: `${id}.${extension}`,
    mimeType: extension === "pdf" ? "application/pdf" : "text/plain",
    sizeLabel: "1 KB",
    category: "DOCUMENT",
    purpose: null,
    purposeLabel: null,
    note: null,
    usedAt: null,
    preview,
    uploadedAt: "2026-10-17T10:00:00Z",
    downloadHref: `/api/execution-artifacts/${id}/download`,
    linkedToTask: true,
  };
}
function result(text: string, type: string) {
  return {
    ok: true,
    blob: new NodeBlob([text], { type }),
    filename: "document",
  };
}
let nextUrl = 0;
beforeEach(() => {
  download.mockReset();
  nextUrl = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:test-${++nextUrl}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("JobArtifactPreview", () => {
  it("loads PDF through authenticated download helper and releases replaced URLs", async () => {
    download.mockResolvedValue(result("%PDF-1.4\nexample", "application/pdf"));
    const view = render(<JobArtifactPreview file={file("first")} />);
    expect(await screen.findByTitle("first.pdf")).toHaveAttribute(
      "src",
      "blob:test-1#view=FitH",
    );
    expect(download).toHaveBeenCalledWith(
      "/api/execution-artifacts/first/download",
    );
    expect(
      screen.getByRole("link", { name: "Descarcă fișierul ↗" }),
    ).toHaveAttribute("href", "/api/execution-artifacts/first/download");
    view.rerender(<JobArtifactPreview file={file("second")} />);
    await screen.findByTitle("second.pdf");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });
  it("never embeds an HTML payload named PDF or a mismatched PDF signature", async () => {
    download.mockResolvedValue(
      result("<script>alert(1)</script>", "text/html"),
    );
    const view = render(<JobArtifactPreview file={file("unsafe")} />);
    expect(
      await screen.findByText(
        /Previzualizarea acestui format nu este disponibilă/,
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    download.mockResolvedValue(
      result("<html>not pdf</html>", "application/pdf"),
    );
    view.rerender(<JobArtifactPreview file={file("unsafe-again")} />);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("renders text as escaped text and limits visible content", async () => {
    download.mockResolvedValue(
      result("<img src=x onerror=alert(1)>" + "x".repeat(262144), "text/plain"),
    );
    render(<JobArtifactPreview file={file("note", "txt")} />);
    const pre = await waitFor(() => {
      const el = document.querySelector("pre");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(pre.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(pre.textContent!.length).toBe(262144);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/primele 256 KB/)).toBeInTheDocument();
  });
  it("discards a late document response after switching selection", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    download.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    download.mockResolvedValueOnce(result("Documentul B", "text/plain"));
    const view = render(<JobArtifactPreview file={file("a")} />);
    view.rerender(<JobArtifactPreview file={file("b", "txt")} />);
    expect(await screen.findByText("Documentul B")).toBeInTheDocument();
    await act(async () => resolve(result("%PDF-1.4", "application/pdf")));
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("does not fetch native formats and keeps their real download", () => {
    render(<JobArtifactPreview file={file("contur", "cdr")} />);
    expect(
      screen.getByText(/Previzualizarea nativă nu este disponibilă/),
    ).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Descarcă fișierul ↗" }),
    ).toHaveAttribute("href", "/api/execution-artifacts/contur/download");
  });
  it("falls back to download when the preview size limit is exceeded", async () => {
    download.mockResolvedValue(
      result("x".repeat(16 * 1024 * 1024 + 1), "application/pdf"),
    );
    render(<JobArtifactPreview file={file("large")} />);
    expect(
      await screen.findByText(/prea mare pentru previzualizare/),
    ).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("revokes the image URL on unmount, including session-scoped remounts", async () => {
    download.mockResolvedValue(result("image bytes", "image/png"));
    const view = render(
      <JobArtifactPreview file={file("photo", "png", "IMAGE")} />,
    );
    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      "blob:test-1",
    );
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });
});
