import {
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import type { FormSchema, ProductTemplate } from "./types.js";

/**
 * Opt-in constructive variant in the SAME existing configurator.
 * Distinct product identity preserves all previous v1 template snapshots.
 * Not included in platform default enablement; Owner enables after review.
 */
export const FRONTLIT_FLAT_BACK_PRODUCT_CODE = "PRD-LETTERS-FRONTLIT-PLEXI-AL06-FLAT-BACK";
const FORM_ID = "prd-letters-frontlit-plexi-al06-flat-back-form-v1";

export const frontlitFlatBackTemplate: ProductTemplate = {
  ...frontlitPlexiAl06Template,
  code: FRONTLIT_FLAT_BACK_PRODUCT_CODE,
  version: "1",
  formSchemaId: FORM_ID,
  label: "Litere volumetrice — spate plan pe panou",
  description: "Varianta constructivă pentru suport panou și spate Forex plan; aceeași configurație de Față, Volum și iluminare frontală.",
  identityFacts: [
    ...frontlitPlexiAl06Template.identityFacts,
    { id: "back.profile", componentId: "BACK", label: "Profil spate", value: "Plan, pentru panou" },
  ],
};

export const frontlitFlatBackFormSchema: FormSchema = {
  ...frontlitPlexiAl06FormSchema,
  id: FORM_ID,
  templateCode: FRONTLIT_FLAT_BACK_PRODUCT_CODE,
  sections: [
    ...frontlitPlexiAl06FormSchema.sections,
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
          visibleWhen: { kind: "always" },
          hint: "Această variantă folosește spate plan pe panou. Cadrul metalic cu canal necesită rețetă de frezare și nu este încă ofertabil.",
        },
        {
          id: "back.profile",
          componentId: "BACK",
          label: "Profil spate",
          type: "select",
          required: true,
          options: [{ value: "FLAT", label: "Plan" }],
          visibleWhen: { kind: "always" },
          hint: "Calculul materialului și debitarea CNC provin din rețetele existente.",
        },
      ],
    },
  ],
};
