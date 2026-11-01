import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobRecordFile } from "../../api/jobRecord";
import { JobFileViewer } from "./JobFileViewer";

const dxf = (artifactId: string, supersedesArtifactId: string | null, day: number): JobRecordFile => ({
  artifactId,
  originalFileName: "litere.dxf",
  mimeType: "application/dxf",
  sizeLabel: "1 KB",
  purpose: "WORKING",
  purposeLabel: "Fișier de lucru",
  note: null,
  preview: "DOWNLOAD",
  supersedesArtifactId,
  authorLabel: null,
  uploadedAt: `2026-10-2${day}T07:00:00Z`,
  downloadHref: `/api/execution-artifacts/${artifactId}/download`,
  usages: [],
});

const noop = () => {};
const viewer = (files: JobRecordFile[], fileId: string, anchorId: string) =>
  render(<JobFileViewer files={files} fileId={fileId} anchorId={anchorId} contextLabel="Fișierele lucrării" expanded={false} onSwitch={noop} onToggleExpand={noop} onClose={noop} />);
const versionButtons = () => screen.getAllByRole("button").map((button) => button.textContent).filter((text) => text !== "Închide ×" && !text?.startsWith("Revino") && !text?.includes("vizorul"));

describe("file viewer · version marks (UX-S1)", () => {
  it("keeps v1 / v2 on a confirmed chain", () => {
    viewer([dxf("v1", null, 0), dxf("v2", "v1", 1)], "v2", "v1");
    expect(versionButtons()).toEqual(["v1 · asociată", "v2 · ulterioară"]);
    expect(screen.getByText("Consulți v2 (ulterioară). Asocierea rămâne la v1; utilizarea declarată nu se schimbă.")).toBeInTheDocument();
  });

  it("does not number a parallel revision as if it came after its sibling", () => {
    viewer([dxf("v1", null, 0), dxf("a", "v1", 1), dxf("b", "v1", 2)], "b", "v1");
    expect(versionButtons()).toEqual(["v1 · asociată", "rev. · ulterioară"]);
    expect(screen.getByText("Consulți rev. (ulterioară). Asocierea rămâne la v1; utilizarea declarată nu se schimbă.")).toBeInTheDocument();
  });

  it("does not presume a number when the predecessor is not in the record", () => {
    viewer([dxf("r", "absent", 0), dxf("r2", "r", 1)], "r2", "r2");
    expect(versionButtons()).toEqual(["rev. · anterioară", "rev. · asociată"]);
  });
});
