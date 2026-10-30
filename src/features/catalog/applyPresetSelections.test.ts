import { describe, expect, it } from "vitest";
import { applyPresetSelections } from "./applyPresetSelections";

describe("applyPresetSelections", () => {
  it("sets the published choices and leaves job facts untouched", () => {
    const drafts = { "root.inscription": "ACME", "face.confirmedAreaMm2": "20", "volume.depthMm": "30" };
    const next = applyPresetSelections(drafts, [
      { fieldId: "volume.depthMm", value: "80" },
      { fieldId: "volume.finish", value: "painted" },
    ]);
    expect(next["root.inscription"]).toBe("ACME");
    expect(next["face.confirmedAreaMm2"]).toBe("20");
    expect(next["volume.depthMm"]).toBe("80");
    expect(drafts["volume.depthMm"]).toBe("30");
  });
});
