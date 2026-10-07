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
    body: "Facturi, contracte și anexe sunt tipuri distincte. Anexele rămân legate de documentul părinte. Plata nu înseamnă factură emisă, iar acceptarea unei oferte nu înseamnă contract semnat.",
  },
  fotografii: {
    title: "Fotografiile vor apărea când vor avea sursă",
    body: "Fotografiile rămân legate de lucrarea din care provin. Hubul nu copiază fișiere și nu deschide încărcare fără contract.",
  },
  portofoliu: {
    title: "Portofoliul nu este publicat din această etapă",
    body: "Portofoliul va selecta din rezultate existente, fără copii de active și fără publicare externă implicită.",
  },
  fisiere: {
    title: "Fișierele rămân la obiectul original",
    body: "Hubul va agrega referințe. Obiectul original și versiunea rămân sursa. Nu există un motor separat de documente aici.",
  },
};
