import {
  FRONT_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
  LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
} from "./catalog.js";
import { LETTERS_MOUNTING_CONTEXT_FIELD, LETTERS_MOUNTING_ON_ACM_PANEL } from "./lettersMountingContext.js";
import type { FormSchema, ProductTemplate } from "./types.js";

export const CANONICAL_PRODUCT_CODE = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

export const frontlitPlexiAl06Template: ProductTemplate = {
  code: CANONICAL_PRODUCT_CODE,
  version: "1",
  familyId: LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
  categoryId: FRONT_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
  label: "Litere volumetrice luminoase — față plexiglas, volum aluminiu 0,6 mm",
  description:
    "Litere volumetrice luminoase cu iluminare față, față din plexiglas 3 mm opal și volum din aluminiu 0,6 mm.",
  legacyReference: "TPL-VOLUMETRIC-LETTERS_v2",
  identityFacts: [
    { id: "lighting", componentId: "LIGHTING", label: "Iluminare", value: "Iluminare frontală" },
    { id: "face.material", componentId: "FACE", label: "Material față", value: "Plexiglas 3 mm opal" },
    { id: "volume.material", componentId: "VOLUME", label: "Material volum", value: "Aluminiu 0,6 mm" },
    { id: "back.material", componentId: "BACK", label: "Material spate", value: "Forex 10 mm" },
  ],
  fixedValues: {
    "face.materialFamily": "plexiglas",
    "face.thicknessMm": 3,
    "face.opticalType": "opal",
    "volume.materialFamily": "aluminium",
    "volume.thicknessMm": 0.6,
    "back.materialFamily": "forex",
    "back.thicknessMm": 10,
    "lighting.mode": "front_lit",
  },
  formSchemaId: "prd-letters-frontlit-plexi-al06-form-v1",
  status: "PILOT",
  components: [
    { id: "FACE", label: "Față", required: true, typeId: "PLEXIGLAS_FACE" },
    {
      id: "VOLUME",
      label: "Volum",
      required: true,
      typeId: "ALUMINIUM_VOLUME",
    },
    {
      id: "BACK",
      label: "Spate",
      required: true,
      typeId: "FOREX_BACK",
      inputMapping: { confirmedAreaMm2FromComponentId: "FACE" },
    },
    {
      id: "LIGHTING",
      label: "Electrică / iluminare",
      required: true,
      typeId: "LIGHTING_FRONT_LED",
    },
  ],
};

export const frontlitPlexiAl06FormSchema: FormSchema = {
  id: "prd-letters-frontlit-plexi-al06-form-v1",
  templateCode: CANONICAL_PRODUCT_CODE,
  sections: [
    {
      id: "product",
      title: "Produs",
      componentId: "ROOT",
      fields: [
        {
          id: "root.inscription",
          componentId: "ROOT",
          label: "Textul literelor",
          type: "text",
          required: true,
          visibleWhen: { kind: "always" },
        },
      ],
    },
    {
      id: "face",
      title: "Față",
      componentId: "FACE",
      fields: [
        {
          id: "face.finish",
          componentId: "FACE",
          label: "Finisaj față",
          type: "select",
          required: true,
          options: [
            { value: "none", label: "Fără finisaj" },
            { value: "vinyl", label: "Colantat" },
          ],
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.color",
          componentId: "FACE",
          label: "Culoare față",
          type: "text",
          required: true,
          visibleWhen: { kind: "fieldEquals", fieldId: "face.finish", value: "vinyl" },
        },
        {
          id: "face.confirmedAreaMm2",
          componentId: "FACE",
          label: "Suprafață confirmată (mm²)",
          type: "number",
          required: true,
          min: 1,
          visibleWhen: { kind: "always" },
          hint: "Valoare confirmată de operator. Nu este geometrie calculată de WorkOS. Spatele folosește aceeași suprafață.",
        },
      ],
    },
    {
      id: "volume",
      title: "Volum",
      componentId: "VOLUME",
      fields: [
        {
          id: "volume.depthMm",
          componentId: "VOLUME",
          label: "Adâncime volum (mm)",
          type: "select",
          required: true,
          options: [
            { value: "30", label: "30 mm" },
            { value: "60", label: "60 mm" },
            { value: "80", label: "80 mm" },
            { value: "100", label: "100 mm" },
          ],
          visibleWhen: { kind: "always" },
        },
        {
          id: "volume.finish",
          componentId: "VOLUME",
          label: "Finisaj volum",
          type: "select",
          required: true,
          options: [
            { value: "none", label: "Fără finisaj" },
            { value: "vinyl", label: "Colantat" },
            { value: "painted", label: "Vopsit" },
          ],
          visibleWhen: { kind: "always" },
        },
        {
          id: "volume.color",
          componentId: "VOLUME",
          label: "Culoare volum",
          type: "text",
          required: true,
          visibleWhen: {
            kind: "fieldIn",
            fieldId: "volume.finish",
            values: ["vinyl", "painted"],
          },
        },
        {
          id: "volume.confirmedPerimeterMm",
          componentId: "VOLUME",
          label: "Perimetru confirmat (mm)",
          type: "number",
          required: true,
          min: 1,
          visibleWhen: { kind: "always" },
          hint: "Valoare confirmată de operator. Nu este geometrie calculată de WorkOS.",
        },
      ],
    },
    {
      id: "back",
      title: "Spate",
      componentId: "BACK",
      fields: [
        {
          id: "back.supportKind",
          componentId: "BACK",
          label: "Suport constructiv",
          type: "select",
          required: true,
          options: [{ value: "PANEL", label: "Panou" }],
          visibleWhen: {
            kind: "fieldEquals",
            fieldId: LETTERS_MOUNTING_CONTEXT_FIELD,
            value: LETTERS_MOUNTING_ON_ACM_PANEL,
          },
          hint: "Pentru montaj pe panou ACM: spate Forex plan, separat de materialul panoului.",
        },
        {
          id: "back.profile",
          componentId: "BACK",
          label: "Profil spate",
          type: "select",
          required: true,
          options: [{ value: "FLAT", label: "Plan" }],
          visibleWhen: {
            kind: "fieldEquals",
            fieldId: LETTERS_MOUNTING_CONTEXT_FIELD,
            value: LETTERS_MOUNTING_ON_ACM_PANEL,
          },
          hint: "Canalul/cadrul metalic necesită rețetă verificată și nu este încă ofertabil.",
        },
      ],
    },
  ],
};
