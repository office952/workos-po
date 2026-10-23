import type { ClientHubSection } from "../routing/appRoute";

export const CLIENT_HUB_SECTION_LABEL: Record<ClientHubSection, string> = {
  prezentare: "Relație",
  lucrari: "Lucrări",
  cereri: "Cereri și oferte",
  documente: "Documente",
  fotografii: "Fotografii",
  portofoliu: "Portofoliu",
  fisiere: "Fișiere",
};

/** The working sections of the client page, in reading order (V2.2 · 183:4345). */
export const CLIENT_HUB_PRIMARY_SECTIONS = ["prezentare", "cereri", "lucrari"] as const satisfies readonly ClientHubSection[];

/** Sections without a source yet: grouped under "Mai multe" and marked "În pregătire". */
export const CLIENT_HUB_PREPARING_SECTIONS = ["documente", "fotografii", "portofoliu", "fisiere"] as const satisfies readonly ClientHubSection[];

export type ClientHubPreparingSection = (typeof CLIENT_HUB_PREPARING_SECTIONS)[number];

export function isPreparingSection(section: ClientHubSection): section is ClientHubPreparingSection {
  return (CLIENT_HUB_PREPARING_SECTIONS as readonly string[]).includes(section);
}

export const CLIENT_HUB_FUTURE_COPY: Record<ClientHubPreparingSection, { title: string; body: string }> = {
  documente: {
    title: "În pregătire",
    body: "Facturile, contractele și anexele acestui client vor fi disponibile aici într-o etapă următoare.",
  },
  fotografii: {
    title: "În pregătire",
    body: "Fotografiile lucrărilor acestui client vor fi disponibile aici într-o etapă următoare.",
  },
  portofoliu: {
    title: "În pregătire",
    body: "Lucrările alese pentru portofoliul acestui client vor apărea aici într-o etapă următoare.",
  },
  fisiere: {
    title: "În pregătire",
    body: "Fișierele nu au încă o listă pe client. Până atunci, se găsesc în fișa fiecărei lucrări, la Fișiere.",
  },
};
