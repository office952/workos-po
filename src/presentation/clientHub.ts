import type { ClientHubSection } from "../routing/appRoute";

export const CLIENT_HUB_SECTION_LABEL: Record<ClientHubSection, string> = {
  istoric: "Istoric",
  lucrari: "Lucrări",
  cereri: "Cereri și oferte",
  documente: "Documente",
  fotografii: "Fotografii",
  sedii: "Sedii",
  comercial: "Date comerciale",
  portofoliu: "Portofoliu",
  fisiere: "Fișiere",
};

/**
 * The sections of the client page, in reading order (N-020 design final · Figma 574:2203 tabs and
 * the phone sheet 588:8844). Istoric comes first; Cereri și oferte is a section of its own.
 */
export const CLIENT_HUB_PRIMARY_SECTIONS = ["istoric", "cereri", "lucrari", "documente", "fotografii", "sedii", "comercial"] as const satisfies readonly ClientHubSection[];

/** What each section holds (phone sheet 588:8844). Lucrări reads its line from the server counts. */
export const CLIENT_HUB_SECTION_HINT: Partial<Record<ClientHubSection, string>> = {
  istoric: "Tot ce s-a făcut, pe ani",
  cereri: "Cereri, oferte, previzualizare",
  documente: "Contracte, facturi, procese-verbale",
  fotografii: "Înainte · simulare · după montaj",
  sedii: "Locuri de montaj și acces",
  comercial: "Facturare, contacte, condiții",
};

/** Sections without a source yet: not in the tabs; a direct link shows "În pregătire". */
export const CLIENT_HUB_PREPARING_SECTIONS = ["portofoliu", "fisiere"] as const satisfies readonly ClientHubSection[];

export type ClientHubPreparingSection = (typeof CLIENT_HUB_PREPARING_SECTIONS)[number];

export function isPreparingSection(section: ClientHubSection): section is ClientHubPreparingSection {
  return (CLIENT_HUB_PREPARING_SECTIONS as readonly string[]).includes(section);
}

export const CLIENT_HUB_FUTURE_COPY: Record<ClientHubPreparingSection, { title: string; body: string }> = {
  portofoliu: {
    title: "În pregătire",
    body: "Lucrările alese pentru portofoliul acestui client vor apărea aici într-o etapă următoare.",
  },
  fisiere: {
    title: "În pregătire",
    body: "Fișierele nu au încă o listă pe client. Până atunci, se găsesc în fișa fiecărei lucrări, la Fișiere.",
  },
};
