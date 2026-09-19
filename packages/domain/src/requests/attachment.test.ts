import { describe, expect, it } from "vitest";
import {
  formatAttachmentSize,
  generateAttachmentId,
  generateAttachmentStorageKey,
  projectRequestAttachment,
  safeAttachmentDownloadAsciiName,
} from "./attachment.js";

describe("request attachment helpers", () => {
  it("generates stable identity prefixes and opaque storage keys", () => {
    expect(generateAttachmentId()).toMatch(/^att:[0-9a-f-]{36}$/i);
    expect(generateAttachmentStorageKey()).toMatch(/^[0-9a-f]{32}$/i);
    expect(generateAttachmentStorageKey()).not.toContain("-");
  });

  it("formats sizes for operator display", () => {
    expect(formatAttachmentSize(0)).toBe("0 B");
    expect(formatAttachmentSize(500)).toBe("500 B");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("sanitizes download ASCII names without changing stored metadata", () => {
    expect(safeAttachmentDownloadAsciiName('../../x"y.pdf')).toBe("../../x_y.pdf");
    expect(safeAttachmentDownloadAsciiName("..")).toBe("fisier");
    expect(safeAttachmentDownloadAsciiName("fișier client.pdf")).toBe("fisier client.pdf");
  });

  it("projects download href from request ownership", () => {
    const projection = projectRequestAttachment({
      attachmentId: "att:1",
      requestId: "crq:1",
      originalFileName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "abc",
      sha256: "dead",
      createdAt: "2026-08-18T10:00:00.000Z",
    });
    expect(projection.downloadHref).toBe(
      "/api/requests/crq%3A1/attachments/att%3A1/download",
    );
    expect(projection.sizeLabel).toBe("1.0 KB");
  });
});
