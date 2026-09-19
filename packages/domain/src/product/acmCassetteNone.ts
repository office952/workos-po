import { ACM_CASSETTE_PANELS_CATEGORY_ID, SIGN_PANELS_FAMILY_ID } from "./catalog.js";
import type { FormSchema, ProductTemplate } from "./types.js";

export const ACM_CASSETTE_NONE_PRODUCT_CODE = "PRD-ACM-CASSETTE-NONE";

export const ACM_GOLDEN_WIDTH_MM = 1000;
export const ACM_GOLDEN_HEIGHT_MM = 500;
export const ACM_GOLDEN_DEPTH_MM = 40;

export const acmCassetteNoneTemplate: ProductTemplate = {
  code: ACM_CASSETTE_NONE_PRODUCT_CODE,
  version: "1",
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
  formSchemaId: "prd-acm-cassette-none-form-v1",
  status: "PILOT",
};

export const acmCassetteNoneFormSchema: FormSchema = {
  id: "prd-acm-cassette-none-form-v1",
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
        {
          id: "root.mountingSystem",
          componentId: "ROOT",
          label: "Sistem de prindere",
          type: "select",
          required: true,
          visibleWhen: { kind: "always" },
          options: [
            { value: "steel_angle", label: "Cornier oțel" },
            { value: "steel_vertical_arm", label: "Braț oțel vertical" },
          ],
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
          min: 1,
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.heightMm",
          componentId: "FACE",
          label: "Înălțime exterioară (mm)",
          type: "number",
          required: true,
          min: 1,
          visibleWhen: { kind: "always" },
        },
        {
          id: "face.cassetteDepthMm",
          componentId: "FACE",
          label: "Adâncime casetă (mm)",
          type: "select",
          required: true,
          visibleWhen: { kind: "always" },
          options: [
            { value: "30", label: "30 mm" },
            { value: "40", label: "40 mm" },
            { value: "50", label: "50 mm" },
          ],
        },
        {
          id: "face.foldCount",
          componentId: "FACE",
          label: "Număr de îndoituri",
          type: "select",
          required: true,
          visibleWhen: { kind: "always" },
          options: [
            { value: "1", label: "O îndoitură" },
            { value: "2", label: "Două îndoituri" },
          ],
          hint: "Adevăr de atelier. Nu schimbă formula cadrului și nu schimbă costul în acest V1.",
        },
      ],
    },
  ],
};
