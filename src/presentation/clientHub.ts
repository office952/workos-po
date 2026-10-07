import type { ClientHubSection } from "../routing/appRoute";

export const CLIENT_HUB_SECTION_LABEL: Record<ClientHubSection, string> = {
  prezentare: "Prezentare",
  lucrari: "Lucrări",
  cereri: "Cereri și oferte",
  documente: "Documente",
  fotografii: "Fotografii",
  portofoliu: "Portofoliu",
  fisiere: "Fișiere",
};

export const CLIENT_HUB_FUTURE_COPY: Record<
  Extract<ClientHubSection, "documente" | "fotografii" | "portofoliu" | "fisiere">,
  { title: string; body: string }
> = {
  documente: {
    title: "Documentele nu sunt disponibile în această etapă",
    body: "Facturile, contractele și anexele acestui client vor fi disponibile aici într-o etapă următoare.",
  },
  fotografii: {
    title: "Fotografiile nu sunt disponibile în această etapă",
    body: "Fotografiile lucrărilor acestui client vor fi disponibile aici.",
  },
  portofoliu: {
    title: "Portofoliul nu este disponibil în această etapă",
    body: "Lucrările alese pentru portofoliul acestui client vor apărea aici.",
  },
  fisiere: {
    title: "Fișierele nu sunt disponibile în această etapă",
    body: "Fișierele cererilor și lucrărilor acestui client vor fi accesibile aici.",
  },
};
