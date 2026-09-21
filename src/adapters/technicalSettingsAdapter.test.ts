import { describe, expect, it } from "vitest";
import { presentTechnicalSettingsAdmin } from "./technicalSettingsAdapter";

describe("presentTechnicalSettingsAdmin", () => {
  it("presents resolved starter values without leaking internal DTO names", () => {
    const presented = presentTechnicalSettingsAdmin({
      canEdit: true,
      resolutionOk: true,
      guidance: "Aceste valori sunt folosite la calculul tehnic al lucrărilor noi.",
      settings: [
        {
          definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
          settingId: "ledPitchMm",
          typeId: "LIGHTING_FRONT_LED",
          label: "Pas module LED",
          description: "Distanța aproximativă",
          value: 100,
          unit: "mm",
          source: "PLATFORM_STARTER",
          sourceLabel: "Valoare de pornire",
          version: 1,
          status: "ACTIVE",
          statusLabel: "Activă",
          effectiveFrom: "2026-09-20T00:00:00.000Z",
        },
      ],
      history: [
        {
          definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
          settingId: "ledPitchMm",
          version: 1,
          status: "ACTIVE",
          statusLabel: "Activă",
          source: "PLATFORM_STARTER",
          sourceLabel: "Valoare de pornire",
          value: 100,
          unit: "mm",
          createdAt: "2026-09-20T00:00:00.000Z",
          effectiveFrom: "2026-09-20T00:00:00.000Z",
        },
      ],
    });
    expect(presented?.settings[0]?.value).toBe("100");
    expect(presented?.settings[0]?.sourceLabel).toBe("Valoare de pornire");
    expect(presented?.canEdit).toBe(true);
  });

  it("rejects an unpresentable payload", () => {
    expect(presentTechnicalSettingsAdmin(null)).toBeNull();
  });
});
