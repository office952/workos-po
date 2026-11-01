import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

function SwitchingViewer({ files, start, anchorId }: { files: JobRecordFile[]; start: string; anchorId: string }) {
  const [fileId, setFileId] = useState(start);
  return <JobFileViewer files={files} fileId={fileId} anchorId={anchorId} contextLabel="Pentru operația 07" expanded={false} onSwitch={setFileId} onToggleExpand={noop} onClose={noop} />;
}

describe("file viewer · focus after switching versions (UX-FINAL)", () => {
  const chain = [dxf("v1", null, 0), dxf("v2", "v1", 1)];

  it("keeps focus on the associated version when „Revino la v1” leaves with its banner", async () => {
    const user = userEvent.setup();
    render(<SwitchingViewer files={chain} start="v2" anchorId="v1" />);
    await user.click(screen.getByRole("button", { name: "Revino la v1" }));

    expect(screen.queryByRole("button", { name: "Revino la v1" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    const associated = screen.getByRole("button", { name: "v1 · asociată" });
    expect(associated).toHaveAttribute("aria-pressed", "true");
    expect(associated).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it("selects v2 again from the keyboard, then returns to v1 without losing focus", async () => {
    const user = userEvent.setup();
    render(<SwitchingViewer files={chain} start="v1" anchorId="v1" />);
    screen.getByRole("button", { name: "v2 · ulterioară" }).focus();
    await user.keyboard("{Enter}");

    const later = screen.getByRole("button", { name: "v2 · ulterioară" });
    expect(later).toHaveAttribute("aria-pressed", "true");
    expect(later).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Consulți v2 (ulterioară). Asocierea rămâne la v1");

    await user.tab({ shift: true });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Revino la v1" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "v1 · asociată" })).toHaveFocus();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
