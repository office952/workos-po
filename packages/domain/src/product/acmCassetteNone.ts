import { ACM_CASSETTE_PANELS_CATEGORY_ID, SIGN_PANELS_FAMILY_ID } from "./catalog.js";
import type { DraftValues, FormSchema, ProductTemplate } from "./types.js";

export const ACM_CASSETTE_NONE_PRODUCT_CODE = "PRD-ACM-CASSETTE-NONE";
export const ACM_CASSETTE_NONE_FORM_SCHEMA_ID = "prd-acm-cassette-none-form-v2";
export const ACM_CASSETTE_NONE_TEMPLATE_VERSION = "2";

export const ACM_GOLDEN_WIDTH_MM = 1000;
export const ACM_GOLDEN_HEIGHT_MM = 500;
export const ACM_GOLDEN_DEPTH_MM = 40;

export const ACM_CASSETTE_NONE_READY_VALUES: DraftValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": ACM_GOLDEN_DEPTH_MM,
};

export const ACM_CASSETTE_NONE_PROOF_VALUES: DraftValues = {
  "root.inscription": "PANOU ACM 3000",
  "face.widthMm": 3000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 80,
  "face.backReturnMm": 25,
};

export const acmCassetteNoneTemplate: ProductTemplate = {
  code: ACM_CASSETTE_NONE_PRODUCT_CODE,
  version: ACM_CASSETTE_NONE_TEMPLATE_VERSION,
  familyId: SIGN_PANELS_FAMILY_ID,
  categoryId: ACM_CASSETTE_PANELS_CATEGORY_ID,
  label: "Panou ACM casetat",
  description:
    "Panou casetat din ACM, fără iluminare. Corpul din foaie ACM și cadrul intern din oțel sunt componente separate.",
  identityFacts: [
    { id: "face.material", label: "Material casetă", value: "ACM 3 mm" },
    { id: "back.material", label: "Cadru intern", value: "Profil oțel" },
    { id: "lighting", label: "Iluminare", value: "Fără iluminare" },
  ],
  fixedValues: {
    "face.materialFamily": "acm",
    "face.thicknessMm": 3,
    "face.finish": "none",
    "back.materialFamily": "steel",
  },
  components: [
    {
      id: "FACE",
      label: "Corp casetă ACM",
      required: true,
      typeId: "ACM_CASSETTE_BODY",
    },
    {
      id: "BACK",
      label: "Cadru intern",
      required: true,
      typeId: "STEEL_INTERNAL_FRAME",
    },
  ],
  formSchemaId: ACM_CASSETTE_NONE_FORM_SCHEMA_ID,
  status: "PILOT",
};

export const acmCassetteNoneFormSchema: FormSchema = {
  id: ACM_CASSETTE_NONE_FORM_SCHEMA_ID,
  templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
  sections: [
    {
      id: "product",
      title: "Produs",
      componentId: "ROOT",
      fields: [
        {
          id: "root.inscription",
          componentId: "ROOT",
          label: "Denumire lucrare",
          type: "text",
          required: true,
          visibleWhen: { kind: "always" },
        },
      ],
    },
    {
      id: "cassette",
      title: "Casetă ACM",
      componentId: "FACE",
      fields: [
        {
          id: "face.widthMm",
          componentId: "FACE",
          label: "Lățime exterioară (mm)",
          type: "number",
          required: true,
          exclusiveMin: 0,
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.heightMm",
          componentId: "FACE",
          label: "Înălțime exterioară (mm)",
          type: "number",
          required: true,
          exclusiveMin: 0,
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.cassetteDepthMm",
          componentId: "FACE",
          label: "Adâncime casetă / prima întoarcere",
          type: "number",
          required: true,
          exclusiveMin: 0,
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.backReturnMm",
          componentId: "FACE",
          label: "A doua întoarcere / buză spate",
          type: "number",
          required: false,
          min: 0,
          visibleWhen: { kind: "always" },
        },
      ],
    },
  ],
};
