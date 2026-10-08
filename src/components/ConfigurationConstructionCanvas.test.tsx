import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreviewTransport } from "../api/types";
import { buildWorkbenchSections } from "../configuration/workbenchModel";
import { ConfigurationConstructionCanvas } from "./ConfigurationConstructionCanvas";

const preview: PreviewTransport = {
  product: { code: "p", label: "Litere", identityFacts: [] },
  values: {},
  formSchema: {
    id: "f",
    sections: [
      { id: "face", title: "Față", componentId: "FACE", fields: [] },
      { id: "back", title: "Spate", componentId: "BACK", fields: [] },
    ],
  },
  selectedComponents: [
    { id: "FACE", label: "Față" },
    { id: "BACK", label: "Spate" },
  ],
  readiness: "blocked",
  missing: [],
  reviewId: null,
  installation: { selected: false, prequoteReady: false, incompleteReasons: [] },
};

describe("ConfigurationConstructionCanvas", () => {
  it("highlights the active stack layer and forwards selection", async () => {
    const onSelect = vi.fn();
    const sections = buildWorkbenchSections(preview);
    render(
      <ConfigurationConstructionCanvas
        preview={preview}
        sections={sections}
        activeSection={sections[1]}
        compositionSelected={false}
        drafts={{}}
        onSelectComponent={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Selectează Față" }));
    expect(onSelect).toHaveBeenCalledWith("FACE");
    expect(screen.getByRole("button", { name: "Selectează Spate" })).toBeInTheDocument();
  });
});
