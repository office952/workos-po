/** Guides constructive BACK fields without changing product identity. */
export const LETTERS_MOUNTING_CONTEXT_FIELD = "constructive.mountingContext" as const;
export const LETTERS_MOUNTING_STANDALONE = "standalone" as const;
export const LETTERS_MOUNTING_ON_ACM_PANEL = "acm_panel" as const;

export type LettersMountingContext =
  | typeof LETTERS_MOUNTING_STANDALONE
  | typeof LETTERS_MOUNTING_ON_ACM_PANEL;

export function isLettersMountingOnAcmPanel(values: { readonly [key: string]: unknown }): boolean {
  return values[LETTERS_MOUNTING_CONTEXT_FIELD] === LETTERS_MOUNTING_ON_ACM_PANEL;
}
