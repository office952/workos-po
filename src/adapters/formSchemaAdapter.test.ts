import { describe, expect, it } from "vitest";
import {
  presentFormSchema,
  valuesBeforeSchema,
  valuesForTransport,
} from "./formSchemaAdapter";

const schema = presentFormSchema({
  id: "form",
  sections: [
    {
      id: "volume",
      title: "Volum",
      fields: [
        { id: "volume.depthMm", label: "Adâncime", type: "select", required: true },
        {
          id: "volume.confirmedPerimeterMm",
          label: "Perimetru",
          type: "number",
          required: true,
        },
      ],
    },
  ],
});

describe("form schema adapter", () => {
  it("coerces number fields for transport without calculating cost", () => {
    expect(
      valuesForTransport(
        {
          "volume.depthMm": "60",
          "volume.confirmedPerimeterMm": "12500",
        },
        schema,
      ),
    ).toEqual({
      "volume.depthMm": "60",
      "volume.confirmedPerimeterMm": 12500,
    });
  });

  it("coerces numeric drafts before schema arrives without seeding product values", () => {
    expect(
      valuesBeforeSchema({
        "volume.confirmedPerimeterMm": "12500",
        "root.inscription": "abc",
      }),
    ).toEqual({
      "root.inscription": "abc",
      "volume.confirmedPerimeterMm": 12500,
    });
  });
});
