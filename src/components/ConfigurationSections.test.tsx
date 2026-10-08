import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreviewTransport } from "../api/types";
import { ConfigurationSections } from "./ConfigurationSections";

const preview: PreviewTransport = {
  product: { code: "synthetic-product", label: "Produs sintetic", identityFacts: [
    { id: "fixed-material", componentId: "BACK", label: "Material fix", value: "Material definit în catalog" },
  ] },
  values: {},
  formSchema: { id: "synthetic-form", sections: [
    { id: "root", title: "Produs", fields: [
      { id: "name", label: "Denumire", type: "text", required: true, options: [] },
    ] },
    { id: "dimension", title: "Dimensiuni", fields: [
      { id: "depth", label: "Adâncime", type: "select", required: true,
        options: [{ value: "60", label: "60 mm" }, { value: "80", label: "80 mm" }] },
      { id: "area", label: "Suprafață", type: "number", required: true, options: [] },
    ] },
  ] },
  selectedComponents: [{ id: "BACK", label: "Spate" }],
  readiness: "blocked", missing: [{ label: "Suprafață", fieldId: "area" }], reviewId: null,
  installation: { selected: false, prequoteReady: false, incompleteReasons: [] },
};

function Harness() {
  const [drafts, setDrafts] = useState({ name: "NORD", depth: "60", area: "" });
  return <ConfigurationSections preview={preview} drafts={drafts}
    onChange={(field, value) => setDrafts((current) => ({ ...current, [field]: value }))} />;
}

describe("ConfigurationSections", () => {
  it("synchronizes outline, construction and inspector and focuses an explicitly bound dependency", async () => {
    const onChange = vi.fn();
    const bound: PreviewTransport = { ...preview, formSchema: { ...preview.formSchema!, sections: [preview.formSchema!.sections[0], { ...preview.formSchema!.sections[1], componentId: "FACE" }] }, componentDetails: [{
      componentId: "BACK", label: "Spate", typeId: "BACK_TYPE", calculationLabel: "Calculat", facts: [],
      inputFields: [{ fieldId: "area", label: "Suprafață", value: "45000 mm²", componentLabel: "Față" }],
      unavailable: [], hasTechnicalSettings: false, hasFormulas: false,
    }] };
    render(<ConfigurationSections preview={bound} drafts={{ area: "45000" }} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Inspectează Spate" }));
    expect(screen.getByRole("button", { name: "Spate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Setări: Spate" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Modifică Suprafață" }));
    expect(screen.getByRole("region", { name: "Setări: Dimensiuni" })).toBeVisible();
    expect(screen.getByLabelText("Suprafață")).toHaveFocus();
    expect(screen.getByLabelText("Suprafață")).toHaveValue("45000");
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Context și componente" }), "component:BACK");
    expect(screen.getByRole("button", { name: "Inspectează Spate" })).toHaveAttribute("aria-pressed", "true");
  });
  it("keeps one visible editor, option labels and drafts while switching sections", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.getByRole("region", { name: "Setări: Produs" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Setări: Dimensiuni" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dimensiuni" })).toHaveTextContent("60 mm");
    await user.click(screen.getByRole("button", { name: "Dimensiuni" }));
    await user.selectOptions(screen.getByLabelText("Adâncime"), "80");
    await user.type(screen.getByLabelText("Suprafață"), "45000");
    await user.click(screen.getByRole("button", { name: "Produs" }));
    expect(screen.getByLabelText("Denumire")).toHaveValue("NORD");
    await user.click(screen.getByRole("button", { name: "Dimensiuni" }));
    expect(screen.getByLabelText("Adâncime")).toHaveValue("80");
    expect(screen.getByLabelText("Suprafață")).toHaveValue("45000");
    expect(screen.getByRole("button", { name: "Dimensiuni" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens and focuses a server-reported missing field in another section", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Completează: Suprafață" }));
    expect(screen.getByRole("region", { name: "Setări: Dimensiuni" })).toBeVisible();
    expect(screen.getByLabelText("Suprafață")).toHaveFocus();
  });

  it("shows fixed product truth as read-only composition and preserves edited values", async () => {
    const onChange = vi.fn();
    render(<ConfigurationSections preview={preview} drafts={{ name: "NORD", depth: "60" }} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Compoziție/ }));
    expect(screen.getByRole("region", { name: "Compoziția produsului" })).toHaveTextContent("Material definit în catalog");
    expect(screen.getByRole("region", { name: "Compoziția produsului" })).toHaveTextContent("Spate");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "← Înapoi" }));
    expect(screen.getByRole("region", { name: "Setări: Spate" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "← Înapoi" }));
    expect(screen.getByLabelText("Adâncime")).toHaveValue("60");
  });

  it("exposes all selected components without duplicating schema-bound editors or inventing controls", async () => {
    const onChange = vi.fn();
    const complete: PreviewTransport = {
      ...preview,
      product: { ...preview.product, identityFacts: [
        ...preview.product.identityFacts,
        { id: "lighting", componentId: "LIGHTING", label: "Iluminare", value: "Iluminare frontală" },
      ] },
      formSchema: { id: "complete", sections: [
        preview.formSchema!.sections[0],
        { ...preview.formSchema!.sections[1], componentId: "VOLUME", title: "Volum" },
        { id: "face", componentId: "FACE", title: "Față", fields: [
          { id: "finish", label: "Finisaj", type: "text", required: false, options: [] },
        ] },
      ] },
      selectedComponents: [
        { id: "FACE", label: "Față" }, { id: "VOLUME", label: "Volum" },
        { id: "BACK", label: "Spate" }, { id: "LIGHTING", label: "Electrică / iluminare" },
      ],
    };
    render(<ConfigurationSections preview={complete} drafts={{ depth: "60" }} onChange={onChange} />);
    const user = userEvent.setup();
    expect(screen.getAllByRole("button", { name: "Față" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Volum" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Spate" }));
    const back = screen.getByRole("region", { name: "Setări: Spate" });
    expect(back).toHaveTextContent("Material definit în catalog");
    expect(back).not.toHaveTextContent("Iluminare frontală");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi definiția produsului" })).toHaveAttribute("href", "/catalog?product=synthetic-product");
    await user.click(screen.getByRole("button", { name: "Electrică / iluminare" }));
    expect(screen.getByRole("region", { name: "Setări: Electrică / iluminare" })).toHaveTextContent("Iluminare frontală");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Volum" }));
    expect(screen.getByLabelText("Adâncime")).toHaveValue("60");
  });

  it("does not create lighting from a product identity fact when that component is absent", () => {
    render(<ConfigurationSections preview={{ ...preview, product: { ...preview.product, identityFacts: [
      { id: "lighting", label: "Iluminare", value: "Fără iluminare" },
    ] } }} drafts={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Electrică|Iluminare/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spate" })).toBeInTheDocument();
  });

  it("follows a changing server schema without retaining unsupported controls", async () => {
    const { rerender } = render(<ConfigurationSections preview={preview} drafts={{ depth: "60" }} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Dimensiuni" }));
    rerender(<ConfigurationSections preview={{ ...preview, missing: [], formSchema: {
      id: "conditional-form", sections: [preview.formSchema!.sections[0]],
    } }} drafts={{ depth: "60" }} onChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Setări: Produs" })).toBeVisible();
    expect(screen.queryByLabelText("Adâncime")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completează: Suprafață" })).not.toBeInTheDocument();
  });

  it("does not infer missing fields or readiness from empty drafts", () => {
    render(<ConfigurationSections preview={{ ...preview, readiness: "ready", missing: [], reviewId: "review" }} drafts={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Completează:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dimensiuni" })).not.toHaveTextContent("De completat");
  });
});
