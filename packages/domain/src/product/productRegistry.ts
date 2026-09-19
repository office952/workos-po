import { acmCassetteNoneFormSchema, acmCassetteNoneTemplate } from "./acmCassetteNone.js";
import { frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import type { FormSchema, ProductTemplate } from "./types.js";

export const productTemplates: readonly ProductTemplate[] = [
  frontlitPlexiAl06Template,
  acmCassetteNoneTemplate,
];

export const formSchemas: readonly FormSchema[] = [
  frontlitPlexiAl06FormSchema,
  acmCassetteNoneFormSchema,
];

export function getProductTemplate(code: string): ProductTemplate | undefined {
  return productTemplates.find((item) => item.code === code);
}

export function getFormSchema(id: string): FormSchema | undefined {
  return formSchemas.find((item) => item.id === id);
}

export function getFormSchemaForTemplate(code: string): FormSchema | undefined {
  const template = getProductTemplate(code);
  return template ? getFormSchema(template.formSchemaId) : undefined;
}
